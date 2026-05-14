import { renderHook, act } from '@testing-library/react';
import { useStatementScanner } from './useStatementScanner';

global.fetch = jest.fn();

jest.mock('@/lib/logger', () => ({
    Logger: { system: jest.fn(), user: jest.fn() }
}));

// Helper: N-line CSV file
function makeFile(lineCount: number): File {
    const lines = Array.from({ length: lineCount }, (_, i) =>
        `2026-05-${String(i + 1).padStart(2, '0')},Transaction ${i + 1},${(i + 1) * 10}.00`
    );
    return new File([lines.join('\n')], 'statement.csv', { type: 'text/csv' });
}

const mockOnSave = jest.fn();
const mockOnClose = jest.fn();

const defaultProps = {
    categories: ['Food', 'Transport'],
    names: { 'uid-1': 'Nik' },
    onSave: mockOnSave,
    onClose: mockOnClose,
    chunkSize: 5 // Small for testing; defaults to 200 in production
};

describe('useStatementScanner (Phase 2: Contract - V-105)', () => {

    beforeEach(() => jest.clearAllMocks());

    it('1. Initial State: upload step, empty transactions, zero progress', () => {
        const { result } = renderHook(() => useStatementScanner(defaultProps));
        expect(result.current.step).toBe('upload');
        expect(result.current.transactions).toEqual([]);
        expect(result.current.isProcessing).toBe(false);
        expect(result.current.progress).toEqual({ chunksTotal: 0, chunksComplete: 0 });
        expect(result.current.reconciliation).toBeNull();
        expect(result.current.error).toBe('');
    });

    it('2. Batch Progression: chunksTotal is set on start, fetch called once per chunk, completes in review', async () => {
        const file = makeFile(15); // 15 lines → 3 chunks of 5

        (global.fetch as jest.Mock)
            .mockResolvedValueOnce({ ok: true, json: async () => ({ success: true, transactions: [{ date: '2026-05-01', description: 'Tx A', amount: 10, category: 'Food' }] }) })
            .mockResolvedValueOnce({ ok: true, json: async () => ({ success: true, transactions: [{ date: '2026-05-06', description: 'Tx B', amount: 20, category: 'Transport' }] }) })
            .mockResolvedValueOnce({ ok: true, json: async () => ({ success: true, transactions: [{ date: '2026-05-11', description: 'Tx C', amount: 30, category: 'Food' }] }) });

        const { result } = renderHook(() => useStatementScanner(defaultProps));

        let processPromise: Promise<void>;
        act(() => { processPromise = result.current.processFile(file); });

        // Immediately after start, chunksTotal is computed and processing begins
        expect(result.current.progress.chunksTotal).toBe(3);
        expect(result.current.isProcessing).toBe(true);

        await act(async () => { await processPromise!; });

        expect(result.current.progress.chunksComplete).toBe(3);
        expect(result.current.isProcessing).toBe(false);
        expect(result.current.step).toBe('review');
        expect(global.fetch).toHaveBeenCalledTimes(3);
    });

    it('3. Deduplication: same tx from two chunks appears only once', async () => {
        const file = makeFile(10); // 2 chunks of 5

        const duplicate = { date: '2026-05-01', description: 'Amazon', amount: 50, category: 'Shopping' };
        const unique    = { date: '2026-05-02', description: 'Lidl',   amount: 25, category: 'Food' };

        (global.fetch as jest.Mock)
            .mockResolvedValueOnce({ ok: true, json: async () => ({ success: true, transactions: [duplicate, unique] }) })
            .mockResolvedValueOnce({ ok: true, json: async () => ({ success: true, transactions: [duplicate] }) }); // duplicate again

        const { result } = renderHook(() => useStatementScanner(defaultProps));
        await act(async () => { await result.current.processFile(file); });

        const amazonTxs = result.current.transactions.filter(
            t => t.description === 'Amazon' && t.date === '2026-05-01' && t.amount === 50
        );
        expect(amazonTxs).toHaveLength(1);
        expect(result.current.transactions).toHaveLength(2); // unique + deduplicated duplicate
    });

    it('4. Reconciliation Math: non-zero delta when sums diverge', async () => {
        const file = makeFile(5);

        (global.fetch as jest.Mock).mockResolvedValueOnce({
            ok: true,
            json: async () => ({
                success: true,
                transactions: [
                    { date: '2026-05-01', description: 'Tx A', amount: 100, category: 'Food' },
                    { date: '2026-05-02', description: 'Tx B', amount: 200, category: 'Transport' }
                ]
            })
        });

        const { result } = renderHook(() => useStatementScanner(defaultProps));
        await act(async () => { await result.current.processFile(file); });

        // extracted = 300, declared = 350 → delta = 50
        act(() => { result.current.setDeclaredTotal(350); });
        act(() => { result.current.reconcile(); });

        expect(result.current.reconciliation?.extractedTotal).toBe(300);
        expect(result.current.reconciliation?.declaredTotal).toBe(350);
        expect(result.current.reconciliation?.delta).toBe(50);
        expect(result.current.reconciliation?.isBalanced).toBe(false);
    });

    it('5. Step Machine: upload → processing → review → reconciling → upload (reset)', async () => {
        const file = makeFile(5);

        (global.fetch as jest.Mock).mockResolvedValueOnce({
            ok: true,
            json: async () => ({ success: true, transactions: [{ date: '2026-05-01', description: 'Tx', amount: 10, category: 'Food' }] })
        });

        const { result } = renderHook(() => useStatementScanner(defaultProps));
        expect(result.current.step).toBe('upload');

        await act(async () => { await result.current.processFile(file); });
        expect(result.current.step).toBe('review');

        act(() => {
            result.current.setDeclaredTotal(10);
            result.current.reconcile();
        });
        expect(result.current.step).toBe('reconciling');

        act(() => { result.current.reset(); });
        expect(result.current.step).toBe('upload');
        expect(result.current.transactions).toEqual([]);
        expect(result.current.reconciliation).toBeNull();
    });

    it('6. Selection Logic: toggleRow flips selected; extractedTotal reflects only selected rows', async () => {
        const file = makeFile(5);

        (global.fetch as jest.Mock).mockResolvedValueOnce({
            ok: true,
            json: async () => ({
                success: true,
                transactions: [
                    { date: '2026-05-01', description: 'Tx A', amount: 100, category: 'Food' },
                    { date: '2026-05-02', description: 'Tx B', amount: 200, category: 'Transport' }
                ]
            })
        });

        const { result } = renderHook(() => useStatementScanner(defaultProps));
        await act(async () => { await result.current.processFile(file); });

        // All selected by default
        expect(result.current.transactions[0].selected).toBe(true);
        expect(result.current.transactions[1].selected).toBe(true);

        // Deselect Tx B (index 1)
        act(() => {
            result.current.toggleRow(1);
            result.current.setDeclaredTotal(300);
            result.current.reconcile();
        });

        expect(result.current.transactions[1].selected).toBe(false);
        // extractedTotal counts only Tx A (100)
        expect(result.current.reconciliation?.extractedTotal).toBe(100);
    });
});
