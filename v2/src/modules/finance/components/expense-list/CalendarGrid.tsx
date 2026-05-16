'use client';

import React, { useState } from 'react';
import { Transaction } from '../../lib/finance';
import { useCalendarGrid } from '../../hooks/useCalendarGrid';

interface CalendarGridProps {
  transactions: Transaction[];
  baseDate?: Date;
}

export function CalendarGrid({ transactions, baseDate = new Date() }: CalendarGridProps) {
  const { grid, paddingDays, monthName, maxDailySpend } = useCalendarGrid(transactions, baseDate);
  const [selectedDay, setSelectedDay] = useState<number | null>(null);

  const selectedDayData = selectedDay ? grid.find(d => d.day === selectedDay) : null;

  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4, marginBottom: 4 }}>
        {['M','T','W','T','F','S','S'].map((d, i) => (
          <div key={i} style={{ textAlign: 'center', fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', padding: '4px 0' }}>
            {d}
          </div>
        ))}
      </div>
      
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4 }}>
        {Array.from({ length: paddingDays }).map((_, i) => (
          <div key={`pad-${i}`} />
        ))}
        
        {grid.map(dayData => {
          const isSelected = selectedDay === dayData.day;
          const hasSpend = dayData.total > 0;
          
          return (
            <div
              key={dayData.day}
              onClick={() => setSelectedDay(isSelected ? null : dayData.day)}
              style={{
                borderRadius: 8, 
                padding: '6px 4px', 
                textAlign: 'center',
                cursor: hasSpend ? 'pointer' : 'default',
                background: hasSpend ? `rgba(99, 102, 241, ${Math.max(0.08, dayData.intensity)})` : 'var(--bg-hover)',
                border: isSelected ? '2px solid #6366f1' : '1px solid transparent',
                transition: 'all 0.15s'
              }}
            >
              <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-primary)' }}>
                {dayData.day}
              </div>
              {hasSpend && (
                <div style={{ fontSize: 9, color: dayData.intensity > 0.5 ? '#fff' : 'var(--text-secondary)', marginTop: 2 }}>
                  €{Math.round(dayData.total)}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {selectedDayData && selectedDayData.transactions.length > 0 && (
        <div style={{ marginTop: 16, padding: 12, background: 'var(--bg-hover)', borderRadius: 12 }}>
          <p style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', marginBottom: 8 }}>
            {monthName} {selectedDayData.day}
          </p>
          {selectedDayData.transactions.map(t => (
            <div key={t.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, padding: '4px 0' }}>
              <span style={{ color: 'var(--text-primary)' }}>{t.description || t.category}</span>
              <span style={{ fontWeight: 600 }}>
                {t.currency === 'EUR' || !t.currency ? '€' : t.currency}{Number(t.amount).toFixed(2)}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
