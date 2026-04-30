'use client';

import { useState } from 'react';
import { Expense } from '@/lib/finance';
import { CategoryPill } from './CategoryPill';

type ViewMode = 'list' | 'calendar';

function CalendarView({ expenses }: { expenses: Expense[] }) {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  // Build day totals
  const dayTotals: Record<number, number> = {};
  const dayExpenses: Record<number, Expense[]> = {};
  expenses.forEach(e => {
    const d = new Date(e.date);
    if (d.getMonth() === month && d.getFullYear() === year) {
      const day = d.getDate();
      dayTotals[day] = (dayTotals[day] || 0) + Number(e.amount);
      dayExpenses[day] = [...(dayExpenses[day] || []), e];
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
      {selectedDay && dayExpenses[selectedDay] && (
        <div style={{ marginTop: 16, padding: 12, background: 'var(--bg-hover)', borderRadius: 12 }}>
          <p style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', marginBottom: 8 }}>
            {now.toLocaleString('default', { month: 'long' })} {selectedDay}
          </p>
          {dayExpenses[selectedDay].map(e => (
            <div key={e.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, padding: '4px 0' }}>
              <span style={{ color: 'var(--text-primary)' }}>{e.description || e.category}</span>
              <span style={{ fontWeight: 600 }}>€{Number(e.amount).toFixed(2)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function ExpenseList({ expenses, onDelete, onEdit }: { 
  expenses: Expense[]; 
  onDelete: (id: string) => void;
  onEdit: (exp: Expense) => void;
}) {
  const [categoryFilter, setCategoryFilter] = useState('All');
  const [whoFilter, setWhoFilter] = useState('All');
  const [whatFilter, setWhatFilter] = useState('');
  const [viewMode, setViewMode] = useState<ViewMode>('list');

  const uniqueCategories = ['All', ...Array.from(new Set(expenses.map(e => e.category).filter(Boolean)))];
  const uniqueWhos = ['All', ...Array.from(new Set(expenses.map(e => e.who).filter(Boolean)))];

  const filtered = expenses.filter(e => {
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
        <CalendarView expenses={filtered} />
      ) : (
        <>
          {filtered.length === 0 ? (
            <div style={{ color: 'var(--text-muted)', fontSize: 14, padding: '12px 0', textAlign: 'center' }}>
              No expenses match your filters.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              {filtered.map(exp => (
                <div
                  key={exp.id}
                  style={{
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    padding: '11px 0', borderBottom: '1px solid var(--border-color)'
                  }}
                >
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 3, flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <CategoryPill category={exp.category} />
                      <span style={{ fontSize: 13, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {exp.description || 'Unnamed Expense'}
                      </span>
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--text-secondary)', display: 'flex', gap: 6 }}>
                      <span>{exp.date}</span>
                      {exp.who && <><span>·</span><span>{exp.who}</span></>}
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
                    <span style={{ fontWeight: 700, fontSize: 14 }}>€{Number(exp.amount).toFixed(2)}</span>
                    <button
                      onClick={() => onEdit(exp)}
                      style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 14, padding: '0 4px' }}
                      title="Edit"
                    >✏️</button>
                    <button
                      onClick={() => exp.id && onDelete(exp.id)}
                      style={{ background: 'none', border: 'none', color: 'var(--accent-danger)', cursor: 'pointer', fontSize: 18, lineHeight: 1, padding: '0 4px' }}
                      title="Delete"
                    >×</button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
