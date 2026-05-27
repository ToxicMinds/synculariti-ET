import { processScannerInput, clearScannerCache } from './scanner-client';

jest.mock('./ekasa-protocols', () => ({
  extractUniversal: jest.fn(),
  parseEkasaError: jest.fn((status: number, detail?: string) =>
    `eKasa Error (${status}): ${detail || 'Unknown'}`),
}));

jest.mock('./logger', () => ({
  Logger: { system: jest.fn(), user: jest.fn() },
}));

jest.mock('./offlineQueue', () => ({
  OfflineQueue: { 
    enqueue: jest.fn(), 
    isOffline: jest.fn(() => !(globalThis.navigator as Navigator | undefined)?.onLine),
  },
}));

import { extractUniversal } from './ekasa-protocols';
import { OfflineQueue } from './offlineQueue';

const MOCK_QR_STRING = 'O-12345678901234567890123456789012';
const MOCK_BLOB_TYPE = 'image/jpeg';

const MOCK_GOV_JSON = {
  receiptId: MOCK_QR_STRING,
  organizationName: 'Billa',
  createDate: '2026-05-14',
  totalPrice: 10.50,
  ico: '12345678',
  receiptNumber: 'R-001',
  items: [{ name: 'Bread', itemTotalPrice: 2.50 }, { name: 'Milk', itemTotalPrice: 8.00 }],
};

const MOCK_ENRICHED = {
  success: true,
  store: 'Billa',
  date: '2026-05-14',
  total: 10.50,
  items: [
    { name: 'Bread', amount: 2.50, category: 'Food' },
    { name: 'Milk', amount: 8.00, category: 'Food' },
  ],
  ico: '12345678',
  receiptNumber: 'R-001',
};

const MOCK_INVOICE_DATA = {
  success: true,
  data: {
    store: 'Office Supplies Inc',
    date: '2026-05-14',
    total: 50.00,
    items: [{ name: 'Paper', amount: 50.00, category: 'Office' }],
  },
};

const MOCK_PREPROCESS_OK = {
  success: true,
  image: 'data:image/webp;base64,preprocessed-version',
  width: 1200,
  height: 900,
  originalSize: 5000000,
  compressedSize: 250000,
  originalFormat: 'jpeg',
};

function mockPreprocessOk() {
  mockFetchOnce(MOCK_PREPROCESS_OK);
}

function mockPreprocessFails() {
  mockFetchErrorOnce(503);
}

function mockFetchOnce(data: unknown) {
  (global.fetch as jest.Mock).mockResolvedValueOnce({
    ok: true,
    json: async () => data,
  });
}

function mockFetchErrorOnce(status: number, detail?: string) {
  (global.fetch as jest.Mock).mockResolvedValueOnce({
    ok: false,
    status,
    json: async () => ({ detail }),
  });
}

function mockFetchNeverResolves() {
  (global.fetch as jest.Mock).mockImplementationOnce(
    (_url: string, options: RequestInit) => new Promise<Response>((_resolve, reject) => {
      if (options.signal) {
        const onAbort = () => {
          const err = new Error('The operation was aborted');
          err.name = 'AbortError';
          (options.signal as AbortSignal).removeEventListener('abort', onAbort);
          reject(err);
        };
        (options.signal as AbortSignal).addEventListener('abort', onAbort);
        if ((options.signal as AbortSignal).aborted) {
          onAbort();
        }
      }
    })
  );
}

