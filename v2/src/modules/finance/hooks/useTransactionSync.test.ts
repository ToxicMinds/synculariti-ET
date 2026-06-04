/**
 * Phase 2 Contract Tests: useTransactionSync event-log wiring
 * These tests prove that recordEvent is called INSTEAD of Logger.user
 * for all financial mutations.
 */

// Mock all external dependencies
jest.mock('@/lib/supabase', () => ({
  supabase: { rpc: jest.fn() }
}));
jest.mock('@/lib/event-log', () => ({
  recordEvent: jest.fn().mockResolvedValue(true)
}));
jest.mock('@/lib/logger', () => ({
  Logger: { system: jest.fn(), user: jest.fn() }
}));
jest.mock('@/context/TenantContext', () => ({
  useTenantContext: jest.fn().mockReturnValue({ triggerRefresh: jest.fn() })
}));
jest.mock('@/lib/offlineQueue', () => ({
  OfflineQueue: { isOffline: jest.fn().mockReturnValue(false), enqueue: jest.fn() }
}));
jest.mock('@/actions/notifyLargeInvoice', () => ({
  notifyLargeInvoice: jest.fn().mockResolvedValue(undefined)
}));

import { renderHook, act } from '@testing-library/react';
import { useTransactionSync } from './useTransactionSync';
import { supabase } from '@/lib/supabase';
import { recordEvent } from '@/lib/event-log';
import { Logger } from '@/lib/logger';

const TENANT_ID = 'tenant-abc';
const WHO_ID = 'user-xyz';

describe('useTransactionSync — Event Log Wiring (Contract)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (supabase.rpc as jest.Mock).mockResolvedValue({ data: ['tx-1'], error: null });
  });

  describe('addTransaction', () => {
    it('POSITIVE: calls recordEvent with transaction.created on success', async () => {
      const { result } = renderHook(() => useTransactionSync(TENANT_ID));
      await act(async () => {
        await result.current.addTransaction({ amount: 100, category: 'Food', description: 'Test' });
      });

      expect(recordEvent).toHaveBeenCalledWith(expect.objectContaining({
        action: 'transaction.created',
      }));
    });

    it('NEGATIVE: does NOT call Logger.user on success (Logger.user is deprecated)', async () => {
      const { result } = renderHook(() => useTransactionSync(TENANT_ID));
      await act(async () => {
        await result.current.addTransaction({ amount: 100 });
      });

      expect(Logger.user).not.toHaveBeenCalled();
    });
  });

  describe('saveReceipt', () => {
    const receipt = {
      store: 'LIDL', date: '2025-01-01', total: 50,
      items: [{ id: '1', name: 'Milk', amount: 50, category: 'Food', selected: true }]
    };

    it('POSITIVE: calls recordEvent with receipt.scanned on success', async () => {
      (supabase.rpc as jest.Mock).mockResolvedValue({ data: { id: 'tx-99' }, error: null });
      const { result } = renderHook(() => useTransactionSync(TENANT_ID));
      await act(async () => {
        await result.current.saveReceipt(receipt, WHO_ID, 'Jane', undefined, 'EUR');
      });

      expect(recordEvent).toHaveBeenCalledWith(expect.objectContaining({
        action: 'receipt.scanned',
        whoId: WHO_ID,
      }));
    });

    it('NEGATIVE: does NOT call Logger.user on success', async () => {
      (supabase.rpc as jest.Mock).mockResolvedValue({ data: { id: 'tx-99' }, error: null });
      const { result } = renderHook(() => useTransactionSync(TENANT_ID));
      await act(async () => {
        await result.current.saveReceipt(receipt, WHO_ID, 'Jane');
      });

      expect(Logger.user).not.toHaveBeenCalled();
    });
  });

  describe('softDeleteTransaction', () => {
    it('POSITIVE: calls recordEvent with transaction.deleted on success', async () => {
      const { result } = renderHook(() => useTransactionSync(TENANT_ID));
      await act(async () => {
        await result.current.softDeleteTransaction('tx-to-delete');
      });

      expect(recordEvent).toHaveBeenCalledWith(expect.objectContaining({
        action: 'transaction.deleted',
        entityId: 'tx-to-delete',
      }));
    });
  });

  describe('saveReceipt — retry exhaustion', () => {
    const receipt = {
      store: 'LIDL', date: '2025-01-01', total: 50,
      items: [{ id: '1', name: 'Milk', amount: 50, category: 'Food', selected: true }]
    };
    let originalSetTimeout: typeof global.setTimeout;

    beforeEach(() => {
      // saveReceipt has exponential backoff (2s + 4s + 8s = 14s retry window).
      // Override setTimeout to execute immediately to keep tests fast.
      originalSetTimeout = global.setTimeout;
      global.setTimeout = ((fn: any) => { fn(); }) as any;
    });

    afterEach(() => {
      global.setTimeout = originalSetTimeout;
    });

    it('NEGATIVE: calls recordEvent with ingestion.failed after max retries exhausted', async () => {
      // All 3 RPC attempts fail
      (supabase.rpc as jest.Mock).mockResolvedValue({ data: null, error: new Error('DB timeout') });
      const { result } = renderHook(() => useTransactionSync(TENANT_ID));

      await act(async () => {
        try {
          await result.current.saveReceipt(receipt, WHO_ID, 'Jane', undefined, 'EUR');
        } catch {
          // Expected to throw after retries
        }
      });

      // After Phase 4 implementation, saveReceipt should emit ingestion.failed
      // This test validates that the event is recorded after retry exhaustion
      // (allowing both the current Logger.system call and the new recordEvent call)
      const ingestionFailedCalls = (recordEvent as jest.Mock).mock.calls.filter(
        (call: any[]) => call[0]?.action === 'ingestion.failed'
      );
      expect(ingestionFailedCalls.length).toBeGreaterThanOrEqual(1);
    });

    it('NEGATIVE: does NOT call Logger.user on failure (Logger.user is deprecated)', async () => {
      (supabase.rpc as jest.Mock).mockResolvedValue({ data: null, error: new Error('DB timeout') });
      const { result } = renderHook(() => useTransactionSync(TENANT_ID));

      await act(async () => {
        try {
          await result.current.saveReceipt(receipt, WHO_ID, 'Jane', undefined, 'EUR');
        } catch {
          // Expected
        }
      });

      expect(Logger.user).not.toHaveBeenCalled();
    });
  });

  describe('updateTransaction', () => {
    it('POSITIVE: calls recordEvent with transaction.updated on success', async () => {
      const { result } = renderHook(() => useTransactionSync(TENANT_ID));
      await act(async () => {
        await result.current.updateTransaction('tx-99', { description: 'Updated' });
      });

      expect(recordEvent).toHaveBeenCalledWith(expect.objectContaining({
        action: 'transaction.updated',
        entityId: 'tx-99',
      }));
    });
  });
});
