import type { SupabaseClient } from '@supabase/supabase-js';

export interface CompleteActionResult {
  status: string;
  webhook_url: string | null;
  webhook_secret: string;
  payload: {
    recipient_phone?: string;
    tenant_id?: string;
  } | null;
}

export async function completeAction(
  supabase: SupabaseClient,
  actionId: string,
  decision: string
): Promise<{ data: CompleteActionResult | null; error: string | null }> {
  const { data, error } = await supabase
    .rpc('complete_whatsapp_action_v1', {
      p_outbox_id: actionId,
      p_decision: decision,
    })
    .maybeSingle<CompleteActionResult>();

  if (error) return { data: null, error: error.message };
  return { data, error: null };
}
