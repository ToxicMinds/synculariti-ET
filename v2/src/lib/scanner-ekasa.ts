import { extractUniversal } from './ekasa-protocols';
import { ReceiptData, ReceiptItem, ItemConfidence } from '@/modules/finance/hooks/useTransactionSync';
import { ScannerResult } from './scanner-cache';

const FALLBACK_STORE = 'Unknown Store';

function today(): string {
  return new Date().toISOString().split('T')[0];
}

export async function processEkasa(qrString: string, hash: string, signal: AbortSignal): Promise<ScannerResult> {
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

  const govResponse = await fetch('/api/ekasa', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    signal,
  });

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
    const enrichmentResponse = await fetch('/api/ai/parse-receipt', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ekasaData: govJson }),
      signal,
    });

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
      data = extractRawGovData(govJson);
    }
  } catch {
    data = extractRawGovData(govJson);
  }

  return { status: 'SUCCESS', source: 'EKASA', cacheKey: hash, data };
}

function extractRawGovData(govJson: Record<string, unknown>): ReceiptData {
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

export function mapItemsWithConfidence<T extends { name: string; amount: number; confidence?: string }>(
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
