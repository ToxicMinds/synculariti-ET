import { renderHook, act } from '@testing-library/react';
import { useEventCreation } from '../useEventCreation';
import { supabase } from '@/lib/supabase';

jest.mock('@/lib/supabase', () => ({
  supabase: {
    from: jest.fn()
  }
}));

describe('useEventCreation hook', () => {
  let mockSelect: jest.Mock;
  let mockEq1: jest.Mock;
  let mockEq2: jest.Mock;
  let mockIn: jest.Mock;
  let mockOrder: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    mockSelect = jest.fn();
    mockEq1 = jest.fn();
    mockEq2 = jest.fn();
    mockIn = jest.fn();
    mockOrder = jest.fn();

    (supabase.from as jest.Mock).mockReturnValue({
      select: mockSelect
    });
    mockSelect.mockReturnValue({ eq: mockEq1 });
    mockEq1.mockReturnValue({ eq: mockEq2 });
    mockEq2.mockReturnValue({ in: mockIn });
    mockIn.mockReturnValue({ order: mockOrder });
  });

  it('should fetch events for entity IDs and structure them in a record', async () => {
    const mockEvents = [
      {
        id: 'evt-1',
        entity_id: 'tx-1',
        entity_type: 'transaction',
        action: 'transaction.created',
        created_at: '2026-06-01T12:00:00Z',
        who_id: 'user-1',
        who_type: 'user',
        description: 'Created first tx'
      },
      {
        id: 'evt-2',
        entity_id: 'tx-2',
        entity_type: 'transaction',
        action: 'transaction.created',
        created_at: '2026-06-01T12:05:00Z',
        who_id: 'user-2',
        who_type: 'user',
        description: 'Created second tx'
      }
    ];

    mockOrder.mockResolvedValueOnce({ data: mockEvents, error: null });

    const { result } = renderHook(
      ({ tenantId, entityType, entityIds }) => useEventCreation(tenantId, entityType, entityIds),
      {
        initialProps: {
          tenantId: 'tenant-123',
          entityType: 'transaction',
          entityIds: ['tx-1', 'tx-2']
        }
      }
    );

    // Initial state: loading
    expect(result.current.loading).toBe(true);

    // Wait for the async effect
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 50));
    });

    expect(result.current.loading).toBe(false);
    expect(result.current.eventsByEntityId).toEqual({
      'tx-1': mockEvents[0],
      'tx-2': mockEvents[1]
    });
    expect(result.current.error).toBeNull();

    // Verify calls
    expect(supabase.from).toHaveBeenCalledWith('event_log');
    expect(mockSelect).toHaveBeenCalledWith('*');
    expect(mockEq1).toHaveBeenCalledWith('tenant_id', 'tenant-123');
    expect(mockEq2).toHaveBeenCalledWith('entity_type', 'transaction');
    expect(mockIn).toHaveBeenCalledWith('entity_id', ['tx-1', 'tx-2']);
    expect(mockOrder).toHaveBeenCalledWith('created_at', { ascending: true });
  });

  it('should handle errors gracefully', async () => {
    mockOrder.mockResolvedValueOnce({ data: null, error: { message: 'DB error' } });

    const { result } = renderHook(() =>
      useEventCreation('tenant-123', 'transaction', ['tx-1'])
    );

    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 50));
    });

    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBe('DB error');
    expect(result.current.eventsByEntityId).toEqual({});
  });

  it('should not query when tenantId or entityIds are empty', async () => {
    const { result } = renderHook(() =>
      useEventCreation(undefined, 'transaction', [])
    );

    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 50));
    });

    expect(result.current.loading).toBe(false);
    expect(supabase.from).not.toHaveBeenCalled();
  });
});
