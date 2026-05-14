import { renderHook, act } from '@testing-library/react';
import { useTransactionFilter } from './useTransactionFilter';
import { Transaction } from '../lib/finance';

const mockTransactions: Transaction[] = [
    { id: '1', date: '2026-05-10', amount: 50.00, category: 'Food', description: 'Billa Grocery', who: 'Nik', currency: 'EUR' },
    { id: '2', date: '2026-05-12', amount: 150.00, category: 'Transport', description: 'Uber ride', who: 'Alex', currency: 'EUR' },
    { id: '3', date: '2026-05-11', amount: 20.00, category: 'Food', description: 'Coffee shop', who: 'Nik', currency: 'EUR' },
    { id: '4', date: '2026-05-14', amount: 300.00, category: 'Software', description: 'AWS Hosting', who: 'Alex', currency: 'EUR' }
];

describe('useTransactionFilter (Phase 2: Contract)', () => {
    
    it('1. Initial State & Memoization: uniqueCategories reference stays stable', () => {
        const { result, rerender } = renderHook(({ txs }) => useTransactionFilter({ transactions: txs }), {
            initialProps: { txs: mockTransactions }
        });

        expect(result.current.filteredTransactions.length).toBe(4);
        expect(result.current.uniqueCategories).toEqual(['All', 'Food', 'Transport', 'Software']);
        
        const initialCategoriesRef = result.current.uniqueCategories;
        
        // Rerender with the exact same array reference
        rerender({ txs: mockTransactions });
        
        // Ensure strictly equal (memoized)
        expect(result.current.uniqueCategories).toBe(initialCategoriesRef);
    });

    it('2. Filter Accuracy: categoryFilter correctly reduces transaction count', () => {
        const { result } = renderHook(() => useTransactionFilter({ transactions: mockTransactions }));

        act(() => {
            result.current.setCategoryFilter('Food');
        });

        expect(result.current.filteredTransactions.length).toBe(2);
        expect(result.current.filteredTransactions[0].category).toBe('Food');
        expect(result.current.filteredTransactions[1].category).toBe('Food');
    });

    it('3. Search Logic: whatFilter performs case-insensitive search', () => {
        const { result } = renderHook(() => useTransactionFilter({ transactions: mockTransactions }));

        act(() => {
            result.current.setWhatFilter('UBeR'); // Case insensitive
        });

        expect(result.current.filteredTransactions.length).toBe(1);
        expect(result.current.filteredTransactions[0].description).toBe('Uber ride');
        
        act(() => {
            result.current.setWhatFilter('food'); // Search by category string inside whatFilter
        });
        
        // Matches the 2 Food items
        expect(result.current.filteredTransactions.length).toBe(2);
    });

    it('4. Sorting Logic: sortBy amount reorders correctly', () => {
        const { result } = renderHook(() => useTransactionFilter({ transactions: mockTransactions }));

        // Default sort might be date descending, but we force amount desc
        act(() => {
            result.current.setSortBy('amount');
            result.current.setSortOrder('desc');
        });

        // AWS (300) -> Uber (150) -> Billa (50) -> Coffee (20)
        expect(result.current.filteredTransactions[0].amount).toBe(300);
        expect(result.current.filteredTransactions[3].amount).toBe(20);

        act(() => {
            result.current.setSortOrder('asc');
        });

        expect(result.current.filteredTransactions[0].amount).toBe(20);
        expect(result.current.filteredTransactions[3].amount).toBe(300);
    });

    it('5. Reset Action: clears all filters and restores full list', () => {
        const { result } = renderHook(() => useTransactionFilter({ transactions: mockTransactions }));

        act(() => {
            result.current.setCategoryFilter('Transport');
            result.current.setWhatFilter('Uber');
            result.current.setSortBy('amount');
        });

        expect(result.current.filteredTransactions.length).toBe(1);

        act(() => {
            result.current.resetFilters();
        });

        expect(result.current.categoryFilter).toBe('All');
        expect(result.current.whatFilter).toBe('');
        expect(result.current.sortBy).toBe('date'); // Defaults back to date
        expect(result.current.filteredTransactions.length).toBe(4);
    });
});
