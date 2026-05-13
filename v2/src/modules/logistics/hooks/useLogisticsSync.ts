'use client';

import { supabase } from '@/lib/supabase';
import { Logger } from '@/lib/logger';

/** Shape expected by the create_inventory_item_v1 RPC */
export interface InventoryItemInput {
  name: string;
  sku: string;
  type: 'RAW' | 'PREP' | 'SERVICE';
  purchasing_uom: string;
  inventory_uom: string;
  conversion_factor: number;
  category_id?: string;
}

/**
 * useLogisticsSync Hook
 * RESPONSIBILITY: Atomic write operations for Inventory and Procurement.
 * (SOLID: Separation of Concerns - Mutations)
 */
export function useLogisticsSync(tenantId: string | undefined, onRefresh?: () => void) {
  
  const receivePO = async (poId: string) => {
    if (!tenantId) return { success: false, error: 'No tenant context' };
    try {
      const { data, error } = await supabase.rpc('receive_purchase_order_v1', {
        p_po_id: poId
      });

      if (error) throw error;

      Logger.system('INFO', 'Logistics', 'PO received atomically via RPC', { poId, result: data });
      Logger.user(tenantId, 'PO_RECEIVED', `Purchase Order received — stock updated`, 'Logistics Manager');

      if (onRefresh) onRefresh();
      return { success: true, data };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      Logger.system('ERROR', 'Logistics', 'receivePO RPC failed', { poId, error: message });
      return { success: false, error: message };
    }
  };

  const addItem = async (itemData: InventoryItemInput) => {
    if (!tenantId) return { success: false, error: 'No tenant context' };
    try {
      const { data, error } = await supabase.rpc('create_inventory_item_v1', {
        p_item: { ...itemData, tenant_id: tenantId }
      });

      if (error) throw error;

      Logger.system('INFO', 'Logistics', 'Item created via RPC', { name: itemData.name });
      Logger.user(tenantId, 'ITEM_CREATED', `New SKU added: ${itemData.name}`, 'Logistics Manager');

      if (onRefresh) onRefresh();
      return { success: true, data };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      Logger.system('ERROR', 'Logistics', 'addItem RPC failed', { error: message });
      return { success: false, error: message };
    }
  };

  return {
    receivePO,
    addItem
  };
}
