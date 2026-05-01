'use client';

import React from 'react';

interface CategorySelectorProps {
  categories: string[];
  selectedCategory: string;
  onSelect: (category: string) => void;
  variant?: 'full' | 'compact';
}

/**
 * Universal Category Selector (Pills)
 * Replicates the v1 horizontal scroll experience.
 */
export function CategorySelector({ 
  categories, 
  selectedCategory, 
  onSelect,
  variant = 'full'
}: CategorySelectorProps) {
  // Common categories to show if none provided
  const items = categories.length > 0 ? categories : ['Groceries', 'Dining out', 'Transport', 'Utilities', 'Health', 'Shopping', 'Other'];

  const containerStyle: React.CSSProperties = {
    display: 'flex',
    gap: 8,
    overflowX: 'auto',
    padding: '8px 4px',
    margin: variant === 'full' ? '0 -4px 16px' : '4px 0 8px',
    scrollbarWidth: 'none', // Hide scrollbar for cleaner look
    msOverflowStyle: 'none',
    WebkitOverflowScrolling: 'touch'
  };

  const pillStyle = (cat: string): React.CSSProperties => {
    const isActive = cat === selectedCategory;
    return {
      padding: variant === 'full' ? '10px 18px' : '6px 12px',
      borderRadius: 24,
      fontSize: variant === 'full' ? 13 : 11,
      fontWeight: 600,
      whiteSpace: 'nowrap',
      cursor: 'pointer',
      transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
      border: isActive ? '2px solid var(--accent-primary)' : '1px solid var(--border-color)',
      background: isActive ? 'rgba(99, 102, 241, 0.15)' : 'var(--bg-secondary)',
      color: isActive ? 'var(--accent-primary)' : 'var(--text-secondary)',
      boxShadow: isActive ? '0 0 12px rgba(99, 102, 241, 0.2)' : 'none',
      flexShrink: 0
    };
  };

  return (
    <div className="no-scrollbar" style={containerStyle}>
      {items.map(cat => (
        <button 
          key={cat}
          type="button"
          onClick={() => onSelect(cat)}
          style={pillStyle(cat)}
        >
          {cat}
        </button>
      ))}
    </div>
  );
}
