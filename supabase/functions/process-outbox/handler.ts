import { OpenWAClient } from '@synculariti/whatsapp-client';

export interface DatabaseWebhookPayload<T> {
  type: 'INSERT' | 'UPDATE' | 'DELETE';
  table: string;
  schema: string;
  record: T;
  old_record: T | null;
}

export interface OutboxRecord {
  id: string;
  tenant_id: string;
  recipient_phone: string;
  status: 'PENDING' | 'SENT' | 'FAILED';
  payload: {
    type: 'text' | 'poll';
    text?: string;
    name?: string;
    options?: string[];
  };
}

export async function processOutboxEvent(
  event: DatabaseWebhookPayload<OutboxRecord>,
  supabase: any,
  sidecarUrl: string,
  sidecarApiKey: string
): Promise<void> {
  const { record } = event;

  if (!record || record.status !== 'PENDING') {
    return; // Only process new pending messages
  }

  const client = new OpenWAClient({
    baseUrl: sidecarUrl,
    apiKey: sidecarApiKey,
    sessionId: 'synculariti-bot' // Default session
  });

  const jid = `${record.recipient_phone}@c.us`;
  let success = false;

  try {
    if (record.payload.type === 'text' && record.payload.text) {
      success = await client.sendText(jid, record.payload.text);
    } 
    else if (record.payload.type === 'poll' && record.payload.name && record.payload.options) {
      // In production, NEXT_PUBLIC_BASE_URL would be passed or constructed from env
      const webhookUrl = `${process.env.NEXT_PUBLIC_BASE_URL || 'https://synculariti-et.vercel.app'}/api/whatsapp/webhook`;
      success = await client.sendPoll(jid, record.payload.name, record.payload.options, webhookUrl);
    }

    // Update status in the outbox
    const newStatus = success ? 'SENT' : 'FAILED';
    await supabase
      .from('whatsapp_outbox')
      .update({ status: newStatus })
      .eq('id', record.id);

  } catch (error) {
    console.error(`Failed to process outbox event for ${record.id}:`, error);
    await supabase
      .from('whatsapp_outbox')
      .update({ status: 'FAILED' })
      .eq('id', record.id);
  }
}
