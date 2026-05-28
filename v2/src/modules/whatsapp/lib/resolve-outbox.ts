import { createServiceClient } from '@/lib/supabase-server';
import type { OutboxRecord } from '@/modules/whatsapp/types';

interface WebhookBody {
  outboxId?: string;
  type?: string;
  pollMessageId?: string;
  sender?: string;
}

export interface OutboxResolution {
  tenantId: string;
  outboxId: string | null;
  outboxRecord: OutboxRecord | null;
}

export async function resolveOutboxContext(body: WebhookBody): Promise<OutboxResolution> {
  const supabase = createServiceClient();

  let tenantId = '';
  let outboxId: string | null = null;
  let outboxRecord: OutboxRecord | null = null;

  const outboxQuery = supabase.from('whatsapp_outbox');

  if (body.outboxId) {
    const { data: outbox } = await outboxQuery
      .select('*')
      .eq('id', body.outboxId)
      .single();
    if (outbox) {
      outboxId = outbox.id;
      tenantId = outbox.tenant_id;
      outboxRecord = outbox as OutboxRecord;
    }
  } else if (body.type === 'poll_vote' && body.pollMessageId) {
    const { data: outbox } = await outboxQuery
      .select('*')
      .eq('whatsapp_message_id', body.pollMessageId)
      .single();
    if (outbox) {
      outboxId = outbox.id;
      tenantId = outbox.tenant_id;
      outboxRecord = outbox as OutboxRecord;
    }
  } else if (body.sender) {
    const { data: outbox } = await outboxQuery
      .select('*')
      .eq('recipient_phone', body.sender)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();
    if (outbox) {
      outboxId = outbox.id;
      tenantId = outbox.tenant_id;
      outboxRecord = outbox as OutboxRecord;
    }
  }

  return { tenantId, outboxId, outboxRecord };
}
