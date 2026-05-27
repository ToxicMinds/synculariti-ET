import { supabase } from '@/lib/supabase';
import { z } from 'zod';
import { BaseDecisionSchema } from '@/modules/whatsapp/lib/webhook-payloads';

export type DiscrepancyDecision = 'Log as Shrinkage' | 'Recount Required' | 'Deduct from Register';

export const POSDiscrepancyWebhookSchema = BaseDecisionSchema.extend({
  decision: z.enum(['Log as Shrinkage', 'Recount Required', 'Deduct from Register']),
});

export type POSDiscrepancyWebhookPayload = z.infer<typeof POSDiscrepancyWebhookSchema>;

export interface POSDiscrepancyService {
  processDecision(
    tenantId: string,
    outboxId: string,
    decision: DiscrepancyDecision,
    managerPhone: string
  ): Promise<{ success: boolean; resolution: string }>;
}

export class DefaultPOSDiscrepancyService implements POSDiscrepancyService {
  constructor(private supabaseClient = supabase) {}

  async processDecision(
    tenantId: string,
    outboxId: string,
    decision: DiscrepancyDecision,
    managerPhone: string
  ): Promise<{ success: boolean; resolution: string }> {
    const { data: outbox, error: outboxError } = await this.supabaseClient
      .from('whatsapp_outbox')
      .select('*')
      .eq('id', outboxId)
      .single();

    if (outboxError || !outbox) {
      throw new Error(`Outbox event not found: ${outboxError?.message || 'Empty data'}`);
    }

    const amount = outbox.payload?.metadata?.amount || 0;
    const locationId = outbox.payload?.metadata?.locationId || null;

    if (decision === 'Log as Shrinkage') {
      const { error } = await this.supabaseClient.rpc('add_transaction_v3', {
        p_transaction: {
          location_id: locationId,
          category: 'Adjustment',
          amount: -Math.abs(amount),
          currency: 'EUR',
          date: new Date().toISOString().slice(0, 10),
          description: `POS Shrinkage Adjustment via WhatsApp outbox #${outboxId}`,
          transaction_type: 'DEBIT'
        }
      });

      if (error) throw new Error(`Failed to log shrinkage adjustment: ${error.message}`);
      return { success: true, resolution: 'SHRINKAGE_LOGGED' };
    } else if (decision === 'Recount Required') {
      return { success: true, resolution: 'RECOUNT_REQUIRED' };
    } else if (decision === 'Deduct from Register') {
      return { success: true, resolution: 'REGISTER_DEDUCTED' };
    }

    throw new Error(`Invalid decision: ${decision}`);
  }
}
