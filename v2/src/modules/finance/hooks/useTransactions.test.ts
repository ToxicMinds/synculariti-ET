import { renderHook, act, waitFor } from '@testing-library/react';
import { useTransactions } from './useTransactions';
import { supabase } from '@/lib/supabase';
import { useTenantContext } from '@/context/TenantContext';

jest.mock('@/lib/supabase', () => ({
  supabase: {
    channel: jest.fn(),
    removeChannel: jest.fn(),
    from: jest.fn(),
  }
}));

jest.mock('@/context/TenantContext', () => ({
  useTenantContext: jest.fn().mockReturnValue({ syncToken: 0 }),
}));

describe('useTransactions — Incremental Cache', () => {
  const TENANT_ID = 'test-tenant';
  const SAMPLE_TXS = [
    { id: 'tx-1', amount: 100, category: 'Food', date: '2026-06-01' },
    { id: 'tx-2', amount: 50, category: 'Drinks', date: '2026-06-02' },
    { id: 'tx-3', amount: 200, category: 'Food', date: '2026-06-03' },
  ];

  let mockQuery: any;
  let mockRange: jest.Mock;
  let mockChannel: any;
  let realtimeCallback: ((payload: any) => void) | null;

  beforeEach(() => {
    jest.clearAllMocks();
    realtimeCallback = null;

    mockRange = jest.fn().mockImplementation((start: number) => {
      if (start === 0) return { data: SAMPLE_TXS, error: null };
      return { data: [], error: null };
    });

    mockQuery = {
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      gte: jest.fn().mockReturnThis(),
      lte: jest.fn().mockReturnThis(),
      order: jest.fn().mockReturnThis(),
      range: mockRange,
    };

    mockChannel = {
      on: jest.fn().mockImplementation((_event: string, _config: any, cb?: any) => {
        if (cb) realtimeCallback = cb;
        return mockChannel;
      }),
      subscribe: jest.fn().mockReturnThis(),
    };

    (supabase.from as jest.Mock).mockReturnValue(mockQuery);
    (supabase.channel as jest.Mock).mockReturnValue(mockChannel);
    (supabase.removeChannel as jest.Mock).mockReturnValue(undefined);
  });

  // ── BASELINE — current behavior documented ──

  it('BASELINE: fetches all transactions on mount with tenantId', async () => {
    const { result } = renderHook(() => useTransactions(TENANT_ID, '2026-06'));

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(supabase.from).toHaveBeenCalledWith('transactions');
    expect(mockQuery.select).toHaveBeenCalled();
    expect(mockQuery.eq).toHaveBeenCalledWith('tenant_id', TENANT_ID);
    expect(result.current.transactions).toEqual(SAMPLE_TXS);
  });

  it('BASELINE: does not fetch when tenantId is undefined', async () => {
    const { result } = renderHook(() => useTransactions(undefined, '2026-06'));

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(supabase.from).not.toHaveBeenCalled();
    expect(result.current.transactions).toEqual([]);
  });

  it('BASELINE: syncToken change triggers re-fetch', async () => {
    // Two-phase rendering to simulate syncToken increment
    const { result, rerender } = renderHook(
      ({ token }) => {
        (useTenantContext as jest.Mock).mockReturnValue({ syncToken: token });
        return useTransactions(TENANT_ID, '2026-06');
      },
      { initialProps: { token: 0 } }
    );

    await waitFor(() => expect(result.current.loading).toBe(false));

    const callCountBefore = (mockRange as jest.Mock).mock.calls.length;

    rerender({ token: 1 });

    await waitFor(() => {
      expect((mockRange as jest.Mock).mock.calls.length).toBeGreaterThan(callCountBefore);
    });
  });

  // ── DEBOUNCE — realtime handler debounces to avoid duplicate fetch ──

  it('DEBOUNCE: realtime callback is captured and debounced (2s)', async () => {
    jest.useFakeTimers();

    renderHook(() => useTransactions(TENANT_ID, '2026-06'));

    // Channel should be created with a realtime listener
    expect(mockChannel.on).toHaveBeenCalled();

    // Capture the callback
    expect(realtimeCallback).not.toBeNull();

    // Count range calls so far (initial fetch already happened)
    const rangeCallsBefore = (mockRange as jest.Mock).mock.calls.length;

    // Invoke the realtime callback — should NOT immediately call fetchTransactions
    realtimeCallback!({ eventType: 'UPDATE' });

    // No immediate fetch
    expect((mockRange as jest.Mock).mock.calls.length).toBe(rangeCallsBefore);

    // Fast-forward past the debounce window
    jest.advanceTimersByTime(2000);

    // Now fetchTransactions should have been called
    expect((mockRange as jest.Mock).mock.calls.length).toBeGreaterThan(rangeCallsBefore);

    jest.useRealTimers();
  });

  it('DEBOUNCE: rapid realtime callbacks reset the timer', async () => {
    jest.useFakeTimers();

    renderHook(() => useTransactions(TENANT_ID, '2026-06'));
    const rangeCallsBefore = (mockRange as jest.Mock).mock.calls.length;

    // Fire three rapid realtime callbacks (simulates realtime + syncToken racing)
    realtimeCallback!({ eventType: 'INSERT' });
    realtimeCallback!({ eventType: 'UPDATE' });
    realtimeCallback!({ eventType: 'DELETE' });

    // Advance only 1s — debounce should still be pending
    jest.advanceTimersByTime(1000);
    expect((mockRange as jest.Mock).mock.calls.length).toBe(rangeCallsBefore);

    // Advance to 2s from last callback
    jest.advanceTimersByTime(1000);
    expect((mockRange as jest.Mock).mock.calls.length).toBeGreaterThan(rangeCallsBefore);

    // Only ONE fetch should have happened
    expect((mockRange as jest.Mock).mock.calls.length).toBe(rangeCallsBefore + 1);

    jest.useRealTimers();
  });

  // ── TARGET — new incremental cache contract ──

  it('TARGET: exposes patchRemoveTransaction function', async () => {
    const { result } = renderHook(() => useTransactions(TENANT_ID, '2026-06'));

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.patchRemoveTransaction).toBeDefined();
    expect(typeof result.current.patchRemoveTransaction).toBe('function');
  });

  it('TARGET: patchRemoveTransaction removes item from local state instantly without re-fetch', async () => {
    const { result } = renderHook(() => useTransactions(TENANT_ID, '2026-06'));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
      expect(result.current.transactions).toHaveLength(3);
    });

    const rangeCallsBefore = (mockRange as jest.Mock).mock.calls.length;

    act(() => {
      result.current.patchRemoveTransaction('tx-2');
    });

    expect(result.current.transactions).toHaveLength(2);
    expect(result.current.transactions.find(tx => tx.id === 'tx-2')).toBeUndefined();

    // No re-fetch triggered by the patch
    expect((mockRange as jest.Mock).mock.calls.length).toBe(rangeCallsBefore);
  });

  it('TARGET: patchRemoveTransaction with non-existent id does nothing', async () => {
    const { result } = renderHook(() => useTransactions(TENANT_ID, '2026-06'));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
      expect(result.current.transactions).toHaveLength(3);
    });

    act(() => {
      result.current.patchRemoveTransaction('non-existent-id');
    });

    expect(result.current.transactions).toHaveLength(3);
  });

  it('TARGET: exposes patchAddTransaction function', async () => {
    const { result } = renderHook(() => useTransactions(TENANT_ID, '2026-06'));

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.patchAddTransaction).toBeDefined();
    expect(typeof result.current.patchAddTransaction).toBe('function');
  });

  it('TARGET: patchAddTransaction prepends item to local state instantly', async () => {
    const { result } = renderHook(() => useTransactions(TENANT_ID, '2026-06'));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
      expect(result.current.transactions).toHaveLength(3);
    });

    const newTx = { id: 'tx-4', amount: 300, category: 'Supplies', date: '2026-06-04' };

    act(() => {
      result.current.patchAddTransaction(newTx as any);
    });

    expect(result.current.transactions).toHaveLength(4);
    expect(result.current.transactions[0].id).toBe('tx-4');
  });

  it('TARGET: exposes patchUpdateTransaction function', async () => {
    const { result } = renderHook(() => useTransactions(TENANT_ID, '2026-06'));

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.patchUpdateTransaction).toBeDefined();
    expect(typeof result.current.patchUpdateTransaction).toBe('function');
  });

  it('TARGET: patchUpdateTransaction replaces existing item in local state', async () => {
    const { result } = renderHook(() => useTransactions(TENANT_ID, '2026-06'));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
      expect(result.current.transactions).toHaveLength(3);
    });

    act(() => {
      result.current.patchUpdateTransaction('tx-2', { amount: 999 } as any);
    });

    const updated = result.current.transactions.find(tx => tx.id === 'tx-2');
    expect(updated).toBeDefined();
    expect(updated!.amount).toBe(999);
    // Ensure other items unchanged
    expect(result.current.transactions.find(tx => tx.id === 'tx-1')!.amount).toBe(100);
  });
});
