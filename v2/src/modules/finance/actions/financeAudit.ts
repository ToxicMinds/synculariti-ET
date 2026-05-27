import { supabase } from '@/lib/supabase';
import { z } from 'zod';
import { BaseDecisionSchema } from '@/modules/whatsapp/lib/webhook-payloads';

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

    if (decision === 'Approve Anyway') {
      const { error } = await this.supabaseClient
        .from('transactions')
        .update({
          vat_detail: { audit_status: 'APPROVED' },
          updated_at: new Date().toISOString()
        })
        .eq('id', transactionId)
        .eq('tenant_id', tenantId);

      if (error) throw new Error(`Failed to approve transaction: ${error.message}`);
      return { success: true, resolution: 'APPROVED' };
    } else if (decision === 'Request Re-upload') {
      const { error } = await this.supabaseClient
        .from('transactions')
        .update({
          vat_detail: { audit_status: 'PENDING_REUPLOAD' },
          updated_at: new Date().toISOString()
        })
        .eq('id', transactionId)
        .eq('tenant_id', tenantId);

      if (error) throw new Error(`Failed to update transaction for re-upload: ${error.message}`);
      return { success: true, resolution: 'PENDING_REUPLOAD' };
    } else if (decision === 'Reject Expense') {
      const { error } = await this.supabaseClient
        .from('transactions')
        .update({
          is_deleted: true,
          updated_at: new Date().toISOString()
        })
        .eq('id', transactionId)
        .eq('tenant_id', tenantId);

      if (error) throw new Error(`Failed to reject transaction: ${error.message}`);
      return { success: true, resolution: 'REJECTED' };
    }

    throw new Error(`Invalid decision: ${decision}`);
  }
}
