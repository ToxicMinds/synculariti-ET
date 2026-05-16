'use client';

import React from 'react';
import { ViewMode } from '../../hooks/useTransactionFilter.types';

interface FilterBarProps {
  whatFilter: string;
  setWhatFilter: (val: string) => void;
  categoryFilter: string;
  setCategoryFilter: (val: string) => void;
  whoFilter: string;
  setWhoFilter: (val: string) => void;
  uniqueCategories: string[];
  uniqueWhos: string[];
  viewMode: ViewMode;
  setViewMode: (mode: ViewMode) => void;
}

const selectStyle: React.CSSProperties = {
  padding: '6px 10px',
  borderRadius: 8,
  border: '1px solid var(--border-color)',
  background: 'var(--bg-secondary)',
  color: 'var(--text-primary)',
  fontSize: 12,
  flex: 1,
  minWidth: 100,
  outline: 'none'
};

export function FilterBar({
  whatFilter, setWhatFilter,
  categoryFilter, setCategoryFilter,
  whoFilter, setWhoFilter,
  uniqueCategories, uniqueWhos,
  viewMode, setViewMode
}: FilterBarProps) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
      <input
        type="text"
        placeholder="🔍 Search descriptions..."
        value={whatFilter}
        onChange={e => setWhatFilter(e.target.value)}
        style={{ 
          width: '100%', 
          padding: '8px 12px', 
          borderRadius: 8, 
          border: '1px solid var(--border-color)', 
          background: 'var(--bg-secondary)', 
          color: 'var(--text-primary)', 
          fontSize: 13, 
          outline: 'none' 
        }}
      />
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <select value={categoryFilter} onChange={e => setCategoryFilter(e.target.value)} style={selectStyle}>
          {uniqueCategories.map(c => (
            <option key={c} value={c}>
              {c === 'All' ? 'All Categories' : c}
            </option>
          ))}
        </select>
        
        <select value={whoFilter} onChange={e => setWhoFilter(e.target.value)} style={selectStyle}>
          {uniqueWhos.map(w => (
            <option key={w} value={w}>
              {w === 'All' ? 'Everyone' : w}
            </option>
          ))}
        </select>

        <button
          onClick={() => setViewMode(viewMode === 'list' ? 'calendar' : 'list')}
          style={{ 
            padding: '6px 12px', 
            borderRadius: 8, 
            border: '1px solid var(--border-color)', 
            background: 'transparent', 
            color: 'var(--text-secondary)', 
            fontSize: 12, 
            fontWeight: 600, 
            cursor: 'pointer', 
            flexShrink: 0 
          }}
        >
          {viewMode === 'list' ? '📅 Calendar' : '📋 List'}
        </button>
      </div>
    </div>
  );
}
