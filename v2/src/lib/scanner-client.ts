import { Logger } from './logger';
import { OfflineQueue } from './offlineQueue';
import { extractUniversal } from './ekasa-protocols';
import { ReceiptData, ReceiptItem, ItemConfidence } from '@/modules/finance/hooks/useTransactionSync';
import { getErrorMessage } from './utils';

export type ScannerSource = 'EKASA' | 'AI_VISION' | 'MANUAL' | 'OFFLINE_QUEUE';

export interface ScannerResult {
  status: 'SUCCESS' | 'QUEUED' | 'ERROR';
  source: ScannerSource;
  cacheKey: string;
  data?: ReceiptData;
  error?: string;
}

const PROCESSING_TIMEOUT_MS = 15_000;
const resultCache = new Map<string, ScannerResult>();
const FALLBACK_STORE = 'Unknown Store';

function today(): string {
  return new Date().toISOString().split('T')[0];
}

export function clearScannerCache(): void {
  resultCache.clear();
}

function makeCacheKey(input: string | File, hash: string): string {
  return typeof input === 'string' ? `qr:${hash}` : `file:${hash}`;
}

async function computeHash(input: string | File): Promise<string> {
  const data = typeof input === 'string'
    ? new TextEncoder().encode(input)
    : await input.arrayBuffer();
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

async function blobToBase64(blob: Blob): Promise<string> {
  const buffer = await blob.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return `data:${blob.type};base64,${btoa(binary)}`;
}

function fetchWithTimeout(url: string, options: RequestInit, signal: AbortSignal): Promise<Response> {
  return fetch(url, { ...options, signal });
}

// --- Router strategy ---
type InputHandler = (input: string | File, hash: string, signal: AbortSignal, categories?: string[]) => Promise<ScannerResult>;

interface RouterEntry {
  match: (input: string | File) => boolean;
  handle: InputHandler;
}

const routers: RouterEntry[] = [
  { match: (i): i is string => typeof i === 'string', handle: (i, h, s) => processEkasa(i as string, h, s) },
  { match: (i): i is File => i instanceof File, handle: (i, h, s, c) => processAiVision(i as File, h, s, c) },
];

async function processEkasa(qrString: string, hash: string, signal: AbortSignal): Promise<ScannerResult> {
  const parsed = extractUniversal(qrString);
  if (!parsed) {
    return {
      status: 'ERROR',
      source: 'MANUAL',
      cacheKey: hash,
      error: 'Could not find a valid eKasa ID in this QR code.',
    };
  }

  const payload = typeof parsed === 'string' ? { receiptId: parsed } : { okpData: parsed };

  const govResponse = await fetchWithTimeout('/api/ekasa', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  }, signal);

  if (!govResponse.ok) {
    const errorData = await govResponse.json().catch(() => ({})) as { detail?: string };
    const status = govResponse.status;
    let humanMessage: string;
    switch (status) {
      case 403: humanMessage = 'Access Blocked: The Slovak Government has blocked this server region (Paris).'; break;
      case 404: humanMessage = 'Not Found: The receipt has not been uploaded yet (Wait 24-48h).'; break;
      case 429: humanMessage = 'Rate Limited: Too many scans. Please wait 1 minute.'; break;
      case 503: humanMessage = 'Service Maintenance: The Slovak eKasa service is temporarily down.'; break;
      default: humanMessage = `eKasa Error (${status}): ${errorData.detail || 'Unknown failure'}`;
    }
    return { status: 'ERROR', source: 'MANUAL', cacheKey: hash, error: humanMessage };
  }

  const govJson: Record<string, unknown> = await govResponse.json();

  let data: ReceiptData;
  try {
    const enrichmentResponse = await fetchWithTimeout('/api/ai/parse-receipt', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ekasaData: govJson }),
    }, signal);

    if (enrichmentResponse.ok) {
      const enriched = await enrichmentResponse.json() as {
        success: boolean; store: string; date: string; total: number;
        items: Array<{ name: string; amount: number; category: string }>;
        ico?: string | null; receiptNumber?: string | null;
        transactedAt?: string | null; vatDetail?: Record<string, unknown> | null;
      };
      data = {
        store: enriched.store || FALLBACK_STORE,
        date: enriched.date || today(),
        total: enriched.total || 0,
        items: mapItemsWithConfidence(enriched.items || [], it => it.category || ''),
        ico: enriched.ico,
        receiptNumber: enriched.receiptNumber,
        transactedAt: enriched.transactedAt,
        vatDetail: enriched.vatDetail,
      };
    } else {
      data = extractRawGovData(govJson, hash);
    }
  } catch {
    data = extractRawGovData(govJson, hash);
  }

  return { status: 'SUCCESS', source: 'EKASA', cacheKey: hash, data };
}

