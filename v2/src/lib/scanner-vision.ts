import { ReceiptData } from '@/modules/finance/hooks/useTransactionSync';
import { ScannerResult } from './scanner-cache';
import { mapItemsWithConfidence } from './scanner-ekasa';
import { getErrorMessage } from './utils';

const FALLBACK_STORE = 'Unknown Store';

function today(): string {
  return new Date().toISOString().split('T')[0];
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

async function preprocessImageData(dataUrl: string, signal: AbortSignal): Promise<string> {
  try {
    const response = await fetch('/api/ai/preprocess-image', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ image: dataUrl }),
      signal,
    });

    if (!response.ok) return dataUrl;

    const result = await response.json() as { success: boolean; image?: string };
    return result.success && result.image ? result.image : dataUrl;
  } catch {
    return dataUrl;
  }
}

export async function processAiVision(file: File, hash: string, signal: AbortSignal, categories?: string[]): Promise<ScannerResult> {
  const base64 = await blobToBase64(file);

  const processedImage = await preprocessImageData(base64, signal);

  const response = await fetch('/api/ai/parse-invoice', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ image: processedImage, categories }),
    signal,
  });

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
