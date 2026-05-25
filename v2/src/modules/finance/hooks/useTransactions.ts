import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { Transaction } from '../lib/finance';
import { useTenantContext } from '@/context/TenantContext';

/**
 * useTransactions Hook (SOLID: Single Responsibility)
 * RESPONSIBILITY: Read-only state management, Filtering, and Realtime Sync.
 */
export function useTransactions(tenantId: string | undefined, selectedMonth?: string) {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);

  const { syncToken } = useTenantContext();

  useEffect(() => {
    if (!tenantId) {
      setTransactions([]);
      setLoading(false);
      return;
    }

    fetchTransactions();

    // Set up Realtime Subscription for automatic UI updates when useSync mutates data
    const channel = supabase.channel('transactions-changes')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'transactions',
        filter: `tenant_id=eq.${tenantId}`
      }, () => {
        fetchTransactions();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [tenantId, selectedMonth, syncToken]);

  const fetchTransactions = async () => {
    if (!tenantId) return;
    
    let allData: Transaction[] = [];
    let page = 0;
    const pageSize = 1000;
    let hasMore = true;

    while (hasMore) {
      let query = supabase
        .from('transactions')
        .select('*')
        .eq('tenant_id', tenantId)
        .eq('is_deleted', false);

      if (selectedMonth) {
        const [y, m] = selectedMonth.split('-');
        const year = parseInt(y);
        const month = parseInt(m);
        
        let startMonth = month - 5;
        let startYear = year;
        if (startMonth <= 0) {
          startMonth += 12;
          startYear -= 1;
        }
        const startDate = `${startYear}-${String(startMonth).padStart(2, '0')}-01`;
        
        const lastDay = new Date(year, month, 0).getDate();
        const endDate = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
        
        query = query.gte('date', startDate).lte('date', endDate);
      } else {
        const cutOff = new Date();
        cutOff.setMonth(cutOff.getMonth() - 4);
        query = query.gte('date', cutOff.toISOString().slice(0, 10));
      }

      const { data, error } = await query
        .order('date', { ascending: false })
        .order('created_at', { ascending: false })
        .range(page * pageSize, (page + 1) * pageSize - 1);

      if (error || !data || data.length === 0) {
        hasMore = false;
      } else {
        allData = [...allData, ...(data as Transaction[])];
        if (data.length < pageSize) {
          hasMore = false;
        } else {
          page++;
        }
      }
    }

    setTransactions(allData);
    setLoading(false);
  };

  return { transactions, loading, fetchTransactions };
}
