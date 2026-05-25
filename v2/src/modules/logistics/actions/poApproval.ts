import { supabase } from '@/lib/supabase';
import { z } from 'zod';

export type POApprovalDecision = 'Approve' | 'Reject' | 'Modify';

export const POApprovalWebhookSchema = z.object({
  type: z.literal('poll_vote'),
  outboxId: z.string().uuid(),
  recipientPhone: z.string(),
  tenantId: z.string().uuid(),
  decision: z.enum(['Approve', 'Reject', 'Modify']),
  timestamp: z.number()
});

export type POApprovalWebhookPayload = z.infer<typeof POApprovalWebhookSchema>;

export interface POApprovalService {
  processDecision(
    tenantId: string, 
    outboxId: string, 
    decision: POApprovalDecision,
    managerPhone: string
  ): Promise<{ success: boolean; newStatus: string }>;
}

export class DefaultPOApprovalService implements POApprovalService {
  async processDecision(
    tenantId: string,
    outboxId: string,
    decision: POApprovalDecision,
    managerPhone: string
  ): Promise<{ success: boolean; newStatus: string }> {
    const { data: outbox, error: outboxError } = await supabase
      .from('whatsapp_outbox')
      .select('*')
      .eq('id', outboxId)
      .single();

    if (outboxError || !outbox) {
      throw new Error(`Outbox event not found: ${outboxError?.message || 'Empty data'}`);
    }

    const poId = outbox.payload?.metadata?.poId;
    if (!poId) {
      throw new Error('PO ID missing from outbox payload metadata');
    }

    if (decision === 'Approve') {
      const { error } = await supabase.rpc('receive_purchase_order_v1', {
        p_po_id: poId
      });
      if (error) {
        throw new Error(`Failed to approve PO: ${error.message}`);
      }
      return { success: true, newStatus: 'APPROVED' };
    } else if (decision === 'Reject') {
      const { error } = await supabase
        .from('purchase_orders')
        .update({ status: 'CANCELLED', updated_at: new Date().toISOString() })
        .eq('id', poId)
        .eq('tenant_id', tenantId);
      if (error) {
        throw new Error(`Failed to reject PO: ${error.message}`);
      }
      return { success: true, newStatus: 'REJECTED' };
    } else if (decision === 'Modify') {
      const { error } = await supabase
        .from('purchase_orders')
        .update({ status: 'DRAFT', updated_at: new Date().toISOString() })
        .eq('id', poId)
        .eq('tenant_id', tenantId);
      if (error) {
        throw new Error(`Failed to modify PO: ${error.message}`);
      }
      return { success: true, newStatus: 'MODIFIED' };
    }

    throw new Error(`Invalid decision: ${decision}`);
  }
}
