import { createServiceClient } from '@/lib/supabase-server';

export interface InboxInput {
  tenantId: string;
  outboxId: string | null;
  senderPhone: string;
  messageId: string;
  messageType: string;
  content: string;
}

export async function insertInboxRecord(input: InboxInput): Promise<void> {
  const supabase = createServiceClient();

  const { error } = await supabase.rpc('insert_whatsapp_inbox_v1', {
    p_tenant_id: input.tenantId,
    p_outbox_id: input.outboxId,
    p_sender_phone: input.senderPhone,
    p_message_id: input.messageId,
    p_message_type: input.messageType,
    p_content: input.content,
  });

  if (error) throw error;
}
