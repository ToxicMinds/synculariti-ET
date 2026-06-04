import { supabase } from '@/lib/supabase';
import { z } from 'zod';
import { BaseDecisionSchema } from '@/modules/whatsapp/lib/webhook-payloads';
import { recordEventServer } from '@/lib/event-log-server';

export type POApprovalDecision = 'Approve' | 'Reject' | 'Modify';

export const POApprovalWebhookSchema = BaseDecisionSchema.extend({
  decision: z.enum(['Approve', 'Reject', 'Modify']),
});

export type POApprovalWebhookPayload = z.infer<typeof POApprovalWebhookSchema>;

export interface POApprovalService {
  processDecision(
    tenantId: string, 
    outboxId: string, 
    decision: POApprovalDecision,
    managerPhone: string
  ): Promise<{ success: boolean; newStatus?: string; resolution?: string }>;
}

export class DefaultPOApprovalService implements POApprovalService {
  constructor(private supabaseClient = supabase) {}

  async processDecision(
    tenantId: string,
    outboxId: string,
    decision: POApprovalDecision,
    managerPhone: string
  ): Promise<{ success: boolean; newStatus?: string; resolution?: string }> {
    const { data: outbox, error: outboxError } = await this.supabaseClient
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
      const { error } = await this.supabaseClient.rpc('receive_purchase_order_v1', {
        p_po_id: poId
      });
      if (error) {
        throw new Error(`Failed to approve PO: ${error.message}`);
      }
      
      void recordEventServer({
        tenantId,
        action: 'workflow.action_resolved',
        whoType: 'system',
        entityId: outboxId,
        entityType: 'whatsapp_outbox',
        metadata: { decision, adminPhone: managerPhone, poId },
        description: `PO Approval decision processed: ${decision}`,
      }).catch(() => {});
      
      return { success: true, newStatus: 'APPROVED' };
    } else if (decision === 'Reject') {
      const { error } = await this.supabaseClient
        .from('purchase_orders')
        .update({ status: 'CANCELLED', updated_at: new Date().toISOString() })
        .eq('id', poId)
        .eq('tenant_id', tenantId);
      if (error) {
        throw new Error(`Failed to reject PO: ${error.message}`);
      }
      
      void recordEventServer({
        tenantId,
        action: 'workflow.action_resolved',
        whoType: 'system',
        entityId: outboxId,
        entityType: 'whatsapp_outbox',
        metadata: { decision, adminPhone: managerPhone, poId },
        description: `PO Approval decision processed: ${decision}`,
      }).catch(() => {});
      
      return { success: true, newStatus: 'REJECTED' };
    } else if (decision === 'Modify') {
      const { error } = await this.supabaseClient
        .from('purchase_orders')
        .update({ status: 'DRAFT', updated_at: new Date().toISOString() })
        .eq('id', poId)
        .eq('tenant_id', tenantId);
      if (error) {
        throw new Error(`Failed to modify PO: ${error.message}`);
      }
      
      void recordEventServer({
        tenantId,
        action: 'workflow.action_resolved',
        whoType: 'system',
        entityId: outboxId,
        entityType: 'whatsapp_outbox',
        metadata: { decision, adminPhone: managerPhone, poId },
        description: `PO Approval decision processed: ${decision}`,
      }).catch(() => {});
      
      return { success: true, newStatus: 'MODIFIED' };
    }

    return { success: false, resolution: 'Invalid decision' };
  }
}
