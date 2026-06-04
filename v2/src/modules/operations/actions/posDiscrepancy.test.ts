/**
 * Phase 2b Contract Tests: posDiscrepancy event-log wiring
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

import { DefaultPOSDiscrepancyService } from './posDiscrepancy';
import { recordEventServer } from '@/lib/event-log-server';

describe('posDiscrepancy — Event Log Wiring (Contract)', () => {
  let service: DefaultPOSDiscrepancyService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new DefaultPOSDiscrepancyService(mockSupabase);
    mockRpc.mockResolvedValue({ data: null, error: null });
    mockSingle.mockResolvedValue({ 
      data: { id: 'outbox-1', payload: { metadata: { amount: 50, locationId: 'loc-1' } } }, 
      error: null 
    });
  });

  it('POSITIVE: emits workflow.action_resolved when action succeeds', async () => {
    await service.processDecision('tenant-abc', 'outbox-1', 'Log as Shrinkage', '+421900000000');

    expect(recordEventServer).toHaveBeenCalledWith(expect.objectContaining({
      action: 'workflow.action_resolved',
      tenantId: 'tenant-abc',
      entityId: 'outbox-1',
      entityType: 'whatsapp_outbox',
      metadata: expect.objectContaining({
        decision: 'Log as Shrinkage',
        adminPhone: '+421900000000',
        amount: 50,
      })
    }));
  });

  it('NEGATIVE: does NOT emit event if action fails', async () => {
    mockRpc.mockResolvedValueOnce({ data: null, error: new Error('DB Error') });

    await expect(service.processDecision('tenant-abc', 'outbox-1', 'Log as Shrinkage', '+421900000000'))
      .rejects.toThrow();

    expect(recordEventServer).not.toHaveBeenCalled();
  });
});
