import { supabase } from '@/lib/supabase';
import { z } from 'zod';
import { BaseDecisionSchema } from '@/modules/whatsapp/lib/webhook-payloads';
import { recordEventServer } from '@/lib/event-log-server';

export type AuditDecision = 'Approve Anyway' | 'Request Re-upload' | 'Reject Expense';

export const AuditWebhookSchema = BaseDecisionSchema.extend({
  decision: z.enum(['Approve Anyway', 'Request Re-upload', 'Reject Expense']),
});

export type AuditWebhookPayload = z.infer<typeof AuditWebhookSchema>;

export interface FinanceAuditService {
  processDecision(
    tenantId: string,
    outboxId: string,
    decision: AuditDecision,
    adminPhone: string
  ): Promise<{ success: boolean; resolution: string }>;
}

export class DefaultFinanceAuditService implements FinanceAuditService {
  constructor(private supabaseClient = supabase) {}

  async processDecision(
    tenantId: string,
    outboxId: string,
    decision: AuditDecision,
    adminPhone: string
  ): Promise<{ success: boolean; resolution: string }> {
    const { data: outbox, error: outboxError } = await this.supabaseClient
      .from('whatsapp_outbox')
      .select('*')
      .eq('id', outboxId)
      .single();

    if (outboxError || !outbox) {
      throw new Error(`Outbox event not found: ${outboxError?.message || 'Empty data'}`);
    }

    const transactionId = outbox.payload?.metadata?.transactionId;
    if (!transactionId) {
      throw new Error('Transaction ID missing from outbox payload metadata');
    }

    const auditActions: Record<AuditDecision, () => Promise<{ success: boolean; resolution: string }>> = {
      'Approve Anyway': async () => {
        const { error } = await this.supabaseClient.rpc('service_update_transaction_v1', {
          p_tenant_id: tenantId,
          p_id: transactionId,
          p_updates: { vat_detail: { audit_status: 'APPROVED' } },
        });
        if (error) throw new Error(`Failed to approve transaction: ${error.message}`);
        return { success: true, resolution: 'APPROVED' };
      },
      'Request Re-upload': async () => {
        const { error } = await this.supabaseClient.rpc('service_update_transaction_v1', {
          p_tenant_id: tenantId,
          p_id: transactionId,
          p_updates: { vat_detail: { audit_status: 'PENDING_REUPLOAD' } },
        });
        if (error) throw new Error(`Failed to update transaction for re-upload: ${error.message}`);
        return { success: true, resolution: 'PENDING_REUPLOAD' };
      },
      'Reject Expense': async () => {
        const { error } = await this.supabaseClient.rpc('service_soft_delete_transaction_v1', {
          p_tenant_id: tenantId,
          p_id: transactionId,
        });
        if (error) throw new Error(`Failed to reject transaction: ${error.message}`);
        return { success: true, resolution: 'REJECTED' };
      },
    };

    const action = auditActions[decision];
    if (!action) {
      return { success: false, resolution: 'Invalid decision' };
    }

    const result = await action();
    if (result.success) {
      void recordEventServer({
        tenantId,
        action: 'workflow.action_resolved',
        whoType: 'system',
        entityId: outboxId,
        entityType: 'whatsapp_outbox',
        metadata: {
          decision,
          adminPhone,
          transactionId,
        },
        description: `Finance audit decision processed: ${decision}`,
      }).catch(() => {});
    }

    return result;
  }
}
