'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { Logger } from '@/lib/logger';
import { formatCurrency, safeAmount } from '@/lib/utils';

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
  } | Array<{
    description: string | null;
    date: string | null;
  }> | null;
}

export function ItemAnalytics({ tenantId, selectedMonth, isDemo = false }: { tenantId?: string; selectedMonth?: string; isDemo?: boolean }) {
  const [items, setItems] = useState<AggregatedItem[]>([]);
  const [loading, setLoading] = useState(!isDemo && !!tenantId);

  useEffect(() => {
    if (isDemo) {
      setItems([
        { name: 'Bulk Organic Coffee Beans', total_amount: 850.40, count: 4, last_store: 'Global Supply Co', last_date: new Date().toISOString() },
        { name: 'Paper Takeaway Cups (500x)', total_amount: 120.00, count: 2, last_store: 'Eco Packaging', last_date: new Date().toISOString() },
        { name: 'Oat Milk (Case of 12)', total_amount: 45.60, count: 3, last_store: 'Dairy Free Distro', last_date: new Date().toISOString() }
      ]);
      setLoading(false);
      return;
    }
    if (!tenantId) return;
    fetchTopItems();
  }, [tenantId, selectedMonth, isDemo]);

  async function fetchTopItems() {
    setLoading(true);
    try {
      let query = supabase
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

      if (selectedMonth) {
        const monthStart = selectedMonth + '-01';
        const [y, m] = selectedMonth.split('-');
        const lastDay = new Date(parseInt(y), parseInt(m), 0).getDate();
        const monthEnd = selectedMonth + '-' + String(lastDay).padStart(2, '0');
        query = query.gte('transactions.date', monthStart).lte('transactions.date', monthEnd);
      }

      const { data, error } = await query;

      if (error) throw error;

      const rawData = (data || []) as unknown as RawReceiptItem[];

      const aggregated = rawData.reduce((acc: Record<string, AggregatedItem>, curr: RawReceiptItem) => {
        const rawName = curr.name || 'Unknown Item';
        const nameKey = rawName.trim().toUpperCase();
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

        acc[nameKey].total_amount += safeAmount(curr.amount);
        acc[nameKey].count += 1;

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
        No scanned item data for this period.
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {items.map((item, i) => (
        <div key={`${item.name}-${item.last_date}`} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
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
          <span style={{ fontWeight: 700, fontSize: 15, color: 'var(--text-primary)' }}>{formatCurrency(item.total_amount)}</span>
        </div>
      ))}
    </div>
  );
}
