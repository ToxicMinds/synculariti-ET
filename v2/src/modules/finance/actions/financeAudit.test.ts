import { DefaultFinanceAuditService } from './financeAudit';
import { supabase } from '@/lib/supabase';

jest.mock('@/lib/supabase', () => ({
  supabase: {
    from: jest.fn(),
    rpc: jest.fn(),
  },
}));

describe('FinanceAuditService Contract', () => {
  const mockSingle = jest.fn();
  const mockRpc = jest.fn();
  const mockEq = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    mockSingle.mockReset();
    mockRpc.mockReset();
    mockEq.mockReset();

    (supabase.from as jest.Mock).mockReturnValue({
      select: jest.fn().mockReturnThis(),
      eq: mockEq.mockReturnThis(),
      single: mockSingle,
    });
    (supabase.rpc as jest.Mock) = mockRpc;

    mockEq.mockReturnThis();
  });

  it('should process a valid Request Re-upload decision', async () => {
    mockSingle.mockResolvedValue({
      data: {
        id: 'outbox-123',
        tenant_id: 'tenant-123',
        payload: {
          metadata: {
            transactionId: 'tx-1042',
          },
        },
      },
      error: null,
    });

    mockRpc.mockResolvedValue({ error: null });

    const service = new DefaultFinanceAuditService();
    const result = await service.processDecision(
      'tenant-123',
      'outbox-123',
      'Request Re-upload',
      '421904855155'
    );
    expect(result.success).toBe(true);
    expect(result.resolution).toBe('PENDING_REUPLOAD');
    expect(mockRpc).toHaveBeenCalledWith('service_update_transaction_v1', {
      p_tenant_id: 'tenant-123',
      p_id: 'tx-1042',
      p_updates: { vat_detail: { audit_status: 'PENDING_REUPLOAD' } },
    });
  });

  it('should process a valid Approve Anyway decision', async () => {
    mockSingle.mockResolvedValue({
      data: {
        id: 'outbox-123',
        tenant_id: 'tenant-123',
        payload: {
          metadata: {
            transactionId: 'tx-1042',
          },
        },
      },
      error: null,
    });

    mockRpc.mockResolvedValue({ error: null });

    const service = new DefaultFinanceAuditService();
    const result = await service.processDecision(
      'tenant-123',
      'outbox-123',
      'Approve Anyway',
      '421904855155'
    );
    expect(result.success).toBe(true);
    expect(result.resolution).toBe('APPROVED');
    expect(mockRpc).toHaveBeenCalledWith('service_update_transaction_v1', {
      p_tenant_id: 'tenant-123',
      p_id: 'tx-1042',
      p_updates: { vat_detail: { audit_status: 'APPROVED' } },
    });
  });

  it('should process a valid Reject Expense decision', async () => {
    mockSingle.mockResolvedValue({
      data: {
        id: 'outbox-123',
        tenant_id: 'tenant-123',
        payload: {
          metadata: {
            transactionId: 'tx-1042',
          },
        },
      },
      error: null,
    });

    mockRpc.mockResolvedValue({ error: null });

    const service = new DefaultFinanceAuditService();
    const result = await service.processDecision(
      'tenant-123',
      'outbox-123',
      'Reject Expense',
      '421904855155'
    );
    expect(result.success).toBe(true);
    expect(result.resolution).toBe('REJECTED');
    expect(mockRpc).toHaveBeenCalledWith('service_soft_delete_transaction_v1', {
      p_tenant_id: 'tenant-123',
      p_id: 'tx-1042',
    });
  });

  it('should return failure for an invalid decision rather than throwing (LSP compliant)', async () => {
    mockSingle.mockResolvedValue({
      data: {
        id: 'outbox-123',
        tenant_id: 'tenant-123',
        payload: {
          metadata: {
            transactionId: 'tx-1042',
          },
        },
      },
      error: null,
    });

    const service = new DefaultFinanceAuditService();
    const result = await service.processDecision(
      'tenant-123',
      'outbox-123',
      'InvalidDecision' as any,
      '421904855155'
    );
    expect(result.success).toBe(false);
    expect(result.resolution).toBe('Invalid decision');
  });
});
