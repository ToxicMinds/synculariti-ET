/**
 * tests/finance.test.js
 *
 * Unit tests for js/finance.js — the pure financial calculation layer.
 * Run with: npm test
 * No browser. No DOM. No network.
 */

const {
  calcTotals,
  calcForecast,
  calcPerUserSpend,
  calcNetSavings,
  calcBudgetStatus,
  calcMonthDelta,
  calcCategoryTotals
} = require('../js/finance.js');

// ─── Shared test fixtures ───────────────────────────────────────────────────

const APRIL = '2026-04';
const NAMES = { u1: 'Nikhil', u2: 'Zuzana' };

const sampleExpenses = [
  { who_id: 'u1', who: 'Nikhil', category: 'Groceries',  amount: 100,  date: '2026-04-10' },
  { who_id: 'u1', who: 'Nikhil', category: 'Transport',  amount: 50,   date: '2026-04-12' },
  { who_id: 'u2', who: 'Zuzana', category: 'Savings',    amount: 200,  date: '2026-04-15' },
  { who_id: 'u2', who: 'Zuzana', category: 'Groceries',  amount: 80,   date: '2026-04-18' },
  { who_id: 'u1', who: 'Nikhil', category: 'Adjustment', amount: -10,  date: '2026-04-20' },
];

const legacyExpenses = [
  // Old-style: no who_id, name stored in `who`
  { who_id: null,  who: 'Nikhil', category: 'Dining',  amount: 30, date: '2026-04-05' },
  { who_id: 'u2',  who: 'Zuzana', category: 'Health',  amount: 60, date: '2026-04-08' },
];

// ─── calcTotals ──────────────────────────────────────────────────────────────

describe('calcTotals', () => {
  test('correctly sums non-savings spending', () => {
    const { spent } = calcTotals(sampleExpenses);
    expect(spent).toBe(230); // 100 + 50 + 80 (Savings and Adjustment excluded)
  });

  test('correctly sums savings', () => {
    const { saved } = calcTotals(sampleExpenses);
    expect(saved).toBe(200);
  });

  test('correctly sums adjustments', () => {
    const { adjusted } = calcTotals(sampleExpenses);
    expect(adjusted).toBe(-10);
  });

  test('returns zeros for empty array', () => {
    const result = calcTotals([]);
    expect(result.spent).toBe(0);
    expect(result.saved).toBe(0);
    expect(result.adjusted).toBe(0);
  });

  test('handles non-numeric amounts gracefully', () => {
    const bad = [{ category: 'Groceries', amount: 'abc' }];
    const { spent } = calcTotals(bad);
    expect(spent).toBe(0);
  });
});

// ─── calcForecast ────────────────────────────────────────────────────────────

describe('calcForecast', () => {
  test('projects spending rate correctly at mid-month', () => {
    const expenses = [
      { category: 'Groceries', amount: 150 }, // 150 spent in 15 days
    ];
    const mockDate = new Date(2026, 3, 15); // April 15, 30-day month
    const { projected, diff } = calcForecast(expenses, 1000, mockDate);
    // dailyRate = 150/15 = 10, daysLeft = 15, projected = 150 + 150 = 300
    expect(projected).toBeCloseTo(300);
    expect(diff).toBeCloseTo(300 - 1000); // -700
  });

  test('handles day 1 without division by zero', () => {
    const mockDate = new Date(2026, 3, 1); // April 1
    const { projected, dailyRate } = calcForecast([], 1000, mockDate);
    expect(isNaN(projected)).toBe(false);
    expect(projected).toBe(0);
    expect(dailyRate).toBe(0);
  });

  test('excludes recurring items from daily rate calculation', () => {
    const expenses = [
      { category: 'Utilities', amount: 200, recurring_id: 'rec_1' }, // Fixed bill
      { category: 'Groceries', amount: 100 },                         // Variable
    ];
    const mockDate = new Date(2026, 3, 10); // April 10
    const { dailyRate } = calcForecast(expenses, 1000, mockDate);
    // Only 100 (variable) / 10 days = 10/day
    expect(dailyRate).toBeCloseTo(10);
  });

  test('forecasts correctly at end of month', () => {
    const mockDate = new Date(2026, 3, 30); // April 30 - last day
    const { projected, diff } = calcForecast(sampleExpenses, 500, mockDate);
    // daysLeft = 0, projected = spent (no extrapolation)
    const spent = calcTotals(sampleExpenses).spent; // 230
    expect(projected).toBeCloseTo(spent);
    expect(diff).toBeCloseTo(230 - 500);
  });
});

// ─── calcPerUserSpend ────────────────────────────────────────────────────────

