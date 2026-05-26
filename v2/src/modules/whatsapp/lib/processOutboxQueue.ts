import { OpenWAClient } from '@synculariti/whatsapp-client';
import type { SupabaseClient } from '@supabase/supabase-js';
import { ServerLogger } from '@/lib/logger-server';

interface OutboxRecord {
  id: string;
  tenant_id: string;
  recipient_phone: string;
  payload: {
    type: 'text' | 'poll';
    text?: string | null;
    name?: string | null;
    options?: string[] | null;
    metadata?: Record<string, unknown>;
  };
  webhook_url?: string | null;
}

export async function processOutboxQueue(
  supabase: SupabaseClient,
  client: OpenWAClient,
  baseUrl: string,
  records?: OutboxRecord[]
): Promise<{ processed: number; failed: number }> {
  let recordsToProcess = records;

  if (!recordsToProcess) {
    const { data: claimed } = await supabase.rpc('claim_whatsapp_outbox_batch', {
      p_batch_size: 10,
    }).catch(() => ({ data: null }));

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
        const webhookUrl = record.webhook_url || `${baseUrl}/api/whatsapp/webhook`;
        success = await client.sendPoll(jid, record.payload.name, record.payload.options, webhookUrl);
      }

      await supabase
        .from('whatsapp_outbox')
        .update({
          status: success ? 'SENT' : 'FAILED',
          processed_at: new Date().toISOString(),
        })
        .eq('id', record.id);

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
    } catch (err) {
      failed++;
      await supabase
        .from('whatsapp_outbox')
        .update({
          status: 'FAILED',
          processed_at: new Date().toISOString(),
        })
        .eq('id', record.id);
    }
  }

  return { processed, failed };
}
