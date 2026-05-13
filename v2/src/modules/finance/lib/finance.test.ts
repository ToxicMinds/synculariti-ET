import {
  calcTotals,
  calcPerUserSpend,
  calcForecast,
  calcNetSavings,
  calcBudgetStatus,
  calcMonthDelta,
  calcCategoryTotals,
  Transaction
} from './finance';

describe('Finance Calculation Library (Canonical)', () => {
  
  const SAMPLE_NAMES = { u1: 'Nikhil', u2: 'Nik' };

  describe('calcTotals', () => {
    test('Hybrid Mode: Correctly identifies Savings and Adjustments from both text and ID', () => {
      const mixed: Transaction[] = [
        { category: 'Savings', amount: 100, date: '2026-04-01' },             // Legacy v1
        { category: 'Food', category_id: 'c_savings', amount: 50, date: '2026-04-02' }, // Modern v2
        { category: 'Adjustment', amount: 10, date: '2026-04-03' },           // Adjustment
        { category: 'Rent', amount: 1000, date: '2026-04-04' }                // Normal spend
      ];

      const { saved, spent, adjusted } = calcTotals(mixed);
      
      expect(saved).toBe(150);
      expect(spent).toBe(1000);
      expect(adjusted).toBe(10);
    });

    test('Handles numeric strings from Supabase', () => {
      const data: Transaction[] = [{ category: 'Food', amount: '123.45', date: '2026-04-01' }];
      expect(calcTotals(data).spent).toBe(123.45);
    });
  });

  describe('calcPerUserSpend', () => {
    test('Performance & Accuracy: Single pass (O(N)) attribution', () => {
      const transactions: Transaction[] = [
        { who: 'Nikhil', who_id: 'u1', category: 'Groceries', amount: 10, date: '2026-04-01' },
        { who: 'Nik', who_id: 'u2', category: 'Coffee', amount: 5, date: '2026-04-02' },
        { who: 'Nik', who_id: 'u2', category: 'Savings', amount: 100, date: '2026-04-03' } // Should be ignored
      ];

      const result = calcPerUserSpend(transactions, SAMPLE_NAMES);
      
      expect(result.u1).toBe(10);
      expect(result.u2).toBe(5);
    });

    test('Backward Compatibility: Fallback to name-based matching', () => {
      const legacy: Transaction[] = [
        { who: 'Nikhil', amount: 50, category: 'Groceries', date: '2026-04-01' }
      ];
      const result = calcPerUserSpend(legacy, SAMPLE_NAMES);
      expect(result.u1).toBe(50);
    });
  });

  describe('calcForecast', () => {
    test('Calculates projections accurately', () => {
      // Mid-month scenario (April has 30 days)
      const now = new Date('2026-04-15'); 
      const transactions: Transaction[] = [
        { amount: 150, category: 'Food', date: '2026-04-01' }, // 150 spent in 15 days = 10/day
      ];
      
      const { projected, dailyRate } = calcForecast(transactions, 500, now);
      
      expect(dailyRate).toBe(10);
      expect(projected).toBe(300); // 150 + (10 * 15 days left)
    });

    test('Excludes recurring from daily rate burn', () => {
      const now = new Date('2026-04-10'); 
      const transactions: Transaction[] = [
        { amount: 100, category: 'Rent', recurring_id: 'r1', date: '2026-04-01' },
        { amount: 100, category: 'Food', date: '2026-04-05' } // 100 variable in 10 days = 10/day
      ];
      
      const { projected, dailyRate } = calcForecast(transactions, 1000, now);
      
      expect(dailyRate).toBe(10);
      expect(projected).toBe(400); // 200 (spent) + (10 * 20 days left)
    });
  });

  describe('calcBudgetStatus', () => {
    test('Correctly flags health status', () => {
      expect(calcBudgetStatus(50, 100).status).toBe('good');
      expect(calcBudgetStatus(85, 100).status).toBe('warn'); // < 20% left
      expect(calcBudgetStatus(110, 100).status).toBe('bad'); // overspent
    });
  });

  describe('calcMonthDelta', () => {
    test('Calculates delta across month boundaries', () => {
      const history: Transaction[] = [
        { amount: 100, category: 'Food', date: '2026-03-15' }
      ];
      
      const { deltaStr } = calcMonthDelta(history, '2026-04', 150, '$');
      expect(deltaStr).toBe('+$50.00');
    });

    test('Handles January -> December transition', () => {
      const history: Transaction[] = [
        { amount: 200, category: 'Food', date: '2025-12-15' }
      ];
      const { delta } = calcMonthDelta(history, '2026-01', 150);
      expect(delta).toBe(-50);
    });
  });

  describe('calcCategoryTotals', () => {
    test('Aggregates by category name', () => {
      const transactions: Transaction[] = [
        { category: 'Food', amount: 50, date: '2026-04-01' },
        { category: 'Food', amount: 30, date: '2026-04-02' },
        { category: 'Transport', amount: 20, date: '2026-04-03' },
        { category: 'Savings', amount: 1000, date: '2026-04-04' } // Should be ignored
      ];

      const result = calcCategoryTotals(transactions);
      expect(result.Food).toBe(80);
      expect(result.Transport).toBe(20);
      expect(result.Savings).toBeUndefined();
    });
  });
});
