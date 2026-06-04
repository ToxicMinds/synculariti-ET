/**
 * Phase 2 Contract Tests: useLogisticsSync event-log wiring
 */

jest.mock('@/lib/supabase', () => ({
  supabase: { rpc: jest.fn() }
}));
jest.mock('@/lib/event-log', () => ({
  recordEvent: jest.fn().mockResolvedValue(true)
}));
jest.mock('@/lib/logger', () => ({
  Logger: { system: jest.fn(), user: jest.fn() }
}));

import { renderHook, act } from '@testing-library/react';
import { useLogisticsSync } from './useLogisticsSync';
import { supabase } from '@/lib/supabase';
import { recordEvent } from '@/lib/event-log';
import { Logger } from '@/lib/logger';

const TENANT_ID = 'tenant-abc';

describe('useLogisticsSync — Event Log Wiring (Contract)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (supabase.rpc as jest.Mock).mockResolvedValue({ data: { id: 'new-id' }, error: null });
  });

  describe('receivePO', () => {
    it('POSITIVE: calls recordEvent with purchase_order.received on success', async () => {
      const { result } = renderHook(() => useLogisticsSync(TENANT_ID));
      await act(async () => {
        await result.current.receivePO('po-123');
      });

      expect(recordEvent).toHaveBeenCalledWith(expect.objectContaining({
        action: 'purchase_order.received',
        entityId: 'po-123',
      }));
    });

    it('NEGATIVE: does NOT call Logger.user on success', async () => {
      const { result } = renderHook(() => useLogisticsSync(TENANT_ID));
      await act(async () => {
        await result.current.receivePO('po-123');
      });
      expect(Logger.user).not.toHaveBeenCalled();
    });
  });

  describe('addItem', () => {
    const item = {
      name: 'Milk', sku: 'MILK-1L', type: 'RAW' as const,
      purchasing_uom: 'L', inventory_uom: 'L', conversion_factor: 1
    };

    it('POSITIVE: calls recordEvent with inventory_item.created on success', async () => {
      const { result } = renderHook(() => useLogisticsSync(TENANT_ID));
      await act(async () => {
        await result.current.addItem(item);
      });

      expect(recordEvent).toHaveBeenCalledWith(expect.objectContaining({
        action: 'inventory_item.created',
        description: expect.stringContaining('Milk'),
      }));
    });

    it('NEGATIVE: does NOT call Logger.user on success', async () => {
      const { result } = renderHook(() => useLogisticsSync(TENANT_ID));
      await act(async () => {
        await result.current.addItem(item);
      });
      expect(Logger.user).not.toHaveBeenCalled();
    });
  });
});
