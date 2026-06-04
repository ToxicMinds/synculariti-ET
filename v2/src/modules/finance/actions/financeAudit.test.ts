/**
 * Phase 2b Contract Tests: financeAudit event-log wiring
 * Proves recordEventServer is called with workflow.action_resolved
 */

jest.mock('@/lib/event-log-server', () => ({
  recordEventServer: jest.fn().mockResolvedValue(true)
}));

const mockRpc = jest.fn();
const mockSingle = jest.fn();

const mockSupabase = {
  rpc: mockRpc,
  from: jest.fn(() => ({
    select: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    single: mockSingle,
  }))
} as any;

import { DefaultFinanceAuditService } from './financeAudit';
import { recordEventServer } from '@/lib/event-log-server';

describe('financeAudit — Event Log Wiring (Contract)', () => {
  let service: DefaultFinanceAuditService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new DefaultFinanceAuditService(mockSupabase);
    mockRpc.mockResolvedValue({ data: null, error: null });
    mockSingle.mockResolvedValue({ 
      data: { id: 'outbox-1', payload: { metadata: { transactionId: 'txn-123' } } }, 
      error: null 
    });
  });

  it('POSITIVE: emits workflow.action_resolved when action succeeds', async () => {
    await service.processDecision('tenant-abc', 'outbox-1', 'Approve Anyway', '+421900000000');

    expect(recordEventServer).toHaveBeenCalledWith(expect.objectContaining({
      action: 'workflow.action_resolved',
      tenantId: 'tenant-abc',
      entityId: 'outbox-1',
      entityType: 'whatsapp_outbox',
      metadata: expect.objectContaining({
        decision: 'Approve Anyway',
        adminPhone: '+421900000000',
        transactionId: 'txn-123'
      })
    }));
  });

  it('NEGATIVE: does NOT emit event if RPC fails', async () => {
    mockRpc.mockResolvedValueOnce({ data: null, error: new Error('DB Error') });

    await expect(service.processDecision('tenant-abc', 'outbox-1', 'Approve Anyway', '+421900000000'))
      .rejects.toThrow();

    expect(recordEventServer).not.toHaveBeenCalled();
  });
});
