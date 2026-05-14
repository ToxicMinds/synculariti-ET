'use client';

import { useState, useMemo, useCallback } from 'react';
import { Transaction } from '../lib/finance';
import { ViewMode, UseTransactionFilterProps, UseTransactionFilterReturn } from './useTransactionFilter.types';

const DEFAULT_SORT_BY = 'date' as const;
const DEFAULT_SORT_ORDER = 'desc' as const;
const DEFAULT_LIMIT = 50;

export function useTransactionFilter({ transactions }: UseTransactionFilterProps): UseTransactionFilterReturn {
  const [categoryFilter, setCategoryFilter] = useState<string>('All');
  const [whoFilter, setWhoFilter] = useState<string>('All');
  const [whatFilter, setWhatFilter] = useState<string>('');
  const [viewMode, setViewMode] = useState<ViewMode>('list');
  const [sortBy, setSortBy] = useState<'date' | 'amount' | 'vendor'>(DEFAULT_SORT_BY);
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>(DEFAULT_SORT_ORDER);
  const [limit, setLimit] = useState<number>(DEFAULT_LIMIT);
  const [offset, setOffset] = useState<number>(0);

  const resetFilters = useCallback((): void => {
    setCategoryFilter('All');
    setWhoFilter('All');
    setWhatFilter('');
    setSortBy(DEFAULT_SORT_BY);
    setSortOrder(DEFAULT_SORT_ORDER);
    setOffset(0);
  }, []);

  // Single-pass derivation of unique categories and whos — O(N), B2B-scale safe
  const { uniqueCategories, uniqueWhos } = useMemo(() => {
    const catSet = new Set<string>();
    const whoSet = new Set<string>();
    for (const tx of transactions) {
      if (tx.category) catSet.add(tx.category);
      if (tx.who) whoSet.add(tx.who);
    }
    return {
      uniqueCategories: ['All', ...Array.from(catSet)],
      uniqueWhos: ['All', ...Array.from(whoSet)]
    };
  }, [transactions]);

  // Memoized filter + sort pipeline — only recomputes when inputs change
  const filteredTransactions = useMemo<Transaction[]>(() => {
    const lowerWhat = whatFilter.toLowerCase();

    const filtered = transactions.filter(tx => {
      if (categoryFilter !== 'All' && tx.category !== categoryFilter) return false;
      if (whoFilter !== 'All' && tx.who !== whoFilter) return false;
      if (lowerWhat) {
        const inDescription = tx.description?.toLowerCase().includes(lowerWhat) ?? false;
        const inCategory = tx.category.toLowerCase().includes(lowerWhat);
        if (!inDescription && !inCategory) return false;
      }
      return true;
    });

    // Spread before sort to avoid mutating the original array
    return [...filtered].sort((a, b) => {
      let comparison = 0;

      if (sortBy === 'amount') {
        comparison = Number(a.amount) - Number(b.amount);
      } else if (sortBy === 'vendor') {
        const aVendor = (a.description ?? a.category).toLowerCase();
        const bVendor = (b.description ?? b.category).toLowerCase();
        comparison = aVendor.localeCompare(bVendor);
      } else {
        // Default: date
        comparison = new Date(a.date).getTime() - new Date(b.date).getTime();
      }

      return sortOrder === 'asc' ? comparison : -comparison;
    });
  }, [transactions, categoryFilter, whoFilter, whatFilter, sortBy, sortOrder]);

  return {
    categoryFilter,
    whoFilter,
    whatFilter,
    viewMode,
    sortBy,
    sortOrder,
    limit,
    offset,
    setCategoryFilter,
    setWhoFilter,
    setWhatFilter,
    setViewMode,
    setSortBy,
    setSortOrder,
    setLimit,
    setOffset,
    resetFilters,
    filteredTransactions,
    uniqueCategories,
    uniqueWhos
  };
}
