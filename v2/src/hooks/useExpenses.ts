'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { Expense } from '@/lib/finance';
import { normalizeAndLinkMerchant } from '@/lib/neo4j';

export interface ReceiptItem {
  name: string;
  amount: number;
  category: string;
  selected: boolean;
}

export interface ReceiptData {
  store: string;
  date: string;
  total: number;
  items: ReceiptItem[];
}

export function useExpenses(householdId: string | undefined) {
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!householdId) {
      setExpenses([]);
      setLoading(false);
      return;
    }

    fetchExpenses();

    // Set up Realtime Subscription
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
  }, [householdId]);

  const fetchExpenses = async () => {
    if (!householdId) return;
    
    // Fetch last 4 months (matching old state.js logic)
    const cutOff = new Date();
    cutOff.setMonth(cutOff.getMonth() - 4);
    const dateStr = cutOff.toISOString().slice(0, 10);

    const { data, error } = await supabase
      .from('expenses')
      .select('*')
      .eq('household_id', householdId)
      .eq('is_deleted', false)
      .gte('date', dateStr)
      .order('date', { ascending: false })
      .order('created_at', { ascending: false });

    if (!error && data) {
      setExpenses(data);
    }
    setLoading(false);
  };

  const addExpense = async (expense: Partial<Expense> | Partial<Expense>[]) => {
    if (!householdId) return;

    const normalize = (e: Partial<Expense> & { merchant?: string }) => {
      const { merchant, ...pureExpense } = e;
      return {
        ...pureExpense,
        household_id: householdId,
      };
    };

    const payload = Array.isArray(expense)
      ? expense.map(e => normalize(e))
      : normalize(expense);

    const { data, error } = await supabase
      .from('expenses')
      .insert(payload)
      .select();
    if (error) throw error;

    // Proactively refresh the local list for immediate UI feedback
    fetchExpenses();

    // Fire-and-forget Neo4j sync
    if (data) {
      for (const saved of data) {
        const merchantName = (expense as any).merchant || saved.description || 'Unknown Merchant';
        normalizeAndLinkMerchant(merchantName, saved.id, Number(saved.amount)).catch(
          err => console.error('Neo4j sync failed for manual entry:', err)
        );
      }
    }
  };

  const saveReceipt = async (receipt: ReceiptData, whoId: string, whoName: string) => {
    if (!householdId) {
      console.error('saveReceipt failed: No householdId provided');
      return;
    }

    const selectedItems = receipt.items.filter(i => i.selected);
    if (selectedItems.length === 0) {
      throw new Error('No items selected to save.');
    }

    // Determine the primary category (most frequent among selected items)
    const catCounts: Record<string, number> = {};
    selectedItems.forEach(i => catCounts[i.category] = (catCounts[i.category] || 0) + 1);
    const primaryCategory = Object.entries(catCounts).sort((a, b) => b[1] - a[1])[0][0];

    // 1. Insert the parent Expense
    const { data: expenseData, error: expenseError } = await supabase
      .from('expenses')
      .insert({
        household_id: householdId,
        who_id: whoId,
        who: whoName,
        category: primaryCategory,
        amount: selectedItems.reduce((acc, curr) => acc + curr.amount, 0),
        date: receipt.date,
        description: receipt.store,
      })
      .select()
      .single();

    if (expenseError) throw expenseError;

    // 2. Insert the Receipt Items
    const { error: itemsError } = await supabase
      .from('receipt_items')
      .insert(selectedItems.map(item => ({
        expense_id: expenseData.id,
        household_id: householdId,
        name: item.name,
        amount: item.amount,
        category: item.category
      })));

    if (itemsError) throw itemsError;

    // 3. Neo4j Normalization (Fire and forget to keep UI snappy)
    normalizeAndLinkMerchant(receipt.store, expenseData.id, expenseData.amount).catch(err => 
      console.error('Neo4j Sync Failed:', err)
    );
  };

  const softDeleteExpense = async (id: string) => {
    if (!householdId) return;
    const { error } = await supabase
      .from('expenses')
      .update({ is_deleted: true })
      .eq('id', id)
      .eq('household_id', householdId);
    if (error) throw error;
    fetchExpenses();
  };

  const updateExpense = async (id: string, expense: Partial<Expense> & { merchant?: string }) => {
    if (!householdId) return;

    // Strip 'merchant' before sending to Supabase (it's for Neo4j only)
    const { merchant, ...pureExpense } = expense;

    const { error } = await supabase
      .from('expenses')
      .update({ ...pureExpense, household_id: householdId })
      .eq('id', id);

    if (error) throw error;
    fetchExpenses();

    // Update Neo4j as well
    const merchantName = expense.merchant || expense.description || 'Unknown Merchant';
    normalizeAndLinkMerchant(merchantName, id, Number(expense.amount)).catch(err => 
      console.error('Neo4j Update Failed:', err)
    );
  };

  return { expenses, loading, addExpense, saveReceipt, softDeleteExpense, updateExpense, fetchExpenses };
}
