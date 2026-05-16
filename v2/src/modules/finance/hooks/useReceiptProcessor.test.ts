/**
 * useReceiptProcessor Contract Tests (Batch H - Phase 2)
 * =======================================================
 * These tests are IMMUTABLE. Do NOT alter them during Phase 3.
 * They define the intelligence pipeline contract for the ReceiptScanner.
 *
 * Enforces:
 * - Idempotency: Same hash = cached result, no network call
 * - Offline Resilience: navigator.onLine = false → QUEUED state, not ERROR
 * - Timeout Recovery: Hung network → AbortController triggers MANUAL fallback
 * - eKasa Priority: Valid QR string routes to eKasa, not AI Vision
 * - Source Tracking: Result always includes canonical source for observability
 */

import { renderHook, act } from '@testing-library/react';
import { useReceiptProcessor } from './useReceiptProcessor';

// --- Mock Setup ---
beforeEach(() => {
  jest.clearAllMocks();
  jest.restoreAllMocks();
  // Default: online
  Object.defineProperty(navigator, 'onLine', { value: true, writable: true, configurable: true });
});

const MOCK_BLOB = new Blob(['fake-image'], { type: 'image/jpeg' });
const MOCK_HASH = 'abc123def456';
const MOCK_QR_STRING = 'ORP:1/2/3/4/5/6/7/8/9';

const MOCK_RECEIPT_DATA = {
  store: 'Test Store',
  date: '2024-05-01',
  total: 42.50,
  items: [],
  source: 'EKASA' as const,
};

// -----------------------------------------------------------------------
// SCENARIO 1: eKasa Priority Routing
// A valid QR string must be routed to /api/ekasa, NOT /api/ai/parse-invoice.
// -----------------------------------------------------------------------
describe('useReceiptProcessor: eKasa Priority Routing', () => {
  it('should route a QR string to eKasa and return source: EKASA', async () => {
    const mockFetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => MOCK_RECEIPT_DATA,
    });
    global.fetch = mockFetch;

    const { result } = renderHook(() => useReceiptProcessor());
    let processResult: Awaited<ReturnType<typeof result.current.process>> | null = null;

    await act(async () => {
      processResult = await result.current.process({ input: MOCK_QR_STRING, hash: MOCK_HASH });
    });

    expect(processResult!.status).toBe('SUCCESS');
    expect(processResult!.source).toBe('EKASA');
    expect(mockFetch).toHaveBeenCalledWith('/api/ekasa', expect.any(Object));
    expect(mockFetch).not.toHaveBeenCalledWith('/api/ai/parse-invoice', expect.any(Object));
  });
});

// -----------------------------------------------------------------------
// SCENARIO 2: AI Vision Fallback (Blob input)
// A Blob input (photo) must be routed to /api/ai/parse-invoice.
// -----------------------------------------------------------------------
describe('useReceiptProcessor: AI Vision for Blob Input', () => {
  it('should route a Blob input to AI Vision and return source: AI_VISION', async () => {
    const mockFetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ success: true, data: { ...MOCK_RECEIPT_DATA, source: 'AI_VISION' } }),
    });
    global.fetch = mockFetch;

    const { result } = renderHook(() => useReceiptProcessor());
    let processResult: Awaited<ReturnType<typeof result.current.process>> | null = null;

    await act(async () => {
      processResult = await result.current.process({ input: MOCK_BLOB, hash: MOCK_HASH });
    });

    expect(processResult!.status).toBe('SUCCESS');
    expect(processResult!.source).toBe('AI_VISION');
    expect(mockFetch).toHaveBeenCalledWith('/api/ai/parse-invoice', expect.any(Object));
  });
});

// -----------------------------------------------------------------------
// SCENARIO 3: Idempotency Shield
// Calling process() twice with the same hash must NOT trigger a second fetch.
// -----------------------------------------------------------------------
describe('useReceiptProcessor: Idempotency Shield', () => {
  it('should return cached result on second call with the same hash without a network round-trip', async () => {
    const mockFetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => MOCK_RECEIPT_DATA,
    });
    global.fetch = mockFetch;

    const { result } = renderHook(() => useReceiptProcessor());

    await act(async () => {
      await result.current.process({ input: MOCK_QR_STRING, hash: MOCK_HASH });
    });

    await act(async () => {
      await result.current.process({ input: MOCK_QR_STRING, hash: MOCK_HASH });
    });

    // Fetch must only be called ONCE despite two process() calls
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('should clear the cache and allow a new request after reset()', async () => {
    const mockFetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => MOCK_RECEIPT_DATA,
    });
    global.fetch = mockFetch;

    const { result } = renderHook(() => useReceiptProcessor());

    await act(async () => {
      await result.current.process({ input: MOCK_QR_STRING, hash: MOCK_HASH });
    });

    act(() => { result.current.reset(); });

    await act(async () => {
      await result.current.process({ input: MOCK_QR_STRING, hash: MOCK_HASH });
    });

    expect(mockFetch).toHaveBeenCalledTimes(2);
  });
});

// -----------------------------------------------------------------------
// SCENARIO 4: Offline Resilience
// When the network is down, the hook MUST return QUEUED, not ERROR.
// Verified infrastructure: OfflineQueue is part of our proven primitives.
// -----------------------------------------------------------------------
describe('useReceiptProcessor: Offline Resilience', () => {
  it('should return status QUEUED and source OFFLINE_QUEUE when navigator.onLine is false', async () => {
    Object.defineProperty(navigator, 'onLine', { value: false, writable: true, configurable: true });

    // fetch should NOT be called when offline
    const mockFetch = jest.fn();
    global.fetch = mockFetch;

    const { result } = renderHook(() => useReceiptProcessor());
    let processResult: Awaited<ReturnType<typeof result.current.process>> | null = null;

    await act(async () => {
      processResult = await result.current.process({ input: MOCK_BLOB, hash: MOCK_HASH });
    });

    expect(processResult!.status).toBe('QUEUED');
    expect(processResult!.source).toBe('OFFLINE_QUEUE');
    expect(mockFetch).not.toHaveBeenCalled();
  });
});

// -----------------------------------------------------------------------
// SCENARIO 5: Timeout Recovery (The Hung Network)
// A network request hanging beyond the timeout threshold must be aborted
// and the result must gracefully degrade to source: MANUAL.
// -----------------------------------------------------------------------
describe('useReceiptProcessor: Timeout & AbortController Recovery', () => {
  it('should return source MANUAL and status ERROR (not hang) when the network times out', async () => {
    jest.useFakeTimers();

    // Simulate a fetch that never resolves
    global.fetch = jest.fn().mockImplementation(() =>
      new Promise<Response>(() => {})
    );

    const { result } = renderHook(() => useReceiptProcessor());
    let processResult: Awaited<ReturnType<typeof result.current.process>> | null = null;

    const processPromise = act(async () => {
      processResult = await result.current.process({ input: MOCK_QR_STRING, hash: MOCK_HASH });
    });

    // Fast-forward past the 15s timeout window
    act(() => { jest.advanceTimersByTime(16000); });

    await processPromise;

    expect(processResult!.status).toBe('ERROR');
    expect(processResult!.source).toBe('MANUAL');
    expect(processResult!.error).toContain('timed out');

    jest.useRealTimers();
  });
});
