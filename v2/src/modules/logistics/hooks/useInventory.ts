'use client';

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { 
  InventoryItem, 
  InventoryCategory, 
  CurrentInventory 
} from '../types';
import { Logger } from '@/lib/logger';

/**
 * useInventory Hook
 * RESPONSIBILITY: Read-only state for Inventory and SKU levels.
 * (SOLID: Separation of Concerns - Data Fetching)
 */
export function useInventory(tenantId: string | undefined) {
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [categories, setCategories] = useState<InventoryCategory[]>([]);
  const [stock, setStock] = useState<CurrentInventory[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
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

    } catch (err: unknown) {
      Logger.system('ERROR', 'Logistics', 'Failed to fetch inventory state', { 
        error: err instanceof Error ? err.message : String(err) 
      });
    } finally {
      setLoading(false);
    }
  }, [tenantId]);

  useEffect(() => {
    if (!tenantId) {
      setItems([]);
      setCategories([]);
      setStock([]);
      setLoading(false);
      return;
    }

    fetchData();

    const itemsChannel = supabase.channel(`logistics-items-${tenantId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'inventory_items', filter: `tenant_id=eq.${tenantId}` }, fetchData)
      .subscribe();

    const stockChannel = supabase.channel(`logistics-stock-${tenantId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'inventory_ledger', filter: `tenant_id=eq.${tenantId}` }, fetchData)
      .subscribe();

    return () => {
      supabase.removeChannel(itemsChannel);
      supabase.removeChannel(stockChannel);
    };
  }, [tenantId, fetchData]);

  return {
    items,
    categories,
    stock,
    loading,
    refresh: fetchData
  };
}
