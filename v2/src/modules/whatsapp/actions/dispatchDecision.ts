'use server';

import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

async function signPayload(payload: string, secret: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = await globalThis.crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );

  const signatureBuf = await globalThis.crypto.subtle.sign(
    'HMAC',
    key,
    encoder.encode(payload)
  );

  return Array.from(new Uint8Array(signatureBuf))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

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
          set(name: string, value: string, options: any) {
            try {
              cookieStore.set({ name, value, ...options });
            } catch (e) {}
          },
          remove(name: string, options: any) {
            try {
              cookieStore.set({ name, value: '', ...options });
            } catch (e) {}
          }
        }
      }
    );

    // 1. Fetch the outbox item to ensure it exists and is PENDING
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

    // 2. Package the decision payload (imitates a poll_vote webhook)
    const payload = {
      type: 'poll_vote',
      outboxId: record.id,
      recipientPhone: record.recipient_phone,
      tenantId: record.tenant_id,
      decision,
      timestamp: Date.now()
    };

    const payloadString = JSON.stringify(payload);
    const signature = await signPayload(payloadString, record.webhook_secret);

    // 3. Dispatch to the target webhook URL
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

    // 4. Update the status in the ledger to COMPLETED
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
