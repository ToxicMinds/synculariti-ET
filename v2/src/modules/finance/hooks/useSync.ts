import { supabase } from '@/lib/supabase';
import { Transaction } from '../lib/finance';
import { normalizeAndLinkMerchant } from '@/lib/neo4j';
import { Logger } from '@/lib/logger';
import { useTenantContext } from '@/context/TenantContext';

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
  ico?: string | null;
  receiptNumber?: string | null;
  transactedAt?: string | null;
  vatDetail?: any;
}

/**
 * useSync Hook (SOLID: Single Responsibility)
 * RESPONSIBILITY: Write operations, ACID Transactions, and Intelligence Linking.
 */
export function useSync(tenantId: string | undefined) {
  const { triggerRefresh } = useTenantContext();
  
  const addTransaction = async (transaction: Partial<Transaction> | Partial<Transaction>[]) => {
    if (!tenantId) return;

    const normalize = (t: Partial<Transaction> & { merchant?: string }) => {
      const { merchant, id, ...pureTransaction } = t;
      return {
        id: id || crypto.randomUUID(),
        ...pureTransaction,
        tenant_id: tenantId,
      };
    };

    const payload = Array.isArray(transaction)
      ? transaction.map(t => normalize(t))
      : normalize(transaction);

    const { data, error } = await supabase
      .from('transactions')
      .insert(payload)
      .select();
      
    if (error) {
      Logger.system('ERROR', 'Sync', 'Failed to add manual transaction', error, tenantId);
      throw error;
    }

    // Success activity & Signal
    const count = Array.isArray(payload) ? payload.length : 1;
    Logger.user(tenantId, 'TRANSACTION_ADDED', `Added ${count} manual transaction(s)`, 'Tenant Member');
    triggerRefresh();

    // Fire-and-forget Neo4j sync
    if (data) {
      for (const saved of data) {
        const merchantName = (transaction as any).merchant || saved.description || 'Unknown Merchant';
        normalizeAndLinkMerchant(merchantName, saved.id, Number(saved.amount)).catch(
          err => Logger.system('ERROR', 'Neo4j', 'Neo4j sync failed for manual transaction', { error: err, transactionId: saved.id }, tenantId)
        );
      }
    }
  };

  const saveReceipt = async (receipt: ReceiptData, whoId: string, whoName: string, locationId?: string, currency: string = 'EUR') => {
    if (!tenantId) throw new Error('No tenant ID');

    const selectedItems = receipt.items.filter(i => i.selected);
    if (selectedItems.length === 0) throw new Error('No items selected');

    const catCounts: Record<string, number> = {};
    selectedItems.forEach(i => catCounts[i.category] = (catCounts[i.category] || 0) + 1);
    const primaryCategory = Object.entries(catCounts).sort((a, b) => b[1] - a[1])[0][0];

    const transactionId = crypto.randomUUID();
    const totalAmount = selectedItems.reduce((acc, curr) => acc + curr.amount, 0);

    const transactionPayload = {
      id: transactionId,
      tenant_id: tenantId,
      location_id: locationId || null,  // B2B: which location this spend belongs to
      who_id: whoId,
      who: whoName,
      category: primaryCategory,
      amount: totalAmount,
      currency,                          // ISO-4217: propagated to receipt_items by v3
      date: receipt.date,
      description: receipt.store,
      ico: receipt.ico || null,
      receipt_number: receipt.receiptNumber || null,
      transacted_at: receipt.transactedAt || null,
      vat_detail: receipt.vatDetail || null,
      transaction_type: 'DEBIT'
    };

    const itemsPayload = selectedItems.map(item => ({
      id: crypto.randomUUID(),
      name: item.name,
      amount: item.amount,
      category: item.category
    }));

    let attempt = 0;
    const maxAttempts = 3;
    let lastError: any = null;

    while (attempt < maxAttempts) {
      try {
        const { data, error } = await supabase.rpc('save_receipt_v3', {
          p_expense: transactionPayload,
          p_items: itemsPayload,
          p_location_id: locationId || null
        });

        if (error) throw error;

        // Success activity & Signal
        Logger.user(tenantId, 'TRANSACTION_ADDED', `Scanned receipt from ${receipt.store} (€${totalAmount.toFixed(2)})`, whoName);
        triggerRefresh();

        normalizeAndLinkMerchant(receipt.store, transactionId, totalAmount, receipt.ico).catch(err =>
          Logger.system('ERROR', 'Neo4j', 'Neo4j sync failed after saveReceipt', { error: err, store: receipt.store }, tenantId)
        );

        return data;
      } catch (err) {
        lastError = err;
        attempt++;
        if (attempt < maxAttempts) {
          const delay = Math.pow(2, attempt) * 1000;
          Logger.system('WARN', 'Sync', `saveReceipt retry ${attempt}/${maxAttempts}`, { error: err, delay }, tenantId);
          await new Promise(resolve => setTimeout(resolve, delay));
        } else {
          Logger.system('ERROR', 'Sync', 'saveReceipt failed after max retries', err, tenantId);
        }
      }
    }

    throw lastError;
  };

  const softDeleteTransaction = async (id: string) => {
    if (!tenantId) return;
    const { error } = await supabase
      .from('transactions')
      .update({ is_deleted: true })
      .eq('id', id)
      .eq('tenant_id', tenantId);

    if (error) throw error;

    Logger.user(tenantId, 'TRANSACTION_DELETED', `Removed a transaction record`, 'Tenant Member');
    triggerRefresh();
  };

  const updateTransaction = async (id: string, transaction: Partial<Transaction> & { merchant?: string }) => {
    if (!tenantId) return;

    const { merchant, ...pureTransaction } = transaction;

    const { error } = await supabase
      .from('transactions')
      .update({ ...pureTransaction, tenant_id: tenantId })
      .eq('id', id);

    if (error) throw error;

    Logger.user(tenantId, 'TRANSACTION_UPDATED', `Updated details for ${transaction.description || 'a transaction'}`, 'Tenant Member');
    triggerRefresh();

    const merchantName = transaction.merchant || transaction.description || 'Unknown Merchant';
    normalizeAndLinkMerchant(merchantName, id, Number(transaction.amount)).catch(err =>
      Logger.system('ERROR', 'Neo4j', 'Neo4j sync failed after transaction update', { error: err, transactionId: id }, tenantId)
    );
  };

  return { 
    addTransaction, 
    saveReceipt, 
    softDeleteTransaction, 
    updateTransaction,
    // Aliases for compatibility
    addExpense: addTransaction,
    softDeleteExpense: softDeleteTransaction,
    updateExpense: updateTransaction
  };
}
