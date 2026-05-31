import { signHmacPayload } from '@synculariti/whatsapp-client';
import { HEADER_CONTENT_TYPE, CONTENT_TYPE_JSON } from '@/lib/constants';

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
  if (!url) {
    return { ok: true, status: 204 };
  }

  const payloadString = JSON.stringify(payload);
  const signature = await signHmacPayload(payloadString, secret);

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      [HEADER_CONTENT_TYPE]: CONTENT_TYPE_JSON,
      'X-OpenWA-Signature': signature,
    },
    body: payloadString,
  });

  return { ok: response.ok, status: response.status };
}
