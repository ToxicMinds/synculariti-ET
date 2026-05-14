import { renderHook, act } from '@testing-library/react';
import { useManualEntryForm } from './useManualEntryForm';

const mockNames: Record<string, string> = {
    'uid-1': 'Nik',
    'uid-2': 'Alex'
};

const mockOnSave = jest.fn();
const mockOnClose = jest.fn();

const defaultProps = {
    names: mockNames,
    onSave: mockOnSave,
    onClose: mockOnClose
};

describe('useManualEntryForm (Phase 2: Contract)', () => {

    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('1. Prefill Logic: initializes all form fields from prefill (Edit mode)', () => {
        const prefill = {
            id: 'tx-existing-123',
            description: 'Weekly groceries',
            merchant: 'Billa',
            amount: 87.50,
            category: 'Food',
            who_id: 'uid-2',
            who: 'Alex',
            date: '2026-05-10'
        };

        const { result } = renderHook(() => useManualEntryForm({ ...defaultProps, prefill }));

        expect(result.current.isEdit).toBe(true);
        expect(result.current.description).toBe('Weekly groceries');
        expect(result.current.merchant).toBe('Billa');
        expect(result.current.amount).toBe('87.5'); // stored as string for controlled input
        expect(result.current.category).toBe('Food');
        expect(result.current.whoId).toBe('uid-2');
        expect(result.current.date).toBe('2026-05-10');
    });

    it('2. Initial State: no prefill starts with defaults and first user selected', () => {
        const { result } = renderHook(() => useManualEntryForm(defaultProps));

        expect(result.current.isEdit).toBe(false);
        expect(result.current.description).toBe('');
        expect(result.current.merchant).toBe('');
        expect(result.current.amount).toBe('');
        expect(result.current.category).toBe('');
        expect(result.current.whoId).toBe('uid-1'); // first key in names
        expect(result.current.error).toBe('');
        expect(result.current.isSaving).toBe(false);
        expect(result.current.fieldErrors).toEqual({});
    });

    it('3. Validation: handleSubmit does not call onSave when amount is 0', async () => {
        const { result } = renderHook(() => useManualEntryForm(defaultProps));

        act(() => {
            result.current.setAmount('0');
            result.current.setCategory('Food');
        });

        await act(async () => {
            await result.current.handleSubmit({ preventDefault: jest.fn() } as any);
        });

        expect(mockOnSave).not.toHaveBeenCalled();
        expect(result.current.fieldErrors.amount).toBeTruthy(); // field-level error
    });

    it('4. Validation: handleSubmit does not call onSave when category is missing', async () => {
        const { result } = renderHook(() => useManualEntryForm(defaultProps));

        act(() => {
            result.current.setAmount('50');
            result.current.setCategory(''); // no category
        });

        await act(async () => {
            await result.current.handleSubmit({ preventDefault: jest.fn() } as any);
        });

        expect(mockOnSave).not.toHaveBeenCalled();
        expect(result.current.fieldErrors.category).toBeTruthy(); // field-level error
    });

    it('5. Submission Lifecycle: isSaving is true during async save and onClose is called on success', async () => {
        let resolveSave!: () => void;
        const controllableSave = jest.fn(() => new Promise<void>(resolve => { resolveSave = resolve; }));

        const { result } = renderHook(() => useManualEntryForm({
            ...defaultProps,
            onSave: controllableSave
        }));

        act(() => {
            result.current.setAmount('42');
            result.current.setCategory('Transport');
            result.current.setMerchant('Uber');
        });

        let savePromise: Promise<void>;
        act(() => {
            savePromise = result.current.handleSubmit({ preventDefault: jest.fn() } as any);
        });

        expect(result.current.isSaving).toBe(true);

        await act(async () => {
            resolveSave();
            await savePromise;
        });

        expect(result.current.isSaving).toBe(false);
        expect(mockOnClose).toHaveBeenCalledTimes(1);
    });

    it('6. Data Integrity: onSave receives amount as number even though input is string', async () => {
        mockOnSave.mockResolvedValueOnce(undefined);

        const { result } = renderHook(() => useManualEntryForm(defaultProps));

        act(() => {
            result.current.setMerchant('Lidl');
            result.current.setAmount('123.45');
            result.current.setCategory('Food');
            result.current.setWhoId('uid-2');
        });

        await act(async () => {
            await result.current.handleSubmit({ preventDefault: jest.fn() } as any);
        });

        expect(mockOnSave).toHaveBeenCalledWith(
            expect.objectContaining({
                amount: 123.45,       // number, not string
                category: 'Food',
                merchant: 'Lidl',
                who_id: 'uid-2',
                who: 'Alex'           // resolved from names map, not passed by UI
            })
        );
    });
});
