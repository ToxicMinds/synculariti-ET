import { loadFeature, defineFeature } from 'jest-cucumber';
import path from 'path';

jest.mock('@/lib/ekasa-protocols', () => ({
  extractUniversal: jest.fn(),
  parseEkasaError: jest.fn((status: number, detail?: string) =>
    `eKasa Error (${status}): ${detail || 'Unknown'}`),
}));

jest.mock('@/lib/logger', () => ({
  Logger: { system: jest.fn(), user: jest.fn() },
}));

jest.mock('@/lib/offlineQueue', () => ({
  OfflineQueue: { 
    enqueue: jest.fn(), 
    isOffline: jest.fn(() => !(globalThis.navigator as Navigator | undefined)?.onLine),
  },
}));

import { processScannerInput, clearScannerCache } from '@/lib/scanner-client';
import { extractUniversal } from '@/lib/ekasa-protocols';
import { OfflineQueue } from '@/lib/offlineQueue';

const feature = loadFeature(path.join(__dirname, 'scanner.feature'));

const MOCK_QR = 'O-ABCD1234EFGH5678IJKL9012MNOP3456';
const MOCK_STORE = 'Billa';

const MOCK_GOV_JSON = {
  receiptId: MOCK_QR,
  organizationName: MOCK_STORE,
  createDate: '2026-05-14',
  totalPrice: 15.50,
  ico: '12345678',
  receiptNumber: 'R-001',
  items: [
    { name: 'Mlieko', itemTotalPrice: 1.50 },
    { name: 'Chlieb', itemTotalPrice: 2.00 },
  ],
};

const MOCK_ENRICHED = {
  success: true,
  store: MOCK_STORE,
  date: '2026-05-14',
  total: 15.50,
  items: [
    { name: 'Mlieko', amount: 1.50, category: 'Food' },
    { name: 'Chlieb', amount: 2.00, category: 'Food' },
  ],
  ico: '12345678',
  receiptNumber: 'R-001',
};

const MOCK_INVOICE_DATA = {
  success: true,
  data: {
    store: 'Metro',
    date: '2026-05-14',
    total: 120.00,
    items: [{ name: 'Flour 25kg', amount: 120.00, category: 'Ingredients' }],
  },
};

const MOCK_PREPROCESS_OK = {
  success: true,
  image: 'data:image/webp;base64,processed',
  width: 1200,
  height: 900,
  originalSize: 5000000,
  compressedSize: 250000,
};

function mockFetchOk(data: unknown) {
  (global.fetch as jest.Mock).mockResolvedValueOnce({
    ok: true,
    json: async () => data,
  });
}

function mockFetchError(status: number) {
  (global.fetch as jest.Mock).mockResolvedValueOnce({
    ok: false,
    status,
    json: async () => ({}),
  });
}

