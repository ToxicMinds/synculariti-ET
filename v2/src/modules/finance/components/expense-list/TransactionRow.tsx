'use client';

import React from 'react';
import { Transaction } from '../../lib/finance';
import { CategoryPill } from '@/components/CategoryPill';
import { useSwipeable } from '@/hooks/useSwipeable';

interface TransactionRowProps {
  tx: Transaction;
  onDelete: (id: string) => void;
  onEdit: (tx: Transaction) => void;
}

export function TransactionRow({ tx, onDelete, onEdit }: TransactionRowProps) {
  const { offset, isDragging, handlers, reset } = useSwipeable(-140);

  const handleDelete = (): void => {
    if (tx.id && window.confirm('Are you sure you want to delete this transaction?')) {
      onDelete(tx.id);
      reset();
    }
  };

  const handleEdit = (): void => {
    onEdit(tx);
    reset();
  };

  const currencySymbol = tx.currency === 'EUR' || !tx.currency ? '€' : tx.currency;

  return (
    <div style={{ position: 'relative', overflow: 'hidden', borderBottom: '1px solid var(--border-color)' }}>
      {/* Action Buttons (Mobile Swipe Reveal) */}
      <div className="hide-desktop" style={{ position: 'absolute', right: 0, top: 0, bottom: 0, width: 140, display: 'flex', alignItems: 'stretch' }}>
        <button 
          onClick={handleEdit} 
          style={{ flex: 1, background: '#6366f1', color: '#fff', border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 600 }}
        >
          Edit
        </button>
        <button 
          onClick={handleDelete} 
          style={{ flex: 1, background: '#ef4444', color: '#fff', border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 600 }}
        >
          Delete
        </button>
      </div>

      {/* Main Content (Swipeable Layer) */}
      <div
        {...handlers}
        style={{
          display: 'flex', 
          justifyContent: 'space-between', 
          alignItems: 'center',
          padding: '12px 16px', 
          background: 'var(--bg-card)',
          transform: `translateX(${offset}px)`,
          transition: isDragging ? 'none' : 'transform 0.3s cubic-bezier(0.2, 0.8, 0.2, 1)',
          position: 'relative', 
          zIndex: 2,
          cursor: offset !== 0 ? 'grabbing' : 'default'
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 3, flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <CategoryPill category={tx.category} />
            <span style={{ fontSize: 13, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {tx.description || 'Unnamed Transaction'}
            </span>
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-secondary)', display: 'flex', gap: 6 }}>
            <span>{tx.date}</span>
            {tx.who && <><span>·</span><span>{tx.who}</span></>}
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div className="actions hide-mobile" style={{ display: 'flex', gap: 8 }}>
            <button 
              onClick={() => onEdit(tx)} 
              style={{ padding: '4px 10px', borderRadius: 6, border: '1px solid var(--border-color)', background: 'var(--bg-hover)', color: 'var(--text-primary)', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}
            >
              Edit
            </button>
            <button 
              onClick={handleDelete} 
              style={{ padding: '4px 10px', borderRadius: 6, border: '1px solid var(--accent-danger)', background: 'transparent', color: 'var(--accent-danger)', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}
            >
              Delete
            </button>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontWeight: 700, fontSize: 14 }}>
              {currencySymbol}{Number(tx.amount).toFixed(2)}
            </span>
            <div className="hide-desktop" style={{ width: 4, height: 20, background: 'var(--border-color)', borderRadius: 2, marginLeft: 4, opacity: 0.5 }} />
          </div>
        </div>
      </div>
    </div>
  );
}
