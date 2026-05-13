import { Logger } from './logger';

export interface QueuedMutation {
  id: string;
  type: 'ADD_TRANSACTION' | 'SAVE_RECEIPT';
  payload: unknown;
  timestamp: number;
  retryCount: number;
}

const QUEUE_KEY = 'et_offline_queue';
const LOCK_KEY = 'et_offline_lock';

export class OfflineQueue {
  static readonly MAX_RETRY = 5;

  /**
   * Public helper to ensure mutual exclusion across tabs for complex sequences
   */
  public static async withLock<T>(fn: () => Promise<T> | T): Promise<T> {
    if (typeof window === 'undefined' || !('locks' in navigator)) {
      return await fn();
    }
    return await (navigator as any).locks.request(LOCK_KEY, async () => {
      return await fn();
    });
  }

  static getQueue(): QueuedMutation[] {
    if (typeof window === 'undefined') return [];
    try {
      const q = localStorage.getItem(QUEUE_KEY);
      return q ? JSON.parse(q) : [];
    } catch (e: unknown) {
      Logger.system('ERROR', 'OfflineQueue', 'Failed to read queue', { 
        error: e instanceof Error ? e.message : String(e) 
      });
      return [];
    }
  }

  static async enqueue(type: 'ADD_TRANSACTION' | 'SAVE_RECEIPT', payload: unknown): Promise<string | undefined> {
    if (typeof window === 'undefined') return;

    return await this.withLock(async () => {
      try {
        const q = this.getQueue();
        const id = crypto.randomUUID();
        q.push({
          id,
          type,
          payload,
          timestamp: Date.now(),
          retryCount: 0
        });
        localStorage.setItem(QUEUE_KEY, JSON.stringify(q));
        Logger.system('INFO', 'OfflineQueue', 'Mutation queued for offline execution', { 
          id, 
          type 
        });
        return id;
      } catch (e: unknown) {
        Logger.system('ERROR', 'OfflineQueue', 'Failed to enqueue mutation', { 
          type, 
          error: e instanceof Error ? e.message : String(e) 
        });
        return undefined;
      }
    });
  }

  static async dequeue(id: string): Promise<void> {
    if (typeof window === 'undefined') return;

    await this.withLock(async () => {
      const q = this.getQueue();
      const initialLength = q.length;
      const newQ = q.filter(item => item.id !== id);
      
      if (newQ.length < initialLength) {
        localStorage.setItem(QUEUE_KEY, JSON.stringify(newQ));
        Logger.system('INFO', 'OfflineQueue', 'Mutation successfully dequeued', { id });
      }
    });
  }

  static async incrementRetry(id: string): Promise<void> {
    if (typeof window === 'undefined') return;

    await this.withLock(async () => {
      const q = this.getQueue();
      const idx = q.findIndex(i => i.id === id);
      
      if (idx !== -1) {
        q[idx].retryCount += 1;
        
        if (q[idx].retryCount >= this.MAX_RETRY) {
          const failed = q.splice(idx, 1)[0];
          localStorage.setItem(QUEUE_KEY, JSON.stringify(q));
          Logger.system('ERROR', 'OfflineQueue', 'Mutation permanently evicted after max retries', {
            id: failed.id,
            type: failed.type,
            retryCount: failed.retryCount,
            payload: failed.payload
          });
        } else {
          localStorage.setItem(QUEUE_KEY, JSON.stringify(q));
        }
      }
    });
  }
}
