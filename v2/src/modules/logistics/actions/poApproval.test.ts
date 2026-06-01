import { DefaultPOApprovalService } from './poApproval';
import { supabase } from '@/lib/supabase';

jest.mock('@/lib/supabase', () => ({
  supabase: {
    from: jest.fn(),
    rpc: jest.fn(),
  },
}));

describe('POApprovalService Contract', () => {
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

  it('should process a valid PO approval decision', async () => {
    mockSingle.mockResolvedValue({
      data: {
        id: 'outbox-123',
        tenant_id: 'tenant-123',
        payload: {
          metadata: {
            poId: 'po-1042',
          },
        },
      },
      error: null,
    });

    (supabase.rpc as jest.Mock).mockResolvedValue({ data: { status: 'SUCCESS' }, error: null });

    const service = new DefaultPOApprovalService();
    const result = await service.processDecision(
      'tenant-123',
      'outbox-123',
      'Approve',
      '421904855155' // Wife's phone
    );
    expect(result.success).toBe(true);
    expect(result.newStatus).toBe('APPROVED');
    expect(supabase.rpc).toHaveBeenCalledWith('receive_purchase_order_v1', { p_po_id: 'po-1042' });
  });

  it('should process a valid PO rejection decision', async () => {
    mockSingle.mockResolvedValue({
      data: {
        id: 'outbox-123',
        tenant_id: 'tenant-123',
        payload: {
          metadata: {
            poId: 'po-1042',
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

    const service = new DefaultPOApprovalService();
    const result = await service.processDecision(
      'tenant-123',
      'outbox-123',
      'Reject',
      '421904855155'
    );
    expect(result.success).toBe(true);
    expect(result.newStatus).toBe('REJECTED');
    expect(supabase.from).toHaveBeenCalledWith('purchase_orders');
  });

  it('should process a valid PO modification decision', async () => {
    mockSingle.mockResolvedValue({
      data: {
        id: 'outbox-123',
        tenant_id: 'tenant-123',
        payload: {
          metadata: {
            poId: 'po-1042',
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

    const service = new DefaultPOApprovalService();
    const result = await service.processDecision(
      'tenant-123',
      'outbox-123',
      'Modify',
      '421904855155'
    );
    expect(result.success).toBe(true);
    expect(result.newStatus).toBe('MODIFIED');
    expect(supabase.from).toHaveBeenCalledWith('purchase_orders');
  });

  it('should return failure for an invalid decision rather than throwing (LSP compliant)', async () => {
    mockSingle.mockResolvedValue({
      data: {
        id: 'outbox-123',
        tenant_id: 'tenant-123',
        payload: {
          metadata: {
            poId: 'po-1042',
          },
        },
      },
      error: null,
    });

    const service = new DefaultPOApprovalService();
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
