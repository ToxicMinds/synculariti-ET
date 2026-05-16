'use client';

import { useMemo } from 'react';
import { Transaction } from '../lib/finance';

export interface CalendarDayData {
  day: number;
  total: number;
  intensity: number;
  transactions: Transaction[];
  isToday: boolean;
}

export interface UseCalendarGridReturn {
  grid: CalendarDayData[];
  paddingDays: number;
  monthName: string;
  maxDailySpend: number;
}

/**
 * useCalendarGrid: Generates a fiscal grid from a transaction ledger for a SPECIFIC date context.
 */
export function useCalendarGrid(transactions: Transaction[], baseDate: Date = new Date()): UseCalendarGridReturn {
  return useMemo(() => {
    const year = baseDate.getFullYear();
    const month = baseDate.getMonth(); // 0-indexed
    
    const now = new Date();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const firstDayOfMonth = new Date(year, month, 1).getDay();
    
    // Padding logic (Monday start: Mon=1, Tue=2... Sun=0)
    const paddingDays = firstDayOfMonth === 0 ? 6 : firstDayOfMonth - 1;

    const dayMap: Record<number, { total: number; transactions: Transaction[] }> = {};
    for (let i = 1; i <= daysInMonth; i++) {
      dayMap[i] = { total: 0, transactions: [] };
    }

    let maxDailySpend = 0;

    for (const tx of transactions) {
      const d = new Date(tx.date);
      // Only include transactions that match the month/year of the baseDate
      if (d.getMonth() === month && d.getFullYear() === year) {
        const day = d.getDate();
        if (dayMap[day]) {
          dayMap[day].total += Number(tx.amount);
          dayMap[day].transactions.push(tx);
          if (dayMap[day].total > maxDailySpend) {
            maxDailySpend = dayMap[day].total;
          }
        }
      }
    }

    const grid: CalendarDayData[] = Object.entries(dayMap).map(([dayStr, data]) => {
      const day = parseInt(dayStr);
      return {
        day,
        total: data.total,
        intensity: maxDailySpend > 0 ? data.total / maxDailySpend : 0,
        transactions: data.transactions,
        isToday: day === now.getDate() && month === now.getMonth() && year === now.getFullYear()
      };
    });

    return {
      grid,
      paddingDays,
      monthName: baseDate.toLocaleString('default', { month: 'long' }),
      maxDailySpend: maxDailySpend || 1
    };
  }, [transactions, baseDate.getFullYear(), baseDate.getMonth()]);
}
