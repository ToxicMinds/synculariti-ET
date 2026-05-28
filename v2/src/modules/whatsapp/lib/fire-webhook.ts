import { signHmacPayload } from '@synculariti/whatsapp-client';

interface WebhookPayload {
  type: 'poll_vote';
  outboxId: string;
  recipientPhone: string;
  tenantId: string;
  decision: string;
  timestamp: number;
}

export async function fireWebhook(
  url: string,
  secret: string,
  payload: WebhookPayload
): Promise<{ ok: boolean; status: number }> {
  const payloadString = JSON.stringify(payload);
  const signature = await signHmacPayload(payloadString, secret);

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-OpenWA-Signature': signature,
    },
    body: payloadString,
  });

  return { ok: response.ok, status: response.status };
}
