import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { Expense } from '@/lib/finance';

/**
 * useTransactions Hook (SOLID: Single Responsibility)
 * RESPONSIBILITY: Read-only state management, Filtering, and Realtime Sync.
 */
export function useTransactions(householdId: string | undefined, selectedMonth?: string) {
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!householdId) {
      setExpenses([]);
      setLoading(false);
      return;
    }

    fetchExpenses();

    // Set up Realtime Subscription for automatic UI updates when useSync mutates data
    const channel = supabase.channel('expenses-changes')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'expenses',
        filter: `household_id=eq.${householdId}`
      }, () => {
        fetchExpenses();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [householdId, selectedMonth]);

  const fetchExpenses = async () => {
    if (!householdId) return;
    
    let query = supabase
      .from('expenses')
      .select('*')
      .eq('household_id', householdId)
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
      setExpenses(data);
    }
    setLoading(false);
  };

  return { expenses, loading, fetchExpenses };
}
