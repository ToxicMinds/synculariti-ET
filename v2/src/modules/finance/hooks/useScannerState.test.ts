import { renderHook, act } from '@testing-library/react';
import { useScannerState, ReceiptData, ReceiptItem } from './useScannerState';

jest.mock('@/lib/scanner-client', () => ({
  processScannerInput: jest.fn(),
  clearScannerCache: jest.fn(),
}));

jest.mock('@/lib/logger', () => ({
  Logger: { system: jest.fn(), user: jest.fn() },
}));

import { processScannerInput } from '@/lib/scanner-client';

const mockScannerResult = (overrides: Partial<ReturnType<typeof processScannerInput extends (...args: any[]) => infer R ? R : never>> = {}) => ({
  status: 'SUCCESS' as const,
  source: 'EKASA' as const,
  cacheKey: 'test-key',
  data: {
    store: 'Billa',
    date: '2026-05-14',
    total: 10.50,
    items: [{ name: 'Bread', amount: 10.50, category: 'Food', selected: true }],
  },
  ...overrides,
});

describe('useScannerState (Phase 1 — Unified process())', () => {
  const mockOnSave = jest.fn();
  const mockProps = {
    categories: ['Food', 'Transport'],
    names: { 'user1': 'Nik', 'user2': 'Alex' },
    onSave: mockOnSave,
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('1. Initial State: starts on the scan step with no error', () => {
    const { result } = renderHook(() => useScannerState(mockProps));

    expect(result.current.step).toBe('scan');
    expect(result.current.error).toBe('');
    expect(result.current.receipt).toBeNull();
    expect(result.current.isProcessing).toBe(false);
    expect(result.current.isSaving).toBe(false);
    expect(result.current.isVerified).toBe(false);
    expect(result.current.payerId).toBe('user1');
  });

  it('2. QR string input → EKASA path → Verified', async () => {
    (processScannerInput as jest.Mock).mockResolvedValueOnce(
      mockScannerResult({ source: 'EKASA' })
    );

    const { result } = renderHook(() => useScannerState(mockProps));

    let promise: Promise<void>;
    act(() => {
      promise = result.current.process('raw-qr-string');
    });

    expect(result.current.step).toBe('processing');

    await act(async () => {
      await promise;
    });

    expect(processScannerInput).toHaveBeenCalledWith('raw-qr-string', ['Food', 'Transport']);
    expect(result.current.step).toBe('review');
    expect(result.current.isVerified).toBe(true);
    expect(result.current.receipt).toMatchObject({
      source: 'ekasa',
      store: 'Billa',
      total: 10.50,
    });
  });

  it('3. File input → AI path → Estimated', async () => {
    (processScannerInput as jest.Mock).mockResolvedValueOnce(
      mockScannerResult({
        source: 'AI_VISION',
        data: {
          store: 'Office Supplies Inc',
          date: '2026-05-14',
          total: 50.00,
          items: [{ name: 'Paper', amount: 50.00, category: 'Office', selected: true }],
        },
      })
    );

    const file = new File(['dummy content'], 'invoice.png', { type: 'image/png' });
    const { result } = renderHook(() => useScannerState(mockProps));

    let promise: Promise<void>;
    act(() => {
      promise = result.current.process(file);
    });

    expect(result.current.step).toBe('processing');

    await act(async () => {
      await promise;
    });

    expect(processScannerInput).toHaveBeenCalledWith(file, ['Food', 'Transport']);
    expect(result.current.step).toBe('review');
    expect(result.current.isVerified).toBe(false);
    expect(result.current.receipt?.source).toBe('ai');
  });

  it('4. Error Handling: service returns ERROR → back to scan', async () => {
    (processScannerInput as jest.Mock).mockResolvedValueOnce({
      status: 'ERROR',
      source: 'MANUAL',
      cacheKey: 'bad-key',
      error: 'eKasa Error (400): Invalid QR code signature',
    });

    const { result } = renderHook(() => useScannerState(mockProps));

    await act(async () => {
      await result.current.process('bad-qr');
    });

    expect(result.current.step).toBe('scan');
    expect(result.current.error).toContain('eKasa Error (400)');
    expect(result.current.isProcessing).toBe(false);
  });

  it('5. Offline handling: service returns QUEUED → back to scan with message', async () => {
    (processScannerInput as jest.Mock).mockResolvedValueOnce({
      status: 'QUEUED',
      source: 'OFFLINE_QUEUE',
      cacheKey: 'offline-key',
    });

    const { result } = renderHook(() => useScannerState(mockProps));

    await act(async () => {
      await result.current.process('qr-while-offline');
    });

    expect(result.current.step).toBe('scan');
    expect(result.current.error).toContain('Network offline');
  });

  it('6. Mutation Safety: confirmAndSave calls onSave with correct data', async () => {
    (processScannerInput as jest.Mock).mockResolvedValueOnce(
      mockScannerResult({ source: 'EKASA' })
    );

    const { result } = renderHook(() => useScannerState(mockProps));

    await act(async () => {
      await result.current.process('valid-qr');
    });

    let savePromise: Promise<void>;
    act(() => {
      savePromise = result.current.confirmAndSave();
    });

    expect(result.current.isSaving).toBe(true);

    await act(async () => {
      await savePromise;
    });

    expect(mockOnSave).toHaveBeenCalledWith(
      expect.objectContaining({ store: 'Billa', source: 'ekasa' }),
      'user1'
    );
    expect(result.current.isSaving).toBe(false);
  });
});
