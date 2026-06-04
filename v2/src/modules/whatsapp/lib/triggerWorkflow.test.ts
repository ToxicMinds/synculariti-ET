/**
 * Phase 2 Contract Tests: triggerWorkflow event-log wiring
 * Proves recordEventServer is called with workflow.triggered / workflow.skipped
 */

jest.mock('@/lib/event-log-server', () => ({
  recordEventServer: jest.fn().mockResolvedValue(true)
}));
jest.mock('@/lib/logger-server', () => ({
  ServerLogger: { system: jest.fn() }
}));

import { triggerWorkflow } from './triggerWorkflow';
import { recordEventServer } from '@/lib/event-log-server';

const mockRpc = jest.fn();
const mockFrom = jest.fn();

const mockSupabase = {
  from: mockFrom,
  rpc: mockRpc,
} as any;

const ENABLED_TENANT = {
  config: {
    workflows: {
      bill_approval: { enabled: true, threshold: 100, recipients: ['owner'] }
    },
    phones: { owner: '+421900000000' }
  }
};

describe('triggerWorkflow — Event Log Wiring (Contract)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockFrom.mockReturnValue({
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      single: jest.fn().mockResolvedValue({ data: ENABLED_TENANT, error: null })
    });
    // insert_whatsapp_outbox_v2 uses .rpc().single() chaining
    mockRpc.mockReturnValue({
      single: jest.fn().mockResolvedValue({ data: { id: 'outbox-1' }, error: null })
    });
  });

  it('POSITIVE: calls recordEventServer with workflow.triggered when notification is queued', async () => {
    await triggerWorkflow(mockSupabase, {
      tenantId: 'tenant-abc',
      workflowKey: 'bill_approval',
      amount: 250,
      metadata: {}
    });

    expect(recordEventServer).toHaveBeenCalledWith(expect.objectContaining({
      action: 'workflow.triggered',
      tenantId: 'tenant-abc',
    }));
  });

  it('NEGATIVE: calls recordEventServer with workflow.skipped when threshold not met', async () => {
    await triggerWorkflow(mockSupabase, {
      tenantId: 'tenant-abc',
      workflowKey: 'bill_approval',
      amount: 10, // below 100 threshold
      metadata: {}
    });

    expect(recordEventServer).toHaveBeenCalledWith(expect.objectContaining({
      action: 'workflow.skipped',
      tenantId: 'tenant-abc',
    }));
  });

  it('EDGE: does NOT call recordEventServer if tenant not found', async () => {
    mockFrom.mockReturnValue({
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      single: jest.fn().mockResolvedValue({ data: null, error: new Error('Not found') })
    });

    await triggerWorkflow(mockSupabase, {
      tenantId: 'missing-tenant',
      workflowKey: 'bill_approval',
      amount: 250,
      metadata: {}
    });

    expect(recordEventServer).not.toHaveBeenCalled();
  });
});
