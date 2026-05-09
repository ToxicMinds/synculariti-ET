import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { 
  InventoryItem, 
  InventoryCategory, 
  PurchaseOrder, 
  CurrentInventory 
} from '@/types/logistics';
import { Logger } from '@/lib/logger';

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
  const receivePO = async (poId: string) => {
    try {
      const { error } = await supabase
        .from('purchase_orders')
        .update({ status: 'RECEIVED' })
        .eq('id', poId);

      if (error) throw error;
      
      Logger.system('INFO', 'Logistics', 'PO received successfully', { poId });
      return { success: true };
    } catch (err: any) {
      Logger.system('ERROR', 'Logistics', 'Failed to receive PO', { poId, error: err });
      return { success: false, error: err.message };
    }
  };

  const addItem = async (itemData: any) => {
    try {
      const { error } = await supabase
        .from('inventory_items')
        .insert([{ ...itemData, tenant_id: tenantId }]);

      if (error) throw error;
      
      Logger.system('INFO', 'Logistics', 'Item added successfully', { name: itemData.name });
      await fetchData();
      return { success: true };
    } catch (err: any) {
      Logger.system('ERROR', 'Logistics', 'Failed to add item', { error: err });
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
