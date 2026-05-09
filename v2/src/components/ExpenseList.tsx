import { useState, useRef } from 'react';
import { Transaction } from '@/lib/finance';
import { CategoryPill } from './CategoryPill';

type ViewMode = 'list' | 'calendar';

/**
 * SwipeableRow: Replicates the v1 mobile UX.
 * Left swipe reveals Edit/Delete.
 */
function SwipeableRow({ tx, onDelete, onEdit }: { 
  tx: Transaction; 
  onDelete: (id: string) => void;
  onEdit: (tx: Transaction) => void;
}) {
  const [swipeOffset, setSwipeOffset] = useState(0);
  const startX = useRef(0);
  const isDragging = useRef(false);

  const onTouchStart = (e: React.TouchEvent) => {
    startX.current = e.touches[0].clientX;
    isDragging.current = true;
  };

  const onTouchMove = (e: React.TouchEvent) => {
    if (!isDragging.current) return;
    const currentX = e.touches[0].clientX;
    const diff = currentX - startX.current;
    // Only allow left swipe (negative offset)
    if (diff < 0) {
      setSwipeOffset(Math.max(diff, -140)); // Max reveal 140px
    } else {
      setSwipeOffset(0);
    }
  };

  const onTouchEnd = () => {
    isDragging.current = false;
    // Snap to open or closed
    if (swipeOffset < -70) {
      setSwipeOffset(-140);
    } else {
      setSwipeOffset(0);
    }
  };

  const handleDelete = () => {
    if (tx.id && window.confirm('Are you sure you want to delete this transaction?')) {
      onDelete(tx.id);
      setSwipeOffset(0);
    }
  };

  return (
    <div className="desktop-hover-reveal" style={{ position: 'relative', overflow: 'hidden', borderBottom: '1px solid var(--border-color)' }}>
      {/* Action Buttons (Mobile Swipe Reveal) */}
      <div className="hide-desktop" style={{
        position: 'absolute',
        right: 0,
        top: 0,
        bottom: 0,
        width: 140,
        display: 'flex',
        alignItems: 'stretch'
      }}>
        <button 
          onClick={() => { onEdit(tx); setSwipeOffset(0); }}
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
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '12px 16px', // Added padding for desktop feel
          background: 'var(--bg-card)',
          transform: `translateX(${swipeOffset}px)`,
          transition: isDragging.current ? 'none' : 'transform 0.3s cubic-bezier(0.2, 0.8, 0.2, 1)',
          position: 'relative',
          zIndex: 2,
          cursor: swipeOffset !== 0 ? 'grabbing' : 'default'
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
          {/* Desktop Only: Hover Actions */}
          <div className="actions hide-mobile" style={{ display: 'flex', gap: 8 }}>
            <button 
              onClick={() => onEdit(tx)}
              style={{ 
                padding: '4px 10px', 
                borderRadius: 6, 
                border: '1px solid var(--border-color)',
                background: 'var(--bg-hover)',
                color: 'var(--text-primary)',
                fontSize: 11,
                fontWeight: 600,
                cursor: 'pointer'
              }}
            >
              Edit
            </button>
            <button 
              onClick={handleDelete}
              style={{ 
                padding: '4px 10px', 
                borderRadius: 6, 
                border: '1px solid var(--accent-danger)',
                background: 'transparent',
                color: 'var(--accent-danger)',
                fontSize: 11,
                fontWeight: 600,
                cursor: 'pointer'
              }}
            >
              Delete
            </button>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontWeight: 700, fontSize: 14 }}>
              {tx.currency === 'EUR' || !tx.currency ? '€' : tx.currency}{Number(tx.amount).toFixed(2)}
            </span>
            {/* Subtle indicator for mobile users or to hint swipe */}
            <div className="hide-desktop" style={{ width: 4, height: 20, background: 'var(--border-color)', borderRadius: 2, marginLeft: 4, opacity: 0.5 }} />
          </div>
        </div>
      </div>
    </div>
  );
}

