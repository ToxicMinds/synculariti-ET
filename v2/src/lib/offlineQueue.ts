import { Logger } from './logger';

export interface QueuedMutation {
  id: string;
  type: 'ADD_TRANSACTION' | 'SAVE_RECEIPT';
  payload: unknown;
  timestamp: number;
  retryCount: number;
}

const QUEUE_KEY = 'et_offline_queue';

export class OfflineQueue {
  static getQueue(): QueuedMutation[] {
    if (typeof window === 'undefined') return [];
    try {
      const q = localStorage.getItem(QUEUE_KEY);
      return q ? JSON.parse(q) : [];
    } catch (e: unknown) {
      Logger.system('ERROR', 'OfflineQueue', 'Failed to read queue', { error: e instanceof Error ? e.message : String(e) });
      return [];
    }
  }

  static enqueue(type: 'ADD_TRANSACTION' | 'SAVE_RECEIPT', payload: unknown): void {
    if (typeof window === 'undefined') return;
    const q = this.getQueue();
    q.push({
      id: crypto.randomUUID(),
      type,
      payload,
      timestamp: Date.now(),
      retryCount: 0
    });
    localStorage.setItem(QUEUE_KEY, JSON.stringify(q));
    Logger.system('INFO', 'OfflineQueue', 'Mutation queued for offline execution', { type, payload: payload as Record<string, unknown> });
  }

  static dequeue(id: string): void {
    if (typeof window === 'undefined') return;
    const q = this.getQueue();
    const newQ = q.filter(item => item.id !== id);
    localStorage.setItem(QUEUE_KEY, JSON.stringify(newQ));
  }

  static incrementRetry(id: string): void {
    if (typeof window === 'undefined') return;
    const q = this.getQueue();
    const item = q.find(i => i.id === id);
    if (item) {
      item.retryCount += 1;
      localStorage.setItem(QUEUE_KEY, JSON.stringify(q));
    }
  }
}
