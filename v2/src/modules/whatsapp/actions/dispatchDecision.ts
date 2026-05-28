'use server';

import { getErrorMessage } from '@synculariti/whatsapp-client';
import { ServerLogger } from '@/lib/logger-server';
import { createClient } from '@/lib/supabase-server';
import { completeAction } from '@/modules/whatsapp/lib/complete-action';
import { fireWebhook } from '@/modules/whatsapp/lib/fire-webhook';

export async function dispatchDecision(
  actionId: string,
  decision: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const supabase = await createClient();

    const { data: result, error: rpcError } = await completeAction(supabase, actionId, decision);

    if (rpcError) {
      await ServerLogger.system('ERROR', 'WhatsApp', 'RPC call failed', {
        outboxId: actionId, error: rpcError, hints: null,
      });
      return { success: false, error: `Action failed: ${rpcError}` };
    }

    if (!result || result.status === 'NOT_FOUND') {
      return { success: false, error: 'Action not found, already completed, or expired' };
    }

    // Build and dispatch webhook (best-effort after atomic status update)
    const payload = {
      type: 'poll_vote' as const,
      outboxId: actionId,
      recipientPhone: result.payload?.recipient_phone || result.webhook_url || '',
      tenantId: result.payload?.tenant_id || '',
      decision,
      timestamp: Date.now(),
    };

    const webhookResult = await fireWebhook(
      result.webhook_url || '',
      result.webhook_secret,
      payload,
    );

    if (!webhookResult.ok) {
      await ServerLogger.system('WARN', 'WhatsApp', 'Webhook delivery failed after atomic completion', {
        outboxId: actionId,
        webhookStatus: webhookResult.status,
      });
    }

    return { success: true };
  } catch (e: unknown) {
    const errorMsg = getErrorMessage(e);
    return { success: false, error: `Server action crash: ${errorMsg}` };
  }
}
