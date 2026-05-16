import { Transaction } from '../lib/finance';
import { useTransactionSync, ReceiptData } from './useTransactionSync';
import { useOfflineQueue } from './useOfflineQueue';

export type { ReceiptData };

/**
 * useSync Hook (SOLID: Facade Pattern)
 * RESPONSIBILITY: Centralized API for Finance mutations. 
 * Delegates to useTransactionSync (ACID) and useOfflineQueue (Resilience).
 * Graph sync (Neo4j) is handled server-side via the graph_sync_queue outbox (C-05).
 */
export function useSync(tenantId: string | undefined) {
  const { addTransaction, saveReceipt, softDeleteTransaction, updateTransaction } = useTransactionSync(tenantId);

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
