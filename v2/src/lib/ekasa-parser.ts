/**
 * eKasa Protocol Parsing Logic
 * Extracted from the API route to ensure 100% test coverage of financial/metadata extraction.
 */

export interface EkasaMetadata {
  store: string;
  dic: string | null;
  ico: string | null;
  receiptNumber: string | null;
  date: string | null;
  transactedAt: string | null;
  total: number;
  items: Array<{ originalName: string; amount: number }>;
  vatDetail: {
    basic: { base: number; amount: number; rate: number };
    reduced: { base: number; amount: number; rate: number };
  };
}

export function parseEkasaMetadata(ekasaData: unknown): EkasaMetadata {
  const d = (ekasaData || {}) as Record<string, any>;
  const receipt = d.receipt || d.data || d;

  // 1. Store Name Extraction
  const rawStore = 
    receipt.organization?.name || 
    receipt.seller?.name || 
    receipt.organizationName || 
    receipt.merchantName || 
    receipt.name || 
    d.organization?.name || 
    d.organizationName || 
    null;

  const store = cleanStoreName(rawStore);

  // 2. Tax Identifiers
  const dic = receipt.organization?.dic || receipt.dic || d.dic || null;
  const ico = receipt.organization?.ico || receipt.ico || d.ico || null;
  const receiptNumber = receipt.receiptNumber || d.receiptNumber || null;

  // 3. Date & Time Extraction
  let date = null;
  let transactedAt = null;
  
  const rawDate = String(receipt.createDate || receipt.issueDate || receipt.date || '');
  
  // Extract Date (YYYY-MM-DD)
  const isoMatch = rawDate.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (isoMatch) {
    date = `${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}`;
  } else {
    const skMatch = rawDate.match(/(\d{2})\.(\d{2})\.(\d{4})/);
    if (skMatch) {
      date = `${skMatch[3]}-${skMatch[2]}-${skMatch[1]}`;
    }
  }

  // Extract Exact Time (transactedAt)
  const rawTime = String(receipt.issueTime || receipt.createTime || '');
  if (date) {
    if (rawTime && rawTime !== 'undefined') {
       transactedAt = `${date}T${rawTime}:00Z`; // Construct ISO
    } else if (rawDate.includes('T')) {
       transactedAt = rawDate; // Already ISO
    } else {
       transactedAt = `${date}T00:00:00Z`; // Fallback
    }
  }

  // 4. Items & Total
  const rawItems = (receipt.items || receipt.receiptItems || receipt.lines || []) as Array<Record<string, unknown>>;
  const items = rawItems.map((it) => ({
    originalName: (it.name || it.itemName || it.description || 'Unknown Item') as string,
    amount: Number(it.itemTotalPrice || it.lineTotal || it.price || it.amount || 0)
  }));

  const total = Number(receipt.totalPrice || receipt.total || items.reduce((acc: number, curr: { amount: number }) => acc + curr.amount, 0));

  // 5. VAT Extraction
  const vatDetail = {
    basic: {
      base: Number(receipt.taxBaseBasic || 0),
      amount: Number(receipt.vatAmountBasic || 0),
      rate: Number(receipt.vatRateBasic || 20)
    },
    reduced: {
      base: Number(receipt.taxBaseReduced || 0),
      amount: Number(receipt.vatAmountReduced || 0),
      rate: Number(receipt.vatRateReduced || 10)
    }
  };

  return {
    store,
    dic,
    ico,
    receiptNumber,
    date,
    transactedAt,
    total,
    items,
    vatDetail
  };
}

export function cleanStoreName(name: string | null): string {
  if (!name || name === 'Slovak Receipt') return 'Slovak Receipt';
  return name
    .replace(/,?\s*(s\.r\.o\.|v\.o\.s\.|a\.s\.|k\.s\.|o\.z\.)/gi, '')
    .replace(/Slovenská republika/gi, '')
    .trim();
}
