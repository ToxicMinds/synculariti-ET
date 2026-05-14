import { Transaction } from '../lib/finance';

export type ViewMode = 'list' | 'calendar';

export interface UseTransactionFilterProps {
  transactions: Transaction[];
}

export interface UseTransactionFilterReturn {
  // State
  categoryFilter: string;
  whoFilter: string;
  whatFilter: string;
  viewMode: ViewMode;
  sortBy: 'date' | 'amount' | 'vendor';
  sortOrder: 'asc' | 'desc';
  limit: number;
  offset: number;

  // Actions
  setCategoryFilter: (cat: string) => void;
  setWhoFilter: (who: string) => void;
  setWhatFilter: (what: string) => void;
  setViewMode: (mode: ViewMode) => void;
  setSortBy: (sort: 'date' | 'amount' | 'vendor') => void;
  setSortOrder: (order: 'asc' | 'desc') => void;
  setLimit: (limit: number) => void;
  setOffset: (offset: number) => void;
  resetFilters: () => void;

  // Computed
  filteredTransactions: Transaction[];
  uniqueCategories: string[];
  uniqueWhos: string[];
}
