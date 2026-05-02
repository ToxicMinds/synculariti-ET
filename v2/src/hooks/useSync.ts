import { supabase } from '@/lib/supabase';
import { Expense } from '@/lib/finance';
import { normalizeAndLinkMerchant } from '@/lib/neo4j';
import { Logger } from '@/lib/logger';

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

/**
 * useSync Hook (SOLID: Single Responsibility)
 * RESPONSIBILITY: Write operations, ACID Transactions, and Intelligence Linking.
 */
export function useSync(householdId: string | undefined) {
  
  const addExpense = async (expense: Partial<Expense> | Partial<Expense>[]) => {
    if (!householdId) return;

    const normalize = (e: Partial<Expense> & { merchant?: string }) => {
      const { merchant, id, ...pureExpense } = e;
      return {
        id: id || crypto.randomUUID(),
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
      
    if (error) {
      Logger.system('ERROR', 'Sync', 'Failed to add manual expense', error, householdId);
      throw error;
    }

    // Success activity
    const count = Array.isArray(payload) ? payload.length : 1;
    Logger.user(householdId, 'EXPENSE_ADDED', `Added ${count} manual expense(s)`, 'Household Member');

    // Fire-and-forget Neo4j sync (Handled in background)
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
    if (!householdId) throw new Error('No household ID');

    const selectedItems = receipt.items.filter(i => i.selected);
    if (selectedItems.length === 0) throw new Error('No items selected');

    // Calculate primary category (most items)
    const catCounts: Record<string, number> = {};
    selectedItems.forEach(i => catCounts[i.category] = (catCounts[i.category] || 0) + 1);
    const primaryCategory = Object.entries(catCounts).sort((a, b) => b[1] - a[1])[0][0];

    const expenseId = crypto.randomUUID();
    const totalAmount = selectedItems.reduce((acc, curr) => acc + curr.amount, 0);

    const expensePayload = {
      id: expenseId,
      household_id: householdId,
      who_id: whoId,
      who: whoName,
      category: primaryCategory,
      amount: totalAmount,
      date: receipt.date,
      description: receipt.store,
    };

    const itemsPayload = selectedItems.map(item => ({
      id: crypto.randomUUID(),
      name: item.name,
      amount: item.amount,
      category: item.category
    }));

    // Exponential Backoff Retry Logic (ACID Resilience)
    let attempt = 0;
    const maxAttempts = 3;
    let lastError: any = null;

    while (attempt < maxAttempts) {
      try {
        const { data, error } = await supabase.rpc('save_receipt_v2', {
          p_expense: expensePayload,
          p_items: itemsPayload
        });

        if (error) throw error;

        // Success activity
        Logger.user(householdId, 'EXPENSE_ADDED', `Scanned receipt from ${receipt.store} (€${totalAmount.toFixed(2)})`, whoName);

        // Fire-and-forget Neo4j sync
        normalizeAndLinkMerchant(receipt.store, expenseId, totalAmount).catch(err => 
          console.error('Neo4j Sync Failed:', err)
        );

        return data;
      } catch (err) {
        lastError = err;
        attempt++;
        if (attempt < maxAttempts) {
          const delay = Math.pow(2, attempt) * 1000;
          Logger.system('WARN', 'Sync', `saveReceipt retry ${attempt}/${maxAttempts}`, { error: err, delay }, householdId);
          await new Promise(resolve => setTimeout(resolve, delay));
        } else {
          Logger.system('ERROR', 'Sync', 'saveReceipt failed after max retries', err, householdId);
        }
      }
    }

    throw lastError;
  };

  const softDeleteExpense = async (id: string) => {
    if (!householdId) return;
    const { error } = await supabase
      .from('expenses')
      .update({ is_deleted: true })
      .eq('id', id)
      .eq('household_id', householdId);
    if (error) throw error;
  };

  const updateExpense = async (id: string, expense: Partial<Expense> & { merchant?: string }) => {
    if (!householdId) return;

    const { merchant, ...pureExpense } = expense;

    const { error } = await supabase
      .from('expenses')
      .update({ ...pureExpense, household_id: householdId })
      .eq('id', id);

    if (error) throw error;

    const merchantName = expense.merchant || expense.description || 'Unknown Merchant';
    normalizeAndLinkMerchant(merchantName, id, Number(expense.amount)).catch(err => 
      console.error('Neo4j Update Failed:', err)
    );
  };

  return { addExpense, saveReceipt, softDeleteExpense, updateExpense };
}
