/**
 * Phase 2b Contract Tests: poApproval event-log wiring
 * Proves recordEventServer is called with workflow.action_resolved
 */

jest.mock('@/lib/event-log-server', () => ({
  recordEventServer: jest.fn().mockResolvedValue(true)
}));

const mockRpc = jest.fn();
const mockSingle = jest.fn();
const mockUpdate = jest.fn();

const mockSupabase = {
  rpc: mockRpc,
  from: jest.fn((table) => {
    if (table === 'whatsapp_outbox') {
      return {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: mockSingle,
      };
    }
    return {
      update: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      then: (cb: any) => cb(mockUpdate()), // resolve the promise chain
    };
  })
} as any;

import { DefaultPOApprovalService } from './poApproval';
import { recordEventServer } from '@/lib/event-log-server';

describe('poApproval — Event Log Wiring (Contract)', () => {
  let service: DefaultPOApprovalService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new DefaultPOApprovalService(mockSupabase);
    mockRpc.mockResolvedValue({ data: null, error: null });
    mockUpdate.mockReturnValue({ data: null, error: null });
    mockSingle.mockResolvedValue({ 
      data: { id: 'outbox-1', payload: { metadata: { poId: 'po-123' } } }, 
      error: null 
    });
  });

  it('POSITIVE: emits workflow.action_resolved when action succeeds', async () => {
    await service.processDecision('tenant-abc', 'outbox-1', 'Approve', '+421900000000');

    expect(recordEventServer).toHaveBeenCalledWith(expect.objectContaining({
      action: 'workflow.action_resolved',
      tenantId: 'tenant-abc',
      entityId: 'outbox-1',
      entityType: 'whatsapp_outbox',
      metadata: expect.objectContaining({
        decision: 'Approve',
        adminPhone: '+421900000000',
        poId: 'po-123'
      })
    }));
  });

  it('NEGATIVE: does NOT emit event if action fails', async () => {
    mockRpc.mockResolvedValueOnce({ data: null, error: new Error('DB Error') });

    await expect(service.processDecision('tenant-abc', 'outbox-1', 'Approve', '+421900000000'))
      .rejects.toThrow();

    expect(recordEventServer).not.toHaveBeenCalled();
  });
});
