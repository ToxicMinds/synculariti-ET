
/**
 * eKasa Protocol Intelligence (Isolation Lab)
 * RESPONSIBILITY: Extracting IDs from varied QR formats without breaking production.
 */

export interface OkpData {
  okp: string;
  cashRegisterCode: string;
  date: string;
  number: string;
  total: string;
}

export type ExtractionResult = string | OkpData | null;

/**
 * Baseline Extraction (The "Yesterday" logic)
 * Focused on reliable Online IDs.
 */
export function extractBaselineId(txt: string): string | null {
  const m = txt.match(/O-[0-9A-F]{32}/i);
  if (m) return m[0].toUpperCase();
  const mUrl = txt.match(/id=([0-9A-F]{32})/i);
  if (mUrl && mUrl[1]) return 'O-' + mUrl[1].toUpperCase();
  return null;
}

/**
 * OKP Protocol Extraction (The "2026/Offline" logic)
 * Focused on Raw Data Strings.
 */
export function extractOkpData(txt: string): OkpData | null {
  if (!txt.includes(':')) return null;
  const parts = txt.split(':');
  if (parts.length >= 5) {
    return {
      okp: parts[0],
      cashRegisterCode: parts[1],
      date: parts[2],
      number: parts[3],
      total: parts[4]
    };
  }
  return null;
}

/**
 * Universal Extraction (Safe Fallback Pattern)
 * Tries baseline first, then OKP.
 */
export function extractUniversal(txt: string): ExtractionResult {
  if (!txt) return null;
  
  // 1. Try Baseline (Most reliable, zero noise)
  const baseline = extractBaselineId(txt);
  if (baseline) return baseline;
  
  // 2. Try OKP (Protocol fallback)
  return extractOkpData(txt);
}

/**
 * Human Readable Error Parsing
 * Translates raw status codes into actionable advice.
 */
export function parseEkasaError(status: number, detail?: string): string {
  switch (status) {
    case 403:
      return "Access Blocked: The Slovak Government has blocked this server region (Paris).";
    case 404:
      return "Not Found: The receipt hasn't been uploaded to the government server yet (Wait 24-48h).";
    case 429:
      return "Rate Limited: Too many scans in a short time. Please wait 1 minute.";
    case 503:
      return "Service Maintenance: The Slovak eKasa service is temporarily down (Common on Sundays).";
    default:
      return `eKasa Error (${status}): ${detail || 'Unknown failure'}`;
  }
}
