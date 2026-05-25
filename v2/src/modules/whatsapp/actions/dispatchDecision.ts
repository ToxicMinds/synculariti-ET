'use server';

import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { signHmacPayload } from '@synculariti/whatsapp-client';

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
          get(name: string) {
            return cookieStore.get(name)?.value;
          },
          set(name: string, value: string, options: CookieOptions) {
            try {
              cookieStore.set({ name, value, ...options });
            } catch (e: unknown) {
              // Server Component context — sets are handled via middleware
            }
          },
          remove(name: string, options: CookieOptions) {
            try {
              cookieStore.set({ name, value: '', ...options });
            } catch (e: unknown) {
              // Server Component context — removes are handled via middleware
            }
          }
        }
      }
    );

    // 1. Fetch the outbox item — verify existence and PENDING state atomically
    const { data: record, error } = await supabase
      .from('whatsapp_outbox')
      .select('*')
      .eq('id', actionId)
      .single();

    if (error || !record) {
      return { success: false, error: 'Action not found or expired' };
    }

    if (record.status !== 'PENDING') {
      return { success: false, error: 'This action has already been completed or expired' };
    }

    // 2. Package the decision payload (imitates a standard poll_vote webhook event)
    const payload = {
      type: 'poll_vote',
      outboxId: record.id,
      recipientPhone: record.recipient_phone,
      tenantId: record.tenant_id,
      decision,
      timestamp: Date.now()
    };

    const payloadString = JSON.stringify(payload);

    // 3. Sign using shared HMAC utility (DRY: same algorithm as sidecar.ts)
    const signature = await signHmacPayload(payloadString, record.webhook_secret);

    // 4. Dispatch to the target webhook URL (the requesting module's own handler)
    const response = await fetch(record.webhook_url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-OpenWA-Signature': signature
      },
      body: payloadString
    });

    if (!response.ok) {
      return { success: false, error: `Webhook delivery failed with status ${response.status}` };
    }

    // 5. Only update the ledger to COMPLETED after confirmed delivery
    //    ACID-W01 note: this is a best-effort update — if it fails, the link
    //    remains PENDING and the action can be re-submitted. A future migration
    //    should introduce a DB-side atomic RPC that marks COMPLETED + fires the
    //    webhook in a single transaction.
    const { error: updateError } = await supabase
      .from('whatsapp_outbox')
      .update({ status: 'COMPLETED' })
      .eq('id', actionId);

    if (updateError) {
      return { success: false, error: 'Failed to update action status' };
    }

    return { success: true };
  } catch (e: unknown) {
    const errorMsg = e instanceof Error ? e.message : 'Unknown error';
    return { success: false, error: `Server action crash: ${errorMsg}` };
  }
}
