'use client';

import { useState } from 'react';
import { Expense } from '@/lib/finance';
import { CategoryPill } from './CategoryPill';

const CATEGORIES = [
  'All', 'Groceries', 'Food', 'Transport', 'Housing', 'Utilities',
  'Health', 'Clothing', 'Entertainment', 'Savings', 'Adjustment', 'Other'
];

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
      {/* Day labels */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4, marginBottom: 4 }}>
        {['M','T','W','T','F','S','S'].map((d, i) => (
          <div key={i} style={{ textAlign: 'center', fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', padding: '4px 0' }}>{d}</div>
        ))}
      </div>
      {/* Calendar grid */}
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
      {/* Day detail */}
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

export function ExpenseList({ expenses, onDelete }: { expenses: Expense[]; onDelete: (id: string) => void }) {
  const [categoryFilter, setCategoryFilter] = useState('All');
  const [viewMode, setViewMode] = useState<ViewMode>('list');

  const uniqueCategories = ['All', ...Array.from(new Set(expenses.map(e => e.category).filter(Boolean)))];

  const filtered = categoryFilter === 'All'
    ? expenses
    : expenses.filter(e => e.category === categoryFilter);

  return (
    <div>
      {/* Controls Row */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap', alignItems: 'center' }}>
        {/* Category filter pills */}
        <div style={{ display: 'flex', gap: 6, overflowX: 'auto', flex: 1 }}>
          {uniqueCategories.map(cat => (
            <button
              key={cat}
              onClick={() => setCategoryFilter(cat)}
              style={{
                padding: '4px 10px',
                borderRadius: 20,
                border: '1px solid var(--border-color)',
                background: categoryFilter === cat ? 'var(--accent-primary)' : 'transparent',
                color: categoryFilter === cat ? 'var(--accent-primary-text)' : 'var(--text-secondary)',
                fontSize: 11,
                fontWeight: 600,
                cursor: 'pointer',
                whiteSpace: 'nowrap',
                fontFamily: 'inherit'
              }}
            >
              {cat}
            </button>
          ))}
        </div>
        {/* View toggle */}
        <button
          onClick={() => setViewMode(viewMode === 'list' ? 'calendar' : 'list')}
          style={{
            padding: '4px 10px', borderRadius: 8, border: '1px solid var(--border-color)',
            background: 'transparent', color: 'var(--text-secondary)', fontSize: 11,
            fontWeight: 600, cursor: 'pointer', flexShrink: 0, fontFamily: 'inherit'
          }}
        >
          {viewMode === 'list' ? '📅 Calendar' : '📋 List'}
        </button>
      </div>

      {viewMode === 'calendar' ? (
        <CalendarView expenses={filtered} />
      ) : (
        <>
          {filtered.length === 0 ? (
            <div style={{ color: 'var(--text-muted)', fontSize: 14, padding: '12px 0' }}>No expenses for this filter.</div>
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
                      onClick={() => exp.id && onDelete(exp.id)}
                      style={{ background: 'none', border: 'none', color: 'var(--accent-danger)', cursor: 'pointer', fontSize: 18, lineHeight: 1, padding: '0 4px' }}
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
