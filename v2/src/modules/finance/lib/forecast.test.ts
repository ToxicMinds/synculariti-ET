import { calcTimeBoundForecast } from './forecast';
import { Transaction } from './finance';

describe('Finance Forecasting', () => {
  it('identifies unconfigured budget thresholds', () => {
    const transactions: Transaction[] = [{ amount: 150, category: 'Food', date: '2026-05-01' }];
    const result = calcTimeBoundForecast(transactions, 0, new Date('2026-05-17'));
    expect(result.status).toBe('PENDING_CONFIGURATION');
  });

  it('runs linear progression projection mapping status tiers', () => {
    // May has 31 days. Spent 1700 in 17 days = 100/day. Projected 3100. Budget 2000.
    const transactions: Transaction[] = [{ amount: 1700, category: 'Food', date: '2026-05-01' }];
    const result = calcTimeBoundForecast(transactions, 2000, new Date('2026-05-17'));
    expect(result.dailySpendRate).toBe(100);
    expect(result.projectedSpend).toBe(3100);
    expect(result.status).toBe('IN_DANGER');
  });
});