function mockFetchHangs() {
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
        if ((options.signal as AbortSignal).aborted) onAbort();
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

defineFeature(feature, (test) => {
  let input: string | File;
  let result: Awaited<ReturnType<typeof processScannerInput>>;

  test('eKasa QR scan returns verified receipt with enrichment', ({ given, when, then, and }) => {
    given('a valid eKasa QR code string', () => {
      (extractUniversal as jest.Mock).mockReturnValue(MOCK_QR);
    });

    when('the scanner processes the input', async () => {
      mockFetchOk(MOCK_GOV_JSON);
      mockFetchOk(MOCK_ENRICHED);
      result = await processScannerInput(MOCK_QR);
    });

    then(/^it should return a successful result with source "(.*)"$/, (source: string) => {
      expect(result.status).toBe('SUCCESS');
      expect(result.source).toBe(source);
    });

    and('the receipt should be linked to the correct store', () => {
      expect(result.data?.store).toBe(MOCK_STORE);
    });

    and('items should have AI-assigned categories from enrichment', () => {
      expect(result.data?.items).toHaveLength(2);
      expect(result.data?.items[0].category).toBe('Food');
    });
  });

  test('Invoice image scan returns estimated receipt with preprocessing', ({ given, when, then, and }) => {
    given('a valid invoice image file', () => {
      input = new File(['fake-invoice'], 'invoice.png', { type: 'image/png' });
    });

    when('the scanner processes the input', async () => {
      mockFetchOk(MOCK_PREPROCESS_OK);
      mockFetchOk(MOCK_INVOICE_DATA);
      result = await processScannerInput(input);
    });

    then(/^it should return a successful result with source "(.*)"$/, (source: string) => {
      expect(result.status).toBe('SUCCESS');
      expect(result.source).toBe(source);
    });

    and('the image should be preprocessed before AI extraction', () => {
      const calls = (global.fetch as jest.Mock).mock.calls;
      expect(calls[0][0]).toBe('/api/ai/preprocess-image');
      expect(calls[1][0]).toBe('/api/ai/parse-invoice');
    });

    and('the receipt should be marked as estimated (not verified)', () => {
      expect(result.source).toBe('AI_VISION');
    });
  });

  test('Preprocessing failure degrades gracefully', ({ given, and, when, then }) => {
    given('a valid invoice image file', () => {
      input = new File(['fake-invoice'], 'invoice.png', { type: 'image/png' });
    });

    and('the preprocess endpoint is unavailable', () => {
      // Preprocess returns 503 — graceful degradation falls back to original image
    });

    when('the scanner processes the input', async () => {
      mockFetchError(503);
      mockFetchOk(MOCK_INVOICE_DATA);
      result = await processScannerInput(input);
    });

    then('it should still succeed using the original image', () => {
      expect(result.status).toBe('SUCCESS');
      expect(result.source).toBe('AI_VISION');
      expect(result.data?.store).toBe('Metro');
    });

    and('the receipt should be marked as estimated', () => {
      expect(result.source).toBe('AI_VISION');
    });
  });

  test('Non-financial document is rejected by AI triage', ({ given, when, then }) => {
    given('a non-financial image file', () => {
      input = new File(['fake'], 'selfie.png', { type: 'image/png' });
    });

    when('the scanner processes the input', async () => {
      mockFetchOk(MOCK_PREPROCESS_OK);
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: false,
          triage: 'REJECTED',
          message: 'No financial data detected',
        }),
      });
      result = await processScannerInput(input);
    });

    then(/^it should return an error with message "(.*)"$/, (msg: string) => {
      expect(result.status).toBe('ERROR');
      expect(result.source).toBe('MANUAL');
      expect(result.error).toContain(msg);
    });
  });

  test('Duplicate scan is served from cache', ({ given, when, then }) => {
    given('a valid eKasa QR code string', () => {
      (extractUniversal as jest.Mock).mockReturnValue(MOCK_QR);
    });

    when('the scanner processes the same input twice', async () => {
      mockFetchOk(MOCK_GOV_JSON);
      mockFetchOk(MOCK_ENRICHED);
      await processScannerInput(MOCK_QR);
      (global.fetch as jest.Mock).mockClear();
      result = await processScannerInput(MOCK_QR);
    });

    then('the second call should not make any network requests', () => {
      expect(result.status).toBe('SUCCESS');
      expect(global.fetch).not.toHaveBeenCalled();
    });
  });

  test('Offline scan is queued for later processing', ({ given, when, then }) => {
    given('the device is offline', () => {
      setupNavigator(false);
    });

    when('the scanner processes a receipt', async () => {
      result = await processScannerInput(MOCK_QR);
    });

    then(/^it should return status "(.*)" without making network calls$/, (status: string) => {
      expect(result.status).toBe(status);
      expect(global.fetch).not.toHaveBeenCalled();
      expect(OfflineQueue.enqueue).toHaveBeenCalledWith('SAVE_RECEIPT', expect.any(Object));
    });
  });

  test('Network timeout falls back to manual entry', ({ given, and, when, then }) => {
    given('a valid eKasa QR code string', () => {
      (extractUniversal as jest.Mock).mockReturnValue(MOCK_QR);
    });

    and('the network request hangs indefinitely', () => {
      mockFetchHangs();
    });

    when('the scanner processes the input', async () => {
      result = await processScannerInput(MOCK_QR, undefined, 50);
    });

    then(/^it should return an error with message "(.*)"$/, (msg: string) => {
      expect(result.status).toBe('ERROR');
      expect(result.error).toContain(msg);
    });

    and(/^the source should be "(.*)"$/, (source: string) => {
      expect(result.source).toBe(source);
    });
  });

  test('AI items carry confidence levels from extraction', ({ given, when, then, and }) => {
    const MOCK_AI_CONFIDENCE = {
      success: true,
      data: {
        store: 'Metro',
        date: '2026-05-14',
        total: 50.00,
        items: [
          { name: 'Flour 25kg', amount: 25.00, category: 'Ingredients', confidence: 'high' },
          { name: 'Blurry Item', amount: 15.00, category: 'Other', confidence: 'medium' },
          { name: 'Freebie', amount: 0, category: 'Promo', confidence: 'high' },
        ],
      },
    };

    given('a valid invoice image file', () => {
      input = new File(['fake'], 'receipt.png', { type: 'image/png' });
    });

    when('the scanner processes an image with mixed legibility', async () => {
      mockFetchOk(MOCK_PREPROCESS_OK);
      mockFetchOk(MOCK_AI_CONFIDENCE);
      result = await processScannerInput(input);
    });

    then(/^items should have "(.*)" or "(.*)" confidence from AI$/, (_high: string, _medium: string) => {
      expect(result.data?.items[0].confidence).toBe('high');
      expect(result.data?.items[1].confidence).toBe('medium');
    });

    and('items with amount zero should be downgraded to "low"', () => {
      expect(result.data?.items[2].confidence).toBe('low');
    });
  });

  test('eKasa items always have high confidence', ({ given, when, then }) => {
    given('a valid eKasa QR code string', () => {
      (extractUniversal as jest.Mock).mockReturnValue(MOCK_QR);
    });

    when('the scanner processes the input', async () => {
      mockFetchOk(MOCK_GOV_JSON);
      mockFetchOk(MOCK_ENRICHED);
      result = await processScannerInput(MOCK_QR);
    });

    then('all items should have confidence "high"', () => {
      expect(result.data?.items.every(i => i.confidence === 'high')).toBe(true);
    });
  });

  test('Confident source label shows verified status in UI', ({ given, when, then }) => {
    given('a valid eKasa QR code string', () => {
      (extractUniversal as jest.Mock).mockReturnValue(MOCK_QR);
    });

    when('the scanner processes the input', async () => {
      mockFetchOk(MOCK_GOV_JSON);
      mockFetchOk(MOCK_ENRICHED);
      result = await processScannerInput(MOCK_QR);
    });

    then('the result should include confidence levels for all items', () => {
      expect(result.status).toBe('SUCCESS');
      expect(result.data?.items.every(i => typeof i.confidence === 'string')).toBe(true);
    });
  });
});
