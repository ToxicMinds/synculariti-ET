import { verifyWebhookSignature } from '@synculariti/whatsapp-client';
import { ServerLogger } from '@/lib/logger-server';

export async function verifyWebhookRequest(bodyText: string, signature: string | null): Promise<boolean> {
  if (!signature) return false;

  const secret = process.env.OPENWA_WEBHOOK_SECRET || '';
  const isValid = await verifyWebhookSignature(bodyText, signature, secret);

  if (!isValid) {
    await ServerLogger.system('WARN', 'WhatsApp', 'Invalid webhook signature');
  }

  return isValid;
}
