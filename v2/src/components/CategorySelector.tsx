'use client';

import React from 'react';

interface CategorySelectorProps {
  categories: string[];
  selectedCategory: string;
  onSelect: (category: string) => void;
  onAdd?: (name: string) => Promise<void>;
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
  onAdd,
  variant = 'full'
}: CategorySelectorProps) {
  const [isAdding, setIsAdding] = React.useState(false);
  const [newCat, setNewCat] = React.useState('');

  const handleAdd = async () => {
    if (!newCat.trim() || !onAdd) return;
    await onAdd(newCat.trim());
    onSelect(newCat.trim());
    setNewCat('');
    setIsAdding(false);
  };

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

      {onAdd && !isAdding && (
        <button 
          type="button"
          onClick={() => setIsAdding(true)}
          style={{ ...pillStyle(''), borderStyle: 'dashed', color: 'var(--text-muted)' }}
        >
          + Add
        </button>
      )}

      {isAdding && (
        <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
          <input
            autoFocus
            value={newCat}
            onChange={e => setNewCat(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleAdd()}
            placeholder="New name..."
            style={{
              padding: '6px 12px',
              borderRadius: 20,
              fontSize: 12,
              border: '1px solid var(--accent-primary)',
              background: 'var(--bg-secondary)',
              color: 'var(--text-primary)',
              width: 100,
              outline: 'none'
            }}
          />
          <button onClick={handleAdd} style={{ fontSize: 16, background: 'none', border: 'none', cursor: 'pointer' }}>✅</button>
          <button onClick={() => setIsAdding(false)} style={{ fontSize: 16, background: 'none', border: 'none', cursor: 'pointer' }}>❌</button>
        </div>
      )}
    </div>
  );
}
