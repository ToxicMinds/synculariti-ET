export const runtime = 'edge';

import { NextResponse } from 'next/server';
import { getErrorMessage } from '@synculariti/whatsapp-client';
import { ServerLogger } from '@/lib/logger-server';
import { createServiceClient } from '@/lib/supabase-server';
import { verifyWebhookRequest } from '@/modules/whatsapp/lib/verify-webhook';
import { resolveOutboxContext } from '@/modules/whatsapp/lib/resolve-outbox';
import { insertInboxRecord } from '@/modules/whatsapp/lib/insert-inbox';
import { DecisionRouter } from '@/modules/whatsapp/lib/decision-router';

const router = new DecisionRouter();

export async function POST(req: Request) {
  try {
    const signature = req.headers.get('X-OpenWA-Signature');
    const bodyText = await req.text();

    const isValid = await verifyWebhookRequest(bodyText, signature);
    if (!isValid) {
      return NextResponse.json({ error: 'Missing or invalid signature' }, { status: signature ? 403 : 401 });
    }

    const body = JSON.parse(bodyText);

    const { tenantId, outboxId, outboxRecord } = await resolveOutboxContext(body);

    if (!tenantId) {
      await ServerLogger.system('WARN', 'WhatsApp', 'No tenant context found for inbound webhook', { sender: body.sender });
      return NextResponse.json({ error: 'Tenant context not found' }, { status: 400 });
    }

    const decision = body.selectedOption || body.decision || body.content || '';
    const senderPhone = body.sender || body.recipientPhone || 'unknown';

    await insertInboxRecord({
      tenantId,
      outboxId,
      senderPhone,
      messageId: body.pollMessageId || body.messageId || 'unknown',
      messageType: body.type,
      content: decision,
    });

    if (outboxRecord && outboxId && decision) {
      const supabase = createServiceClient();
      const metadata = outboxRecord.payload?.metadata || {};

      await ServerLogger.system('INFO', 'WhatsApp', 'Routing outbox decision execution', {
        outboxId,
        decision,
        metadata,
      });

      try {
        await router.route(tenantId, outboxId, decision, senderPhone, metadata);

        await supabase.rpc('complete_whatsapp_action_v1', {
          p_outbox_id: outboxId,
          p_decision: decision,
        });
      } catch (err: unknown) {
        const errorMsg = getErrorMessage(err);
        await ServerLogger.system('ERROR', 'WhatsApp', 'Business service processing failed', {
          outboxId,
          error: errorMsg,
        });
      }
    }

    await ServerLogger.system('INFO', 'WhatsApp', 'Successfully processed inbound WhatsApp webhook', {
      tenantId,
      type: body.type,
    });

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (e: unknown) {
    const errMsg = getErrorMessage(e);
    await ServerLogger.system('ERROR', 'WhatsApp', 'Webhook processing error', { error: errMsg });
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