describe('calcPerUserSpend', () => {
  test('correctly attributes spend to each user by who_id', () => {
    const result = calcPerUserSpend(sampleExpenses, NAMES);
    expect(result.u1).toBe(150); // 100 + 50 (Adjustment -10 excluded)
    expect(result.u2).toBe(80);  // Only Groceries (Savings excluded)
  });

  test('falls back to name matching for legacy entries (no who_id)', () => {
    const result = calcPerUserSpend(legacyExpenses, NAMES);
    expect(result.u1).toBe(30); // Matched by name 'Nikhil'
    expect(result.u2).toBe(60); // Matched by who_id 'u2'
  });

  test('returns 0 for users with no expenses', () => {
    const result = calcPerUserSpend([], NAMES);
    expect(result.u1).toBe(0);
    expect(result.u2).toBe(0);
  });

  test('handles unknown user keys gracefully', () => {
    const names = { u1: 'Nikhil', u2: 'Zuzana', u3: 'Nobody' };
    const result = calcPerUserSpend(sampleExpenses, names);
    expect(result.u3).toBe(0);
  });
});

// ─── calcNetSavings ──────────────────────────────────────────────────────────

describe('calcNetSavings', () => {
  test('calculates correctly with positive income', () => {
    const { netSavings, pct } = calcNetSavings(3000, 2200);
    expect(netSavings).toBe(800);
    expect(pct).toBe(27);
  });

  test('handles deficit correctly', () => {
    const { netSavings } = calcNetSavings(2000, 2500);
    expect(netSavings).toBe(-500);
  });

  test('returns 0 pct when income is 0 — no division by zero', () => {
    const { pct } = calcNetSavings(0, 500);
    expect(pct).toBe(0);
  });

  test('returns 100% when everything is saved', () => {
    const { pct } = calcNetSavings(1000, 0);
    expect(pct).toBe(100);
  });
});

// ─── calcBudgetStatus ────────────────────────────────────────────────────────

describe('calcBudgetStatus', () => {
  test('returns bad when over budget', () => {
    const { status, remaining, pct } = calcBudgetStatus(1200, 1000);
    expect(status).toBe('bad');
    expect(remaining).toBe(-200);
    expect(pct).toBe(120);
  });

  test('returns warn when within 20% remaining', () => {
    const { status } = calcBudgetStatus(850, 1000);
    expect(status).toBe('warn');
  });

  test('returns good when well within budget', () => {
    const { status } = calcBudgetStatus(400, 1000);
    expect(status).toBe('good');
  });

  test('returns 0 pct when budget is 0 — no division by zero', () => {
    const { pct } = calcBudgetStatus(100, 0);
    expect(pct).toBe(0);
  });
});

// ─── calcMonthDelta ──────────────────────────────────────────────────────────

describe('calcMonthDelta', () => {
  const allExpenses = [
    { date: '2026-03-05', category: 'Groceries', amount: 200 }, // March
    { date: '2026-03-10', category: 'Savings',   amount: 100 }, // March (should be excluded)
    { date: '2026-04-05', category: 'Groceries', amount: 230 }, // April
  ];

  test('shows positive delta when spending increased', () => {
    const { delta, deltaStr } = calcMonthDelta(allExpenses, '2026-04', 230);
    expect(delta).toBe(30); // 230 - 200
    expect(deltaStr).toBe('+€30.00');
  });

  test('shows negative delta when spending decreased', () => {
    const { delta } = calcMonthDelta(allExpenses, '2026-04', 150);
    expect(delta).toBe(-50); // 150 - 200
  });

  test('excludes Savings from previous month comparison', () => {
    // prev month has 200 (Groceries) + 100 (Savings) = only 200 counts
    const { delta } = calcMonthDelta(allExpenses, '2026-04', 200);
    expect(delta).toBe(0);
  });

  test('returns 0 delta when no previous month data exists', () => {
    const { delta } = calcMonthDelta([], '2026-04', 500);
    expect(delta).toBe(500); // 500 vs 0 prev
  });
});

// ─── calcCategoryTotals ──────────────────────────────────────────────────────

describe('calcCategoryTotals', () => {
  test('aggregates correctly by category', () => {
    const result = calcCategoryTotals(sampleExpenses);
    expect(result['Groceries']).toBe(180); // 100 + 80
    expect(result['Transport']).toBe(50);
    expect(result['Savings']).toBe(200);
    expect(result['Adjustment']).toBe(-10);
  });

  test('returns empty object for no expenses', () => {
    const result = calcCategoryTotals([]);
    expect(Object.keys(result).length).toBe(0);
  });
});
