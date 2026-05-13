'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { BentoCard } from '@/components/BentoCard';
import { Logger } from '@/lib/logger';

interface AggregatedItem {
  name: string;
  total_amount: number;
  count: number;
  last_store: string;
  last_date: string;
}

interface RawReceiptItem {
  name: string | null;
  amount: number | string | null;
  transaction_id: string;
  transactions: {
    description: string | null;
    date: string | null;
  } | null | any; // Supabase nested select returns single object or array depending on relation
}

export function ItemAnalytics({ tenantId, isDemo = false }: { tenantId: string | undefined, isDemo?: boolean }) {
  const [items, setItems] = useState<AggregatedItem[]>([]);
  const [loading, setLoading] = useState(!isDemo);

  useEffect(() => {
    if (isDemo) {
      // Professional Mock Data for B2B Demo
      setItems([
        { name: 'Bulk Organic Coffee Beans', total_amount: 850.40, count: 4, last_store: 'Global Supply Co', last_date: new Date().toISOString() },
        { name: 'Paper Takeaway Cups (500x)', total_amount: 120.00, count: 2, last_store: 'Eco Packaging', last_date: new Date().toISOString() },
        { name: 'Oat Milk (Case of 12)', total_amount: 45.60, count: 3, last_store: 'Dairy Free Distro', last_date: new Date().toISOString() }
      ]);
      setLoading(false);
      return;
    }

    if (tenantId) {
      fetchTopItems();
    }
  }, [tenantId, isDemo]);

  async function fetchTopItems() {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('receipt_items')
        .select(`
          name, 
          amount, 
          transaction_id,
          transactions (
            description,
            date
          )
        `)
        .eq('tenant_id', tenantId);

      if (error) throw error;

      const rawData = (data || []) as unknown as RawReceiptItem[];

      const aggregated = rawData.reduce((acc: Record<string, AggregatedItem>, curr: RawReceiptItem) => {
        const rawName = curr.name || 'Unknown Item';
        const nameKey = rawName.trim().toUpperCase();
        // Supabase nested join can return object or array depending on query
        const parent = Array.isArray(curr.transactions) ? curr.transactions[0] : curr.transactions;
        
        if (!acc[nameKey]) {
          acc[nameKey] = { 
            name: rawName, 
            total_amount: 0, 
            count: 0, 
            last_store: parent?.description || 'Unknown', 
            last_date: parent?.date || '' 
          };
        }

        acc[nameKey].total_amount += Number(curr.amount || 0);
        acc[nameKey].count += 1;

        // Track latest context
        if (parent?.date && (!acc[nameKey].last_date || parent.date > acc[nameKey].last_date)) {
          acc[nameKey].last_date = parent.date;
          acc[nameKey].last_store = parent.description || 'Unknown';
        }

        return acc;
      }, {});

      const sorted = Object.values(aggregated)
        .sort((a, b) => b.total_amount - a.total_amount)
        .slice(0, 5);

      setItems(sorted);
    } catch (e: unknown) {
      Logger.system('ERROR', 'Finance', 'Failed to fetch item analytics', { error: e instanceof Error ? e.message : String(e) });
    } finally {
      setLoading(false);
    }
  }

  if (loading) return <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Loading analytics...</div>;

  if (items.length === 0) {
    return (
      <div style={{ padding: '20px 0', textAlign: 'center', color: 'var(--text-muted)', fontSize: 14 }}>
        No item data yet. Scan a receipt to see insights!
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {items.map((item, i) => (
        <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>{item.name}</span>
            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <span style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 500 }}>
                {item.last_store} • {new Date(item.last_date).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}
              </span>
              <span style={{ fontSize: 11, background: 'rgba(255,255,255,0.05)', padding: '1px 6px', borderRadius: 4, color: 'var(--text-muted)' }}>
                {item.count}x
              </span>
            </div>
          </div>
          <span style={{ fontWeight: 700, fontSize: 15, color: 'var(--text-primary)' }}>€{item.total_amount.toFixed(2)}</span>
        </div>
      ))}
    </div>
  );
}