function extractRawGovData(govJson: Record<string, unknown>, hash: string): ReceiptData {
  const receipt = ((govJson.receipt || govJson.data || govJson) as Record<string, unknown>);
  const rawItems = (receipt.items || receipt.receiptItems || receipt.lines || []) as Array<Record<string, unknown>>;
  const items: ReceiptItem[] = rawItems.map(it => itemFromRaw(it, 'high'));
  const total = Number(receipt.totalPrice || receipt.total || items.reduce((acc, curr) => acc + curr.amount, 0));
  return {
    store: (receipt.organizationName || receipt.merchantName || receipt.name || FALLBACK_STORE) as string,
    date: extractDate(receipt),
    total,
    items,
    ico: (receipt.ico || null) as string | null,
    receiptNumber: (receipt.receiptNumber || null) as string | null,
  };
}

function extractDate(receipt: Record<string, unknown>): string {
  const raw = String(receipt.createDate || receipt.issueDate || receipt.date || '');
  const iso = raw.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const sk = raw.match(/(\d{2})\.(\d{2})\.(\d{4})/);
  if (sk) return `${sk[3]}-${sk[2]}-${sk[1]}`;
  return today();
}

function assignConfidence(item: { name: string; amount: number; confidence?: string }): ItemConfidence {
  const isSuspicious = item.name.length < 3 || item.amount === 0;
  if (item.confidence === 'high' || item.confidence === 'medium' || item.confidence === 'low') {
    return isSuspicious ? 'low' : item.confidence;
  }
  return isSuspicious ? 'low' : 'high';
}

function itemFromRaw(raw: Record<string, unknown>, confidence: ItemConfidence): ReceiptItem {
  const name = (raw.name || raw.itemName || raw.description || 'Unknown Item') as string;
  const amount = Number(raw.itemTotalPrice || raw.lineTotal || raw.price || raw.amount || 0);
  return {
    name,
    amount,
    category: '',
    selected: true,
    confidence: assignConfidence({ name, amount, confidence }),
  };
}

function mapItemsWithConfidence<T extends { name: string; amount: number; confidence?: string }>(
  items: T[],
  categoryFn: (it: T) => string
): ReceiptItem[] {
  return items.map(it => ({
    name: it.name,
    amount: it.amount,
    category: categoryFn(it),
    selected: true,
    confidence: assignConfidence(it),
  }));
}

async function preprocessImageData(dataUrl: string, signal: AbortSignal): Promise<string> {
  try {
    const response = await fetchWithTimeout('/api/ai/preprocess-image', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ image: dataUrl }),
    }, signal);

    if (!response.ok) return dataUrl;

    const result = await response.json() as { success: boolean; image?: string };
    return result.success && result.image ? result.image : dataUrl;
  } catch {
    return dataUrl;
  }
}

async function processAiVision(file: File, hash: string, signal: AbortSignal, categories?: string[]): Promise<ScannerResult> {
  const base64 = await blobToBase64(file);

  const processedImage = await preprocessImageData(base64, signal);

  const response = await fetchWithTimeout('/api/ai/parse-invoice', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ image: processedImage, categories }),
  }, signal);

  const result = await response.json() as {
    success: boolean; data?: Partial<ReceiptData>;
    triage?: string; message?: string; error?: string;
  };

  if (!result.success || !result.data) {
    if (result.triage === 'REJECTED') {
      return {
        status: 'ERROR', source: 'MANUAL', cacheKey: hash,
        error: `Invalid Document: ${result.message}`,
      };
    }
    return {
      status: 'ERROR', source: 'MANUAL', cacheKey: hash,
      error: result.error || 'Failed to parse invoice',
    };
  }

  const parsed = result.data;
  const rawItems = (parsed.items || []).map(it => ({
    name: it.name || 'Unknown Item',
    amount: it.amount ?? 0,
    confidence: it.confidence,
    category: it.category || '',
  }));
  const data: ReceiptData = {
    store: parsed.store || FALLBACK_STORE,
    date: parsed.date || today(),
    total: parsed.total || 0,
    items: mapItemsWithConfidence(rawItems, it => it.category),
    ico: parsed.ico,
    receiptNumber: parsed.receiptNumber,
    transactedAt: parsed.transactedAt,
    vatDetail: parsed.vatDetail,
  };

  return { status: 'SUCCESS', source: 'AI_VISION', cacheKey: hash, data };
}

export async function processScannerInput(
  input: string | File,
  categories?: string[],
  timeoutMs: number = PROCESSING_TIMEOUT_MS
): Promise<ScannerResult> {
  const hash = await computeHash(input);
  const cacheKey = makeCacheKey(input, hash);

  const cached = resultCache.get(cacheKey);
  if (cached) {
    Logger.system('INFO', 'Scanner', 'Idempotency cache hit', { cacheKey });
    return cached;
  }

  if (OfflineQueue.isOffline()) {
    await OfflineQueue.enqueue('SAVE_RECEIPT', {
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

    resultCache.set(cacheKey, result);
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
