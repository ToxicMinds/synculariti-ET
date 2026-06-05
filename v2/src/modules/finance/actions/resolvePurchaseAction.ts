'use server';

import { createClient } from '@/lib/supabase-server';
import { ServerLogger } from '@/lib/logger-server';
import { recordEventServer } from '@/lib/event-log-server';
import { getErrorMessage } from '@/lib/utils';
import { revalidatePath } from 'next/cache';

export async function resolvePurchaseAction(
  purchaseId: string,
  decision: 'RELEASED' | 'REJECTED'
): Promise<{ success: boolean; error?: string }> {
  try {
    const supabase = await createClient();

    const { error } = await supabase.rpc('resolve_purchase_quarantine_v1', {
      p_purchase_id: purchaseId,
      p_status: decision
    });

    if (error) {
      await ServerLogger.system('ERROR', 'Finance', 'resolve_purchase_quarantine_v1 failed', {
        purchaseId, decision, error: error.message,
      });
      return { success: false, error: `Action failed: ${error.message}` };
    }

    await ServerLogger.system('INFO', 'Finance', 'Purchase quarantine resolved directly', {
      purchaseId, decision,
    });

    const eventAction = decision === 'RELEASED' ? 'purchase_quarantine.released' : 'purchase_quarantine.rejected';
    const [tenantResult, userResult] = await Promise.all([
      supabase.rpc('get_my_tenant'),
      supabase.auth.getUser(),
    ]);
    const tenantId = tenantResult.data as string | null;
    const whoId = userResult.data?.user?.id;
    if (tenantId) {
      void recordEventServer({
        tenantId,
        action: eventAction,
        whoType: 'user',
        whoId,
        entityId: purchaseId,
        entityType: 'purchase',
        description: `Purchase quarantine ${decision.toLowerCase()}`,
      }).catch(() => {/* fire and forget */});
    }

    revalidatePath('/');
    revalidatePath('/action/[actionId]', 'page');

    return { success: true };
  } catch (e: unknown) {
    const errorMsg = getErrorMessage(e);
    return { success: false, error: `Server action crash: ${errorMsg}` };
  }
}
