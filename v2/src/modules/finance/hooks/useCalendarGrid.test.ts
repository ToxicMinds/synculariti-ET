import { renderHook } from '@testing-library/react';
import { useCalendarGrid } from './useCalendarGrid';
import { Transaction } from '../lib/finance';

const mockTransactions: Transaction[] = [
  { id: '1', amount: 100, date: '2024-05-01', category: 'Food', who: 'User', currency: 'EUR' },
  { id: '2', amount: 200, date: '2024-05-01', category: 'Rent', who: 'User', currency: 'EUR' },
  { id: '3', amount: 300, date: '2024-05-02', category: 'Fun', who: 'User', currency: 'EUR' },
  { id: '4', amount: 50, date: '2024-05-15', category: 'Food', who: 'User', currency: 'EUR' },
];

describe('useCalendarGrid Contract (Batch G)', () => {
  const baseDate = new Date('2024-05-01');

  it('should correctly aggregate totals for each day', () => {
    const { result } = renderHook(() => useCalendarGrid(mockTransactions, baseDate));

    const day1 = result.current.grid.find(d => d.day === 1);
    expect(day1?.total).toBe(300);

    const day2 = result.current.grid.find(d => d.day === 2);
    expect(day2?.total).toBe(300);

    const day15 = result.current.grid.find(d => d.day === 15);
    expect(day15?.total).toBe(50);
  });

  it('should calculate the correct intensity relative to maxDailySpend', () => {
    const { result } = renderHook(() => useCalendarGrid(mockTransactions, baseDate));
    
    expect(result.current.maxDailySpend).toBe(300);

    const day1 = result.current.grid.find(d => d.day === 1);
    const day15 = result.current.grid.find(d => d.day === 15);

    expect(day1?.intensity).toBe(1.0);
    expect(day15?.intensity).toBeCloseTo(50 / 300, 2);
  });

  it('should handle months with different days (e.g. Feb Leap Year)', () => {
    const leapYearTxs: Transaction[] = [
      { id: '1', amount: 10, date: '2024-02-29', category: 'Food', who: 'User', currency: 'EUR' }
    ];
    const { result } = renderHook(() => useCalendarGrid(leapYearTxs, new Date('2024-02-01')));
    
    expect(result.current.grid.length).toBe(29);
    expect(result.current.grid[28].day).toBe(29);
  });
});
