export const runtime = 'edge';

import { NextResponse } from 'next/server';
import { verifyWebhookSignature } from '@synculariti/whatsapp-client/src/hmac'; // Direct import due to tsconfig exports setup in monorepo
import { ServerLogger } from '@/lib/logger-server';

export async function POST(req: Request) {
  try {
    const signature = req.headers.get('X-OpenWA-Signature');
    if (!signature) {
      return NextResponse.json({ error: 'Missing signature' }, { status: 401 });
    }

    const bodyText = await req.text();
    const secret = process.env.OPENWA_WEBHOOK_SECRET || '';

    const isValid = await verifyWebhookSignature(bodyText, signature, secret);
    
    if (!isValid) {
      await ServerLogger.system('WARN', 'WhatsApp', `Invalid webhook signature`);
      return NextResponse.json({ error: 'Invalid signature' }, { status: 403 });
    }

    // TODO (Phase 5/Execution): Write to whatsapp_inbox table.
    
    return NextResponse.json({ success: true }, { status: 200 });
  } catch (e: any) {
    await ServerLogger.system('ERROR', 'WhatsApp', `Webhook processing error`, { error: e.message });
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