function setupNavigator(online: boolean) {
  Object.defineProperty(globalThis, 'navigator', {
    value: { onLine: online },
    writable: true,
    configurable: true,
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  clearScannerCache();
  global.fetch = jest.fn();
  (extractUniversal as jest.Mock).mockReset();
  setupNavigator(true);
  jest.spyOn(crypto.subtle, 'digest').mockResolvedValue(
    new Uint8Array(32).buffer as ArrayBuffer
  );
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('processScannerInput: eKasa Routing', () => {
  it('routes a QR string to /api/ekasa and returns source EKASA', async () => {
    (extractUniversal as jest.Mock).mockReturnValue(MOCK_QR_STRING);
    mockFetchOnce(MOCK_GOV_JSON);
    mockFetchOnce(MOCK_ENRICHED);

    const result = await processScannerInput(MOCK_QR_STRING);

    expect(result.status).toBe('SUCCESS');
    expect(result.source).toBe('EKASA');
    expect(result.data?.store).toBe('Billa');
    expect(result.data?.total).toBe(10.50);
    expect(result.data?.items).toHaveLength(2);
    expect(result.data?.items[0].category).toBe('Food');
    expect(global.fetch).toHaveBeenNthCalledWith(1, '/api/ekasa', expect.objectContaining({
      method: 'POST',
    }));
    expect(global.fetch).toHaveBeenNthCalledWith(2, '/api/ai/parse-receipt', expect.objectContaining({
      method: 'POST',
    }));
  });

  it('falls back to raw eKasa data when enrichment fails', async () => {
    (extractUniversal as jest.Mock).mockReturnValue(MOCK_QR_STRING);
    mockFetchOnce(MOCK_GOV_JSON);
    mockFetchErrorOnce(503);

    const result = await processScannerInput(MOCK_QR_STRING);

    expect(result.status).toBe('SUCCESS');
    expect(result.source).toBe('EKASA');
    expect(result.data?.store).toBe('Billa');
    expect(result.data?.items).toHaveLength(2);
    expect(result.data?.items[0].category).toBe('');
  });

  it('returns error for invalid QR string', async () => {
    (extractUniversal as jest.Mock).mockReturnValue(null);

    const result = await processScannerInput('bad-qr');

    expect(result.status).toBe('ERROR');
    expect(result.source).toBe('MANUAL');
    expect(result.error).toContain('valid eKasa ID');
  });

  it('returns error when eKasa API returns 404', async () => {
    (extractUniversal as jest.Mock).mockReturnValue(MOCK_QR_STRING);
    mockFetchErrorOnce(404);

    const result = await processScannerInput(MOCK_QR_STRING);

    expect(result.status).toBe('ERROR');
    expect(result.source).toBe('MANUAL');
    expect(result.error).toContain('Not Found');
  });
});

describe('processScannerInput: AI Vision Routing', () => {
  it('routes a File to /api/ai/parse-invoice and returns source AI_VISION', async () => {
    mockPreprocessOk();
    mockFetchOnce(MOCK_INVOICE_DATA);
    const file = new File(['test'], 'invoice.png', { type: 'image/png' });

    const result = await processScannerInput(file);

    expect(result.status).toBe('SUCCESS');
    expect(result.source).toBe('AI_VISION');
    expect(result.data?.store).toBe('Office Supplies Inc');
    expect(global.fetch).toHaveBeenCalledWith('/api/ai/preprocess-image', expect.objectContaining({
      method: 'POST',
    }));
    expect(global.fetch).toHaveBeenCalledWith('/api/ai/parse-invoice', expect.objectContaining({
      method: 'POST',
    }));
    expect(global.fetch).not.toHaveBeenCalledWith('/api/ekasa', expect.anything());
  });

  it('preprocesses the image before sending to AI parse', async () => {
    mockPreprocessOk();
    mockFetchOnce(MOCK_INVOICE_DATA);
    const file = new File(['test'], 'invoice.png', { type: 'image/png' });

    await processScannerInput(file);

    expect(global.fetch).toHaveBeenNthCalledWith(1, '/api/ai/preprocess-image', expect.objectContaining({
      method: 'POST',
    }));
    expect(global.fetch).toHaveBeenNthCalledWith(2, '/api/ai/parse-invoice', expect.objectContaining({
      method: 'POST',
    }));
  });

  it('falls back to original image when preprocessing fails', async () => {
    mockPreprocessFails();
    mockFetchOnce(MOCK_INVOICE_DATA);
    const file = new File(['test'], 'invoice.png', { type: 'image/png' });

    const result = await processScannerInput(file);

    expect(result.status).toBe('SUCCESS');
    expect(result.source).toBe('AI_VISION');
    expect(result.data?.store).toBe('Office Supplies Inc');
  });

  it('passes categories to the AI endpoint', async () => {
    mockPreprocessOk();
    mockFetchOnce(MOCK_INVOICE_DATA);
    const file = new File(['test'], 'invoice.png', { type: 'image/png' });

    await processScannerInput(file, ['Food', 'Office']);

    expect(global.fetch).toHaveBeenCalledWith(
      '/api/ai/parse-invoice',
      expect.objectContaining({
        body: expect.stringContaining('Food'),
      })
    );
  });

  it('returns error when AI rejects the document', async () => {
    mockPreprocessOk();
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        success: false,
        triage: 'REJECTED',
        message: 'No financial data detected',
      }),
    });
    const file = new File(['test'], 'receipt.png', { type: 'image/png' });

    const result = await processScannerInput(file);

    expect(result.status).toBe('ERROR');
    expect(result.source).toBe('MANUAL');
    expect(result.error).toContain('Invalid Document');
  });
});

describe('processScannerInput: Confidence Scoring (EKASA)', () => {
  it('sets high confidence on all enriched eKasa items', async () => {
    (extractUniversal as jest.Mock).mockReturnValue(MOCK_QR_STRING);
    mockFetchOnce(MOCK_GOV_JSON);
    mockFetchOnce(MOCK_ENRICHED);

    const result = await processScannerInput(MOCK_QR_STRING);

    expect(result.status).toBe('SUCCESS');
    expect(result.data?.items.every(i => i.confidence === 'high')).toBe(true);
  });

  it('sets high confidence on raw eKasa fallback items', async () => {
    (extractUniversal as jest.Mock).mockReturnValue(MOCK_QR_STRING);
    mockFetchOnce(MOCK_GOV_JSON);
    mockFetchErrorOnce(503);

    const result = await processScannerInput(MOCK_QR_STRING);

    expect(result.status).toBe('SUCCESS');
    expect(result.data?.items.every(i => i.confidence === 'high')).toBe(true);
  });
});

