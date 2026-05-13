import { useEffect } from 'react';
import { OfflineQueue } from '@/lib/offlineQueue';
import { Logger } from '@/lib/logger';
import { Transaction } from '../lib/finance';
import { ReceiptData } from './useTransactionSync';

interface SyncCallbacks {
  addTransaction: (transaction: Partial<Transaction> | Partial<Transaction>[]) => Promise<void>;
  saveReceipt: (receipt: ReceiptData, whoId: string, whoName: string, locationId?: string, currency?: string) => Promise<any>;
}

export function useOfflineQueue(tenantId: string | undefined, callbacks: SyncCallbacks) {
  useEffect(() => {
    if (typeof window === 'undefined' || !tenantId) return;
    
    const handleOnline = async () => {
      const q = OfflineQueue.getQueue();
      if (q.length === 0) return;
      
      Logger.system('INFO', 'OfflineQueue', `Flushing ${q.length} queued mutations`, {}, tenantId);
      
      for (const item of q) {
        try {
          if (item.type === 'ADD_TRANSACTION') {
            await callbacks.addTransaction(item.payload as Partial<Transaction> | Partial<Transaction>[]);
          } else if (item.type === 'SAVE_RECEIPT') {
            const p = item.payload as { receipt: ReceiptData; whoId: string; whoName: string; locationId?: string; currency?: string };
            await callbacks.saveReceipt(p.receipt, p.whoId, p.whoName, p.locationId, p.currency);
          }
          OfflineQueue.dequeue(item.id);
        } catch (e: unknown) {
          OfflineQueue.incrementRetry(item.id);
          Logger.system('ERROR', 'OfflineQueue', `Failed to flush item ${item.id}`, { error: e });
        }
      }
    };

    window.addEventListener('online', handleOnline);
    return () => window.removeEventListener('online', handleOnline);
  }, [tenantId, callbacks]);
}
