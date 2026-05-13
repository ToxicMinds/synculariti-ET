import { supabase } from '@/lib/supabase';
import { Transaction } from '../lib/finance';
import { Logger } from '@/lib/logger';
import { useTenantContext } from '@/context/TenantContext';
import { OfflineQueue } from '@/lib/offlineQueue';

export interface ReceiptItem {
  id?: string;
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
  vatDetail?: Record<string, unknown> | null;
}

export function useTransactionSync(tenantId: string | undefined) {
  const { triggerRefresh } = useTenantContext();

  const addTransaction = async (transaction: Partial<Transaction> | Partial<Transaction>[]) => {
    if (!tenantId) return;

    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      await OfflineQueue.enqueue('ADD_TRANSACTION', transaction);
      triggerRefresh();
      return;
    }

    const items = (Array.isArray(transaction) ? transaction : [transaction]).map(t => ({
      ...t,
      id: t.id || crypto.randomUUID(),
      tenant_id: tenantId
    }));

    const { data: savedIds, error } = await supabase.rpc('add_transactions_bulk_v1', {
      p_transactions: items
    });

    if (error) {
      Logger.system('ERROR', 'Sync', 'add_transactions_bulk_v1 RPC failed', { error }, tenantId);
      throw error;
    }

    Logger.user(tenantId, 'TRANSACTION_ADDED', `Added ${items.length} manual transaction(s)`, 'Tenant Member');
    triggerRefresh();
  };

  const saveReceipt = async (
    receipt: ReceiptData, 
    whoId: string, 
    whoName: string, 
    locationId?: string, 
    currency: string = 'EUR'
  ) => {
    if (!tenantId) throw new Error('No tenant ID');

    const selectedItems = receipt.items.filter(i => i.selected);
    if (selectedItems.length === 0) throw new Error('No items selected');

    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      await OfflineQueue.enqueue('SAVE_RECEIPT', { receipt, whoId, whoName, locationId, currency });
      triggerRefresh();
      return;
    }

    const catCounts: Record<string, number> = {};
    selectedItems.forEach(i => catCounts[i.category] = (catCounts[i.category] || 0) + 1);
    const primaryCategory = Object.entries(catCounts).sort((a, b) => b[1] - a[1])[0][0];

    const transactionId = crypto.randomUUID();
    const totalAmount = selectedItems.reduce((acc, curr) => acc + curr.amount, 0);

    const transactionPayload = {
      id: transactionId,
      tenant_id: tenantId,
      location_id: locationId || null,
      who_id: whoId,
      who: whoName,
      category: primaryCategory,
      amount: totalAmount,
      currency,
      date: receipt.date,
      description: receipt.store,
      ico: receipt.ico || null,
      receipt_number: receipt.receiptNumber || null,
      transacted_at: receipt.transactedAt || null,
      vat_detail: receipt.vatDetail || null,
      transaction_type: 'DEBIT'
    };

    const itemsPayload = selectedItems.map(item => ({
      id: item.id || crypto.randomUUID(),
      name: item.name,
      amount: item.amount,
      category: item.category
    }));

    let attempt = 0;
    const maxAttempts = 3;
    let lastError: unknown = null;

    while (attempt < maxAttempts) {
      try {
        const { data, error } = await supabase.rpc('save_receipt_v4', {
          p_transaction: transactionPayload,
          p_items: itemsPayload,
          p_location_id: locationId || null
        });

        if (error) throw error;

        Logger.user(tenantId, 'TRANSACTION_ADDED', `Scanned receipt from ${receipt.store} (€${totalAmount.toFixed(2)})`, whoName);
        triggerRefresh();

        return data;
      } catch (err: unknown) {
        lastError = err;
        attempt++;
        if (attempt < maxAttempts) {
          const delay = Math.pow(2, attempt) * 1000;
          Logger.system('WARN', 'Sync', `saveReceipt retry ${attempt}/${maxAttempts}`, { error: err, delay }, tenantId);
          await new Promise(resolve => setTimeout(resolve, delay));
        } else {
          Logger.system('ERROR', 'Sync', 'saveReceipt failed after max retries', { error: err }, tenantId);
        }
      }
    }

    throw lastError;
  };

  const softDeleteTransaction = async (id: string) => {
    if (!tenantId) return;
    const { error } = await supabase.rpc('soft_delete_transaction_v1', { p_id: id });

    if (error) {
      Logger.system('ERROR', 'Sync', 'softDeleteTransaction failed', { id, error }, tenantId);
      throw error;
    }

    Logger.user(tenantId, 'TRANSACTION_DELETED', `Removed a transaction record`, 'Tenant Member');
    triggerRefresh();
  };

  const updateTransaction = async (id: string, transaction: Partial<Transaction> & { merchant?: string }) => {
    if (!tenantId) return;

    const { merchant, id: _id, created_at, updated_at, tenant_id: _t, ...pureTransaction } = transaction as Partial<Transaction> & { merchant?: string; created_at?: string; updated_at?: string; tenant_id?: string };

    const { error } = await supabase.rpc('update_transaction_v1', {
      p_id: id,
      p_transaction: pureTransaction
    });

    if (error) throw error;

    Logger.user(tenantId, 'TRANSACTION_UPDATED', `Updated details for ${transaction.description || 'a transaction'}`, 'Tenant Member');
    triggerRefresh();
  };

  return { 
    addTransaction, 
    saveReceipt, 
    softDeleteTransaction, 
    updateTransaction
  };
}