function CalendarView({ transactions }: { transactions: Transaction[] }) {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  // Build day totals
  const dayTotals: Record<number, number> = {};
  const dayTransactions: Record<number, Transaction[]> = {};
  transactions.forEach(t => {
    const d = new Date(t.date);
    if (d.getMonth() === month && d.getFullYear() === year) {
      const day = d.getDate();
      dayTotals[day] = (dayTotals[day] || 0) + Number(t.amount);
      dayTransactions[day] = [...(dayTransactions[day] || []), t];
    }
  });
  const maxSpend = Math.max(...Object.values(dayTotals), 1);

  const [selectedDay, setSelectedDay] = useState<number | null>(null);

  const firstDayOfMonth = new Date(year, month, 1).getDay();
  const paddingDays = firstDayOfMonth === 0 ? 6 : firstDayOfMonth - 1; // Mon-first grid

  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4, marginBottom: 4 }}>
        {['M','T','W','T','F','S','S'].map((d, i) => (
          <div key={i} style={{ textAlign: 'center', fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', padding: '4px 0' }}>{d}</div>
        ))}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4 }}>
        {Array.from({ length: paddingDays }).map((_, i) => <div key={`pad-${i}`} />)}
        {Array.from({ length: daysInMonth }, (_, i) => i + 1).map(day => {
          const total = dayTotals[day] || 0;
          const intensity = total > 0 ? Math.max(0.08, total / maxSpend) : 0;
          const isSelected = selectedDay === day;
          return (
            <div
              key={day}
              onClick={() => setSelectedDay(isSelected ? null : day)}
              style={{
                borderRadius: 8,
                padding: '6px 4px',
                textAlign: 'center',
                cursor: total > 0 ? 'pointer' : 'default',
                background: total > 0
                  ? `rgba(99, 102, 241, ${intensity})`
                  : 'var(--bg-hover)',
                border: isSelected ? '2px solid #6366f1' : '1px solid transparent',
                transition: 'all 0.15s'
              }}
            >
              <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-primary)' }}>{day}</div>
              {total > 0 && (
                <div style={{ fontSize: 9, color: total / maxSpend > 0.5 ? '#fff' : 'var(--text-secondary)', marginTop: 2 }}>
                  €{Math.round(total)}
                </div>
              )}
            </div>
          );
        })}
      </div>
      {selectedDay && dayTransactions[selectedDay] && (
        <div style={{ marginTop: 16, padding: 12, background: 'var(--bg-hover)', borderRadius: 12 }}>
          <p style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', marginBottom: 8 }}>
            {now.toLocaleString('default', { month: 'long' })} {selectedDay}
          </p>
          {dayTransactions[selectedDay].map(t => (
            <div key={t.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, padding: '4px 0' }}>
              <span style={{ color: 'var(--text-primary)' }}>{t.description || t.category}</span>
              <span style={{ fontWeight: 600 }}>€{Number(t.amount).toFixed(2)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function ExpenseList({ transactions, onDelete, onEdit }: { 
  transactions: Transaction[]; 
  onDelete: (id: string) => void;
  onEdit: (tx: Transaction) => void;
}) {
  const [categoryFilter, setCategoryFilter] = useState('All');
  const [whoFilter, setWhoFilter] = useState('All');
  const [whatFilter, setWhatFilter] = useState('');
  const [viewMode, setViewMode] = useState<ViewMode>('list');

  const uniqueCategories = ['All', ...Array.from(new Set(transactions.map(e => e.category).filter(Boolean)))];
  const uniqueWhos = ['All', ...Array.from(new Set(transactions.map(e => e.who).filter(Boolean)))];

  const filtered = transactions.filter(e => {
    if (categoryFilter !== 'All' && e.category !== categoryFilter) return false;
    if (whoFilter !== 'All' && e.who !== whoFilter) return false;
    if (whatFilter && !(e.description?.toLowerCase().includes(whatFilter.toLowerCase()) || e.category.toLowerCase().includes(whatFilter.toLowerCase()))) return false;
    return true;
  });

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

  return (
    <div>
      {/* Search & Filter Row */}
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
            {uniqueCategories.map(c => <option key={c} value={c}>{c === 'All' ? 'All Categories' : c}</option>)}
          </select>
          <select value={whoFilter} onChange={e => setWhoFilter(e.target.value)} style={selectStyle}>
            {uniqueWhos.map(w => <option key={w} value={w}>{w === 'All' ? 'Everyone' : w}</option>)}
          </select>
          <button
            onClick={() => setViewMode(viewMode === 'list' ? 'calendar' : 'list')}
            style={{
              padding: '6px 12px', borderRadius: 8, border: '1px solid var(--border-color)',
              background: 'transparent', color: 'var(--text-secondary)', fontSize: 12,
              fontWeight: 600, cursor: 'pointer', flexShrink: 0
            }}
          >
            {viewMode === 'list' ? '📅 Calendar' : '📋 List'}
          </button>
        </div>
      </div>

      {viewMode === 'calendar' ? (
        <CalendarView transactions={filtered} />
      ) : (
        <>
          {filtered.length === 0 ? (
            <div style={{ color: 'var(--text-muted)', fontSize: 14, padding: '12px 0', textAlign: 'center' }}>
              No transactions match your filters.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              {filtered.map(tx => (
                <SwipeableRow 
                  key={tx.id} 
                  tx={tx} 
                  onDelete={onDelete} 
                  onEdit={onEdit} 
                />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
