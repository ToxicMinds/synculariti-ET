import {
  calcTotals,
  calcPerUserSpend,
  calcCategoryTotals,
  normalizeUserId,
  calcMonthDelta
} from './aggregation';
import { Transaction } from './finance';

describe('Finance Aggregations', () => {
  const SAMPLE_NAMES = { u1: 'Nikhil', u2: 'Nik' };

  describe('calcTotals', () => {
    it('correctly aggregates Legacy and Modern transaction types', () => {
      const mixed: Transaction[] = [
        { category: 'Savings', amount: 100, date: '2026-04-01' },
        { category: 'Food', category_id: 'c_savings', amount: 50, date: '2026-04-02' },
        { category: 'Adjustment', amount: 10, date: '2026-04-03' },
        { category: 'Rent', amount: 1000, date: '2026-04-04' }
      ];

      const { saved, spent, adjusted } = calcTotals(mixed);
      expect(saved).toBe(150);
      expect(spent).toBe(1000);
      expect(adjusted).toBe(10);
    });

    it('handles numeric string conversion cleanly', () => {
      const data: Transaction[] = [{ category: 'Food', amount: '123.45', date: '2026-04-01' }];
      expect(calcTotals(data).spent).toBe(123.45);
    });
  });

  describe('calcPerUserSpend', () => {
    it('performs O(N) spend attribution by user ID or fallback name', () => {
      const transactions: Transaction[] = [
        { who: 'Nikhil', who_id: 'u1', category: 'Groceries', amount: 10, date: '2026-04-01' },
        { who: 'Nik', who_id: 'u2', category: 'Coffee', amount: 5, date: '2026-04-02' },
        { who: 'Nik', who_id: 'u2', category: 'Savings', amount: 100, date: '2026-04-03' }
      ];

      const result = calcPerUserSpend(transactions, SAMPLE_NAMES);
      expect(result.u1).toBe(10);
      expect(result.u2).toBe(5);
    });

    it('handles padded mock UUID mapping back to simple ID', () => {
      const transactions: Transaction[] = [
        { who_id: '00000000-0000-0000-0000-000000000002', category: 'Supplies', amount: 45, date: '2026-04-02' }
      ];

      const result = calcPerUserSpend(transactions, SAMPLE_NAMES);
      expect(result.u2).toBe(45);
    });
  });

  describe('calcCategoryTotals', () => {
    it('groups spend by categories, ignoring savings/adjustments', () => {
      const transactions: Transaction[] = [
        { category: 'Food', amount: 50, date: '2026-04-01' },
        { category: 'Transport', amount: 20, date: '2026-04-03' },
        { category: 'Savings', amount: 1000, date: '2026-04-04' }
      ];

      const result = calcCategoryTotals(transactions);
      expect(result.Food).toBe(50);
      expect(result.Transport).toBe(20);
      expect(result.Savings).toBeUndefined();
    });
  });

  describe('normalizeUserId', () => {
    it('pads legacy/mock user IDs to full UUID structure', () => {
      expect(normalizeUserId('u1')).toBe('00000000-0000-0000-0000-000000000001');
      expect(normalizeUserId('u25')).toBe('00000000-0000-0000-0000-000000000025');
    });

    it('leaves standard UUIDs unchanged', () => {
      const standard = 'e8b7d6c5-4321-abcd-ef01-23456789abcd';
      expect(normalizeUserId(standard)).toBe(standard);
    });

    it('falls back to guest UUID when mock ID is too long', () => {
      expect(normalizeUserId('u9999999999999')).toBe('00000000-0000-0000-0000-000000000000');
    });
  });

  describe('calcMonthDelta', () => {
    it('calculates differences boundary-aware', () => {
      const history: Transaction[] = [
        { amount: 100, category: 'Food', date: '2026-03-15' }
      ];
      
      const { deltaStr } = calcMonthDelta(history, '2026-04', 150);
      expect(deltaStr).toBe('+50,00\xa0€');
    });
  });
});
