import { ReceiptData } from '@/modules/finance/hooks/useTransactionSync';

export type ScannerSource = 'EKASA' | 'AI_VISION' | 'MANUAL' | 'OFFLINE_QUEUE';

export interface ScannerResult {
  status: 'SUCCESS' | 'QUEUED' | 'ERROR';
  source: ScannerSource;
  cacheKey: string;
  data?: ReceiptData;
  error?: string;
}

const resultCache = new Map<string, ScannerResult>();

export function clearScannerCache(): void {
  resultCache.clear();
}

export function cacheGet(key: string): ScannerResult | undefined {
  return resultCache.get(key);
}

export function cacheSet(key: string, result: ScannerResult): void {
  resultCache.set(key, result);
}

export function makeCacheKey(input: string | File, hash: string): string {
  return typeof input === 'string' ? `qr:${hash}` : `file:${hash}`;
}

export async function computeHash(input: string | File): Promise<string> {
  const data = typeof input === 'string'
    ? new TextEncoder().encode(input)
    : await input.arrayBuffer();
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}
