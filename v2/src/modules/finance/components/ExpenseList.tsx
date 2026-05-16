'use client';

import React from 'react';
import { Transaction } from '../lib/finance';
import { useTransactionFilter } from '../hooks/useTransactionFilter';

import { FilterBar } from './expense-list/FilterBar';
import { TransactionRow } from './expense-list/TransactionRow';
import { CalendarGrid } from './expense-list/CalendarGrid';

interface ExpenseListProps {
  transactions: Transaction[];
  onDelete: (id: string) => void;
  onEdit: (tx: Transaction) => void;
}

/**
 * ExpenseList: The orchestrator for financial transaction visibility.
 * Decoupled into specialized sub-components for filtering and rendering.
 */
export function ExpenseList({ transactions, onDelete, onEdit }: ExpenseListProps) {
  const {
    categoryFilter, setCategoryFilter,
    whoFilter, setWhoFilter,
    whatFilter, setWhatFilter,
    viewMode, setViewMode,
    filteredTransactions,
    uniqueCategories,
    uniqueWhos
  } = useTransactionFilter({ transactions });

  return (
    <div>
      <FilterBar 
        whatFilter={whatFilter}
        setWhatFilter={setWhatFilter}
        categoryFilter={categoryFilter}
        setCategoryFilter={setCategoryFilter}
        whoFilter={whoFilter}
        setWhoFilter={setWhoFilter}
        uniqueCategories={uniqueCategories}
        uniqueWhos={uniqueWhos}
        viewMode={viewMode}
        setViewMode={setViewMode}
      />

      {viewMode === 'calendar' ? (
        <CalendarGrid 
          transactions={filteredTransactions} 
        />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {filteredTransactions.length === 0 ? (
            <div style={{ color: 'var(--text-muted)', fontSize: 14, padding: '12px 0', textAlign: 'center' }}>
              No transactions match your filters.
            </div>
          ) : (
            filteredTransactions.map(tx => (
              <TransactionRow 
                key={tx.id} 
                tx={tx} 
                onDelete={onDelete} 
                onEdit={onEdit} 
              />
            ))
          )}
        </div>
      )}
    </div>
  );
}
