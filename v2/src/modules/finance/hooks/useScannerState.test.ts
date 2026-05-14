import { renderHook, act } from '@testing-library/react';
import { useScannerState, ReceiptData, ReceiptItem } from './useScannerState';

// Mock the global fetch
global.fetch = jest.fn();

// Mock the logger
jest.mock('@/lib/logger', () => ({
    Logger: {
        system: jest.fn(),
        user: jest.fn()
    }
}));

// Mock eKasa protocols
jest.mock('@/lib/ekasa-protocols', () => ({
    extractUniversal: jest.fn(),
    parseEkasaError: jest.fn((status, detail) => `eKasa Error (${status}): ${detail || 'Unknown'}`)
}));

import { extractUniversal } from '@/lib/ekasa-protocols';

describe('useScannerState (Phase 2: Contract Revision 3 - Dual Path + Mocks)', () => {
    const mockOnSave = jest.fn();
    const mockProps = {
        categories: ['Food', 'Transport'],
        names: { 'user1': 'Nik', 'user2': 'Alex' },
        onSave: mockOnSave
    };

    beforeEach(() => {
        jest.clearAllMocks();
        
        // Setup FileReader mock to instantly trigger onload with dummy base64
        const mockFileReader = {
            readAsDataURL: jest.fn(function(this: any) {
                this.result = 'data:image/png;base64,dummy';
                this.onload();
            }),
            onload: jest.fn(),
            onerror: jest.fn()
        };
        (global as any).FileReader = jest.fn(() => mockFileReader);
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

    it('2. Path A (eKasa): processEkasaQr skips AI call and populates directly (Verified)', async () => {
        (extractUniversal as jest.Mock).mockReturnValue('O-12345678901234567890123456789012');
        
        (global.fetch as jest.Mock).mockResolvedValueOnce({
            ok: true,
            json: async () => ({ 
                receiptId: 'O-12345678901234567890123456789012',
                store: 'Billa',
                date: '2026-05-14',
                total: 10.50,
                items: [{ name: 'Bread', amount: 10.50 }]
            })
        });

        const { result } = renderHook(() => useScannerState(mockProps));

        let promise: Promise<void>;
        act(() => {
            promise = result.current.processEkasaQr('raw-qr-string');
        });

        expect(result.current.step).toBe('processing');

        await act(async () => {
            await promise;
        });

        expect(global.fetch).toHaveBeenCalledTimes(1);
        expect(global.fetch).toHaveBeenCalledWith('/api/ekasa', expect.any(Object));

        expect(result.current.step).toBe('review');
        expect(result.current.isVerified).toBe(true);
        expect(result.current.receipt).toMatchObject({
            source: 'ekasa',
            store: 'Billa',
            total: 10.50
        });
    });

    it('3. Path B (Invoice): processInvoiceFile uses AI and marks as Estimated', async () => {
        (global.fetch as jest.Mock).mockResolvedValueOnce({
            ok: true,
            json: async () => ({
                success: true,
                data: {
                    store: 'Office Supplies Inc',
                    date: '2026-05-14',
                    total: 50.00,
                    source: 'ai',
                    items: []
                }
            })
        });

        const file = new File(['dummy content'], 'invoice.png', { type: 'image/png' });
        const { result } = renderHook(() => useScannerState(mockProps));

        let promise: Promise<void>;
        act(() => {
            promise = result.current.processInvoiceFile(file);
        });

        expect(result.current.step).toBe('processing');

        await act(async () => {
            await promise;
        });

        expect(global.fetch).toHaveBeenCalledTimes(1);
        expect(global.fetch).toHaveBeenCalledWith('/api/ai/parse-invoice', expect.any(Object));
        
        expect(result.current.step).toBe('review');
        expect(result.current.isVerified).toBe(false); 
        expect(result.current.receipt?.source).toBe('ai');
    });

    it('4. Error Handling: handles failed extraction and returns to scan', async () => {
        (extractUniversal as jest.Mock).mockReturnValue('O-BAD');
        (global.fetch as jest.Mock).mockResolvedValueOnce({
            ok: false,
            status: 400,
            json: async () => ({ detail: 'Invalid QR code signature' })
        });

        const { result } = renderHook(() => useScannerState(mockProps));

        await act(async () => {
            await result.current.processEkasaQr('bad-qr');
        });

        expect(result.current.step).toBe('scan');
        expect(result.current.error).toContain('eKasa Error (400)');
        expect(result.current.isProcessing).toBe(false);
    });

    it('5. Mutation Safety: confirmAndSave calls onSave with correct data', async () => {
        (extractUniversal as jest.Mock).mockReturnValue('O-123');
        (global.fetch as jest.Mock).mockResolvedValueOnce({
            ok: true,
            json: async () => ({
                store: 'Billa',
                date: '2026-05-14',
                total: 5.00,
                items: [{ name: 'Bread', amount: 5.00, category: 'Food', selected: true }],
            })
        });

        const { result } = renderHook(() => useScannerState(mockProps));

        await act(async () => {
            await result.current.processEkasaQr('valid-qr');
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
