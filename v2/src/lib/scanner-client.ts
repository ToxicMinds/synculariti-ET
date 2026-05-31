import { Logger } from './logger';
import { OfflineQueue } from './offlineQueue';
import { processEkasa } from './scanner-ekasa';
import { processAiVision } from './scanner-vision';
import { computeHash, makeCacheKey, cacheGet, cacheSet, clearScannerCache, ScannerResult } from './scanner-cache';
import { getErrorMessage } from './utils';
import { QUEUE_SAVE_RECEIPT } from '@/lib/constants';

export type { ScannerSource, ScannerResult } from './scanner-cache';
export { clearScannerCache } from './scanner-cache';

const PROCESSING_TIMEOUT_MS = 15_000;

type InputHandler = (input: string | File, hash: string, signal: AbortSignal, categories?: string[]) => Promise<ScannerResult>;

interface RouterEntry {
  match: (input: string | File) => boolean;
  handle: InputHandler;
}

const routers: RouterEntry[] = [
  { match: (i): i is string => typeof i === 'string', handle: (i, h, s) => processEkasa(i as string, h, s) },
  { match: (i): i is File => i instanceof File, handle: (i, h, s, c) => processAiVision(i as File, h, s, c) },
];

export async function processScannerInput(
  input: string | File,
  categories?: string[],
  timeoutMs: number = PROCESSING_TIMEOUT_MS
): Promise<ScannerResult> {
  const hash = await computeHash(input);
  const cacheKey = makeCacheKey(input, hash);

  const cached = cacheGet(cacheKey);
  if (cached) {
    Logger.system('INFO', 'Scanner', 'Idempotency cache hit', { cacheKey });
    return cached;
  }

  if (OfflineQueue.isOffline()) {
    await OfflineQueue.enqueue(QUEUE_SAVE_RECEIPT, {
      input: typeof input === 'string' ? input : '[file]',
      hash,
    });
    const result: ScannerResult = {
      status: 'QUEUED', source: 'OFFLINE_QUEUE', cacheKey,
    };
    Logger.system('INFO', 'Scanner', 'Device offline — receipt queued', { cacheKey });
    return result;
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const router = routers.find(r => r.match(input));
    if (!router) {
      return { status: 'ERROR', source: 'MANUAL', cacheKey, error: 'Unsupported input type' };
    }
    const result = await router.handle(input, cacheKey, controller.signal, categories);

    cacheSet(cacheKey, result);
    return result;
  } catch (e: unknown) {
    const isAbort = e instanceof Error && e.name === 'AbortError';
    const errorMsg = isAbort
      ? 'Receipt processing timed out'
      : getErrorMessage(e);

    Logger.system('ERROR', 'Scanner', errorMsg, { cacheKey });

    return {
      status: 'ERROR',
      source: 'MANUAL',
      cacheKey,
      error: errorMsg,
    };
  } finally {
    clearTimeout(timeoutId);
  }
}
