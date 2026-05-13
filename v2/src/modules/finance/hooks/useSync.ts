import { Transaction } from '../lib/finance';
import { useTransactionSync, ReceiptData } from './useTransactionSync';
import { useNeo4jSync } from './useNeo4jSync';
import { useOfflineQueue } from './useOfflineQueue';

export type { ReceiptData };

/**
 * useSync Hook (SOLID: Facade Pattern)
 * RESPONSIBILITY: Centralized API for Finance mutations. 
 * Delegates to useTransactionSync (ACID), useNeo4jSync (Intelligence), and useOfflineQueue.
 */
export function useSync(tenantId: string | undefined) {
  const { linkMerchant, linkTransactionsBulk } = useNeo4jSync(tenantId);

  const { addTransaction, saveReceipt, softDeleteTransaction, updateTransaction } = useTransactionSync(tenantId, {
    onTransactionAdded: (transactions, savedIds) => linkTransactionsBulk(transactions, savedIds),
    onReceiptSaved: (receipt, transactionId, totalAmount) => linkMerchant(transactionId, totalAmount, receipt.store, receipt.ico || undefined),
    onTransactionUpdated: (id, transaction) => {
      const merchantName = transaction.merchant || transaction.description || 'Unknown Merchant';
      linkMerchant(id, Number(transaction.amount), merchantName);
    }
  });

  useOfflineQueue(tenantId, { addTransaction, saveReceipt });

  return { 
    addTransaction, 
    saveReceipt, 
    softDeleteTransaction, 
    updateTransaction,
    // Aliases for legacy compatibility
    addExpense: addTransaction,
    softDeleteExpense: softDeleteTransaction,
    updateExpense: updateTransaction
  };
}
