import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { 
  InventoryItem, 
  InventoryCategory, 
  PurchaseOrder, 
  CurrentInventory 
} from '../types';
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
 * useLogistics Hook
 * RESPONSIBILITY: Read/Write state for Inventory and Procurement modules.
 */
export function useLogistics(tenantId: string | undefined) {
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [categories, setCategories] = useState<InventoryCategory[]>([]);
  const [stock, setStock] = useState<CurrentInventory[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!tenantId) {
      setItems([]);
      setCategories([]);
      setStock([]);
      setLoading(false);
      return;
    }

    fetchData();

    // Subscriptions
    const itemsChannel = supabase.channel('logistics-items')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'inventory_items', filter: `tenant_id=eq.${tenantId}` }, fetchData)
      .subscribe();

    const stockChannel = supabase.channel('logistics-stock')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'inventory_ledger', filter: `tenant_id=eq.${tenantId}` }, fetchData)
      .subscribe();

    return () => {
      supabase.removeChannel(itemsChannel);
      supabase.removeChannel(stockChannel);
    };
  }, [tenantId]);

  const fetchData = async () => {
    if (!tenantId) return;
    setLoading(true);

    try {
      const [itemsRes, catsRes, stockRes] = await Promise.all([
        supabase.from('inventory_items').select('*').eq('tenant_id', tenantId).order('name'),
        supabase.from('inventory_categories').select('*').eq('tenant_id', tenantId).order('name'),
        supabase.from('current_inventory').select('*').eq('tenant_id', tenantId)
      ]);

      if (itemsRes.data) setItems(itemsRes.data);
      if (catsRes.data) setCategories(catsRes.data);
      if (stockRes.data) setStock(stockRes.data);

    } catch (err) {
      Logger.system('ERROR', 'Logistics', 'Failed to fetch logistics state', { error: err });
    } finally {
      setLoading(false);
    }
  };

  // Mutations

  /**
   * receivePO: Atomic 3-step operation via RPC.
   * 1. Marks PO as RECEIVED
   * 2. Inserts inventory_ledger rows for each line item (with conversion_factor)
   * 3. Emits PROCUREMENT_RECEIVED to outbox_events (triggers Finance invoice creation)
   * All three steps are atomic — if any fails, all roll back.
   */
  const receivePO = async (poId: string) => {
    if (!tenantId) return { success: false, error: 'No tenant context' };
    try {
      const { data, error } = await supabase.rpc('receive_purchase_order_v1', {
        p_po_id: poId
      });

      if (error) throw error;

      Logger.system('INFO', 'Logistics', 'PO received atomically via RPC', { poId, result: data });
      Logger.user(tenantId, 'PO_RECEIVED', `Purchase Order received — stock updated`, 'Logistics Manager');

      await fetchData();
      return { success: true, data };
    } catch (err: any) {
      Logger.system('ERROR', 'Logistics', 'receivePO RPC failed', { poId, error: err });
      return { success: false, error: err.message };
    }
  };

  /**
   * addItem: Creates a new inventory SKU via the canonical RPC.
   * Bypasses direct table insert — enforces tenant isolation at DB level.
   */
  const addItem = async (itemData: InventoryItemInput) => {
    if (!tenantId) return { success: false, error: 'No tenant context' };
    try {
      const { data, error } = await supabase.rpc('create_inventory_item_v1', {
        p_item: { ...itemData, tenant_id: tenantId }
      });

      if (error) throw error;

      Logger.system('INFO', 'Logistics', 'Item created via RPC', { name: itemData.name });
      Logger.user(tenantId, 'ITEM_CREATED', `New SKU added: ${itemData.name}`, 'Logistics Manager');

      await fetchData();
      return { success: true, data };
    } catch (err: any) {
      Logger.system('ERROR', 'Logistics', 'addItem RPC failed', { error: err });
      return { success: false, error: err.message };
    }
  };

  return {
    items,
    categories,
    stock,
    loading,
    refresh: fetchData,
    receivePO,
    addItem
  };
}
