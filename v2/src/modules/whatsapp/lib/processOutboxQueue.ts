import { OpenWAClient } from '@synculariti/whatsapp-client';
import type { SupabaseClient } from '@supabase/supabase-js';
import { ServerLogger } from '@/lib/logger-server';
import { getErrorMessage } from '@/lib/utils';
import type { OutboxRecord } from '../types';

export async function processOutboxQueue(
  supabase: SupabaseClient,
  client: OpenWAClient,
  baseUrl: string,
  records?: OutboxRecord[]
): Promise<{ processed: number; failed: number }> {
  let recordsToProcess = records;

  if (!recordsToProcess) {
    let claimed: OutboxRecord[] | null = null;
    try {
      const result = await supabase.rpc('claim_whatsapp_outbox_batch', {
        p_batch_size: 10,
      });
      claimed = result.data;
    } catch {
      claimed = null;
    }

    if (claimed && claimed.length > 0) {
      recordsToProcess = claimed;
    } else {
      const { data: pending } = await supabase
        .from('whatsapp_outbox')
        .select('*')
        .in('status', ['PENDING', 'FAILED'])
        .order('created_at', { ascending: true })
        .limit(10);
      recordsToProcess = pending || [];
    }
  }

  if (!recordsToProcess || recordsToProcess.length === 0) {
    return { processed: 0, failed: 0 };
  }

  let processed = 0;
  let failed = 0;

  for (const record of recordsToProcess) {
    try {
      const jid = `${record.recipient_phone}@c.us`;
      let success = false;

      if (record.payload?.type === 'text' && record.payload.text) {
        success = await client.sendText(jid, record.payload.text);
      } else if (record.payload?.type === 'poll' && record.payload.name && record.payload.options) {
        const optionsText = record.payload.options.map((o, i) => `${i + 1}. ${o}`).join('\n');
        const actionUrl = `${baseUrl}/action/${record.id}`;
        const msg = `📋 ${record.payload.name}\n\n${optionsText}\n\nTap here to respond: ${actionUrl}`;
        success = await client.sendText(jid, msg);
      }

      await supabase.rpc('set_outbox_delivery_result_v1', {
        p_outbox_id: record.id,
        p_success: success,
      });

      if (success) {
        processed++;
        await ServerLogger.system('INFO', 'WhatsApp', `Delivered to ${record.recipient_phone}`, {
          outboxId: record.id,
          tenantId: record.tenant_id,
        });
      } else {
        failed++;
        await ServerLogger.system('WARN', 'WhatsApp', `Delivery failed for ${record.recipient_phone}`, {
          outboxId: record.id,
          tenantId: record.tenant_id,
        });
      }
    } catch (err: unknown) {
      failed++;
      await ServerLogger.system('WARN', 'WhatsApp', 'Delivery exception', {
        outboxId: record.id,
        error: getErrorMessage(err),
      });
      await supabase
        .rpc('set_outbox_delivery_result_v1', {
          p_outbox_id: record.id,
          p_success: false,
        });
    }
  }

  return { processed, failed };
}
