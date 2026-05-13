'use client';

import { useInventory } from './useInventory';
import { useLogisticsSync, InventoryItemInput } from './useLogisticsSync';

export type { InventoryItemInput };

/**
 * useLogistics Hook (Facade)
 * RESPONSIBILITY: Entry point for Logistics state and mutations.
 * Delegates to useInventory (Read) and useLogisticsSync (Write).
 * (SOLID: Interface Segregation / Facade Pattern)
 */
export function useLogistics(tenantId: string | undefined) {
  const { items, categories, stock, loading, refresh } = useInventory(tenantId);
  const { receivePO, addItem } = useLogisticsSync(tenantId, refresh);

  return {
    items,
    categories,
    stock,
    loading,
    refresh,
    receivePO,
    addItem
  };
}
