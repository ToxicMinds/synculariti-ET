import { DefaultFinanceAuditService } from './financeAudit';
import { supabase } from '@/lib/supabase';

jest.mock('@/lib/supabase', () => ({
  supabase: {
    from: jest.fn(),
  },
}));

describe('FinanceAuditService Contract', () => {
  const mockSingle = jest.fn();
  const mockUpdate = jest.fn();
  const mockEq = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    mockSingle.mockReset();
    mockUpdate.mockReset();
    mockEq.mockReset();

    (supabase.from as jest.Mock).mockReturnValue({
      select: jest.fn().mockReturnThis(),
      eq: mockEq.mockReturnThis(),
      single: mockSingle,
      update: mockUpdate,
    });

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

    mockUpdate.mockReturnValue({
      eq: jest.fn().mockReturnValue({
        eq: jest.fn().mockResolvedValue({ error: null }),
      }),
    });

    const service = new DefaultFinanceAuditService();
    const result = await service.processDecision(
      'tenant-123',
      'outbox-123',
      'Request Re-upload',
      '421904855155' // Wife's phone
    );
    expect(result.success).toBe(true);
    expect(result.resolution).toBe('PENDING_REUPLOAD');
    expect(supabase.from).toHaveBeenCalledWith('transactions');
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

    mockUpdate.mockReturnValue({
      eq: jest.fn().mockReturnValue({
        eq: jest.fn().mockResolvedValue({ error: null }),
      }),
    });

    const service = new DefaultFinanceAuditService();
    const result = await service.processDecision(
      'tenant-123',
      'outbox-123',
      'Approve Anyway',
      '421904855155'
    );
    expect(result.success).toBe(true);
    expect(result.resolution).toBe('APPROVED');
    expect(supabase.from).toHaveBeenCalledWith('transactions');
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

    mockUpdate.mockReturnValue({
      eq: jest.fn().mockReturnValue({
        eq: jest.fn().mockResolvedValue({ error: null }),
      }),
    });

    const service = new DefaultFinanceAuditService();
    const result = await service.processDecision(
      'tenant-123',
      'outbox-123',
      'Reject Expense',
      '421904855155'
    );
    expect(result.success).toBe(true);
    expect(result.resolution).toBe('REJECTED');
    expect(supabase.from).toHaveBeenCalledWith('transactions');
  });
});
