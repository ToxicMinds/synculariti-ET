import { DefaultPOSDiscrepancyService } from './posDiscrepancy';
import { supabase } from '@/lib/supabase';

jest.mock('@/lib/supabase', () => ({
  supabase: {
    from: jest.fn(),
    rpc: jest.fn(),
  },
}));

describe('POSDiscrepancyService Contract', () => {
  const mockSingle = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    mockSingle.mockReset();

    (supabase.from as jest.Mock).mockReturnValue({
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      single: mockSingle,
    });
  });

  it('should process a valid Log as Shrinkage decision', async () => {
    mockSingle.mockResolvedValue({
      data: {
        id: 'outbox-123',
        tenant_id: 'tenant-123',
        payload: {
          metadata: {
            amount: 150,
            locationId: 'loc-123',
          },
        },
      },
      error: null,
    });

    (supabase.rpc as jest.Mock).mockResolvedValue({ data: 'tx-new-id', error: null });

    const service = new DefaultPOSDiscrepancyService();
    const result = await service.processDecision(
      'tenant-123',
      'outbox-123',
      'Log as Shrinkage',
      '421944539208' // Wife's phone
    );
    expect(result.success).toBe(true);
    expect(result.resolution).toBe('SHRINKAGE_LOGGED');
    expect(supabase.rpc).toHaveBeenCalledWith('add_transaction_v3', {
      p_transaction: expect.objectContaining({
        category: 'Adjustment',
        amount: -150,
        transaction_type: 'DEBIT',
      }),
    });
  });

  it('should process a valid Recount Required decision', async () => {
    mockSingle.mockResolvedValue({
      data: {
        id: 'outbox-123',
        tenant_id: 'tenant-123',
        payload: {
          metadata: {
            amount: 150,
          },
        },
      },
      error: null,
    });

    const service = new DefaultPOSDiscrepancyService();
    const result = await service.processDecision(
      'tenant-123',
      'outbox-123',
      'Recount Required',
      '421944539208'
    );
    expect(result.success).toBe(true);
    expect(result.resolution).toBe('RECOUNT_REQUIRED');
  });

  it('should process a valid Deduct from Register decision', async () => {
    mockSingle.mockResolvedValue({
      data: {
        id: 'outbox-123',
        tenant_id: 'tenant-123',
        payload: {
          metadata: {
            amount: 150,
          },
        },
      },
      error: null,
    });

    const service = new DefaultPOSDiscrepancyService();
    const result = await service.processDecision(
      'tenant-123',
      'outbox-123',
      'Deduct from Register',
      '421944539208'
    );
    expect(result.success).toBe(true);
    expect(result.resolution).toBe('REGISTER_DEDUCTED');
  });
});
