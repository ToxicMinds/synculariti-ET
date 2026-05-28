import { createServiceClient } from '@/lib/supabase-server';
import { DefaultPOApprovalService } from '@/modules/logistics/actions/poApproval';
import { DefaultFinanceAuditService } from '@/modules/finance/actions/financeAudit';
import { DefaultPOSDiscrepancyService } from '@/modules/operations/actions/posDiscrepancy';

export interface DecisionHandler {
  canHandle(metadata: Record<string, unknown>): boolean;
  process(tenantId: string, outboxId: string, decision: string, senderPhone: string): Promise<void>;
}

const defaultHandlers: DecisionHandler[] = [
  {
    canHandle: (m) => !!m.poId,
    process: async (tenantId, outboxId, decision, senderPhone) => {
      const service = new DefaultPOApprovalService(createServiceClient());
      await service.processDecision(tenantId, outboxId, decision as 'Approve' | 'Reject' | 'Modify', senderPhone);
    },
  },
  {
    canHandle: (m) => !!m.transactionId,
    process: async (tenantId, outboxId, decision, senderPhone) => {
      const service = new DefaultFinanceAuditService(createServiceClient());
      await service.processDecision(tenantId, outboxId, decision as 'Approve Anyway' | 'Request Re-upload' | 'Reject Expense', senderPhone);
    },
  },
  {
    canHandle: (m) => m.amount !== undefined && !!m.locationId,
    process: async (tenantId, outboxId, decision, senderPhone) => {
      const service = new DefaultPOSDiscrepancyService(createServiceClient());
      await service.processDecision(tenantId, outboxId, decision as 'Log as Shrinkage' | 'Recount Required' | 'Deduct from Register', senderPhone);
    },
  },
];

export class DecisionRouter {
  private handlers: DecisionHandler[];

  constructor(handlers?: DecisionHandler[]) {
    this.handlers = handlers ? [...handlers] : [...defaultHandlers];
  }

  register(handler: DecisionHandler): void {
    this.handlers.push(handler);
  }

  async route(
    tenantId: string,
    outboxId: string,
    decision: string,
    senderPhone: string,
    metadata: Record<string, unknown>,
  ): Promise<boolean> {
    for (const handler of this.handlers) {
      if (handler.canHandle(metadata)) {
        await handler.process(tenantId, outboxId, decision, senderPhone);
        return true;
      }
    }
    return false;
  }
}
