'use server';

import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { signHmacPayload, getErrorMessage } from '@synculariti/whatsapp-client';
import { ServerLogger } from '@/lib/logger-server';

export async function dispatchDecision(
  actionId: string,
  decision: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const cookieStore = await cookies();
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL || '',
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '',
      {
        cookies: {
          get(name: string) { return cookieStore.get(name)?.value; },
          set(name: string, value: string, options: CookieOptions) {
            try { cookieStore.set({ name, value, ...options }); } catch { /* Server Component */ }
          },
          remove(name: string, options: CookieOptions) {
            try { cookieStore.set({ name, value: '', ...options }); } catch { /* Server Component */ }
          },
        },
      }
    );

    type CompleteActionResult = {
      status: string;
      webhook_url: string | null;
      webhook_secret: string;
      payload: {
        recipient_phone?: string;
        tenant_id?: string;
      } | null;
    };

    // Atomic: mark COMPLETED + get webhook config in one transaction
    const { data: result, error: rpcError } = await supabase
      .rpc('complete_whatsapp_action_v1', {
        p_outbox_id: actionId,
        p_decision: decision,
      })
      .maybeSingle<CompleteActionResult>();

    if (rpcError || !result || result.status === 'NOT_FOUND') {
      return { success: false, error: 'Action not found, already completed, or expired' };
    }

    // Build and sign the webhook payload
    const payload = {
      type: 'poll_vote' as const,
      outboxId: actionId,
      recipientPhone: result.payload?.recipient_phone || result.webhook_url,
      tenantId: result.payload?.tenant_id,
      decision,
      timestamp: Date.now(),
    };
    const payloadString = JSON.stringify(payload);
    const signature = await signHmacPayload(payloadString, result.webhook_secret);

    // Fire webhook (best-effort after atomic status update)
    const response = await fetch(result.webhook_url || '', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-OpenWA-Signature': signature,
      },
      body: payloadString,
    });

    if (!response.ok) {
      await ServerLogger.system('WARN', 'WhatsApp', 'Webhook delivery failed after atomic completion', {
        outboxId: actionId,
        webhookStatus: response.status,
      });
    }

    return { success: true };
  } catch (e: unknown) {
    const errorMsg = getErrorMessage(e);
    return { success: false, error: `Server action crash: ${errorMsg}` };
  }
}