describe('processScannerInput: Confidence Scoring (AI Vision)', () => {
  it('propagates confidence from AI response', async () => {
    mockPreprocessOk();
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        success: true,
        data: {
          store: 'Test Shop',
          date: '2026-05-14',
          total: 15.00,
          items: [
            { name: 'Coffee', amount: 5.00, category: 'Food', confidence: 'high' },
            { name: 'Blurry Item', amount: 10.00, category: 'Other', confidence: 'medium' },
          ],
        },
      }),
    });
    const file = new File(['test'], 'receipt.png', { type: 'image/png' });

    const result = await processScannerInput(file);

    expect(result.status).toBe('SUCCESS');
    expect(result.data?.items[0].confidence).toBe('high');
    expect(result.data?.items[1].confidence).toBe('medium');
  });

  it('defaults to high confidence when AI omits confidence field', async () => {
    mockPreprocessOk();
    mockFetchOnce(MOCK_INVOICE_DATA);
    const file = new File(['test'], 'receipt.png', { type: 'image/png' });

    const result = await processScannerInput(file);

    expect(result.status).toBe('SUCCESS');
    expect(result.data?.items[0].confidence).toBe('high');
  });

  it('auto-downgrades low confidence for items with name < 3 chars', async () => {
    mockPreprocessOk();
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        success: true,
        data: {
          store: 'Test',
          date: '2026-05-14',
          total: 10.00,
          items: [
            { name: 'AB', amount: 10.00, category: 'Other', confidence: 'high' },
          ],
        },
      }),
    });
    const file = new File(['test'], 'receipt.png', { type: 'image/png' });

    const result = await processScannerInput(file);

    expect(result.data?.items[0].confidence).toBe('low');
  });

  it('auto-downgrades low confidence for items with amount === 0', async () => {
    mockPreprocessOk();
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        success: true,
        data: {
          store: 'Test',
          date: '2026-05-14',
          total: 0,
          items: [
            { name: 'Free Item', amount: 0, category: 'Other', confidence: 'high' },
          ],
        },
      }),
    });
    const file = new File(['test'], 'receipt.png', { type: 'image/png' });

    const result = await processScannerInput(file);

    expect(result.data?.items[0].confidence).toBe('low');
  });
});

describe('processScannerInput: Idempotency', () => {
  it('returns cached result on second call with same input, no extra fetch', async () => {
    (extractUniversal as jest.Mock).mockReturnValue(MOCK_QR_STRING);
    mockFetchOnce(MOCK_GOV_JSON);
    mockFetchOnce(MOCK_ENRICHED);

    const result1 = await processScannerInput(MOCK_QR_STRING);
    expect(result1.status).toBe('SUCCESS');

    (global.fetch as jest.Mock).mockClear();

    const result2 = await processScannerInput(MOCK_QR_STRING);
    expect(result2.status).toBe('SUCCESS');
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('allows a fresh request after cache is cleared', async () => {
    (extractUniversal as jest.Mock).mockReturnValue(MOCK_QR_STRING);
    mockFetchOnce(MOCK_GOV_JSON);
    mockFetchOnce(MOCK_ENRICHED);

    await processScannerInput(MOCK_QR_STRING);

    (global.fetch as jest.Mock).mockClear();
    clearScannerCache();

    mockFetchOnce(MOCK_GOV_JSON);
    mockFetchOnce(MOCK_ENRICHED);

    const result = await processScannerInput(MOCK_QR_STRING);
    expect(result.status).toBe('SUCCESS');
    expect(global.fetch).toHaveBeenCalledTimes(2);
  });
});

describe('processScannerInput: Offline Resilience', () => {
  it('returns QUEUED when navigator.onLine is false', async () => {
    setupNavigator(false);

    const result = await processScannerInput(MOCK_QR_STRING);

    expect(result.status).toBe('QUEUED');
    expect(result.source).toBe('OFFLINE_QUEUE');
    expect(global.fetch).not.toHaveBeenCalled();
    expect(OfflineQueue.enqueue).toHaveBeenCalledWith('SAVE_RECEIPT', expect.any(Object));
  });
});

describe('processScannerInput: Timeout Recovery', () => {
  it('returns ERROR with source MANUAL when network times out', async () => {
    (extractUniversal as jest.Mock).mockReturnValue(MOCK_QR_STRING);
    mockFetchNeverResolves();

    const result = await processScannerInput(MOCK_QR_STRING, undefined, 50);

    expect(result.status).toBe('ERROR');
    expect(result.source).toBe('MANUAL');
    expect(result.error).toContain('timed out');
  });
});
