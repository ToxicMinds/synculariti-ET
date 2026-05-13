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
    
    let query = supabase
      .from('transactions')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('is_deleted', false);

    if (selectedMonth) {
      // Fetch selected month PLUS 5 previous months for trends (6 months total)
      const [y, m] = selectedMonth.split('-');
      const startDate = new Date(parseInt(y), parseInt(m) - 6, 1).toISOString().slice(0, 10);
      
      const nextMonthDate = new Date(parseInt(y), parseInt(m), 1);
      const endDate = new Date(nextMonthDate.getTime() - 1).toISOString().slice(0, 10);
      
      query = query.gte('date', startDate).lte('date', endDate);
    } else {
      const cutOff = new Date();
      cutOff.setMonth(cutOff.getMonth() - 4);
      query = query.gte('date', cutOff.toISOString().slice(0, 10));
    }

    const { data, error } = await query
      .order('date', { ascending: false })
      .order('created_at', { ascending: false });

    if (!error && data) {
      setTransactions(data as Transaction[]);
    }
    setLoading(false);
  };

  return { transactions, loading, fetchTransactions };
}
