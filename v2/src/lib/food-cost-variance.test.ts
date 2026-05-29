import { computeFCVReport, type FCVPurchaseRow, type FCVPOSRow, type FCVReport } from './food-cost-variance';

function purchase(overrides: Partial<FCVPurchaseRow> = {}): FCVPurchaseRow {
  return {
    ingredient_id: 'ing-chicken',
    ingredient_name: 'Chicken Breast',
    total_amount: 1000,
    purchase_date: '2026-05-15',
    location_id: null,
    ...overrides,
  };
}

function posRow(overrides: Partial<FCVPOSRow> = {}): FCVPOSRow {
  return {
    ingredient_id: 'ing-chicken',
    ingredient_name: 'Chicken Breast',
    grams: 5000,
    cost: 42.50,
    transaction_time: '2026-05-15T12:00:00Z',
    revenue: 200,
    location_id: null,
    ...overrides,
  };
}

function period(overrides: Partial<{ start: string; end: string }> = {}): { start: string; end: string } {
  return { start: '2026-05-01', end: '2026-05-31', ...overrides };
}

describe('computeFCVReport', () => {

  it('returns zero gap for empty data', () => {
    const result = computeFCVReport({ purchases: [], posStaging: [], period: period() });
    expect(result.headline.totalRevenue).toBe(0);
    expect(result.headline.actualSpend).toBe(0);
    expect(result.headline.theoreticalCOGS).toBe(0);
    expect(result.headline.gap).toBe(0);
    expect(result.dataCoverage.pctCovered).toBe(0);
    expect(result.direction).toBe('NEUTRAL');
  });

  it('returns gap near zero when purchases match theoretical cost', () => {
    const purchases = [
      purchase({ total_amount: 500, purchase_date: '2026-05-10' }),
    ];
    const pos = [
      posRow({ grams: 5000, cost: 42.50 }),  // theoretical = 42.50
      posRow({ grams: 3000, cost: 25.50 }),  // theoretical = 25.50
    ];
    // Add a purchase of 500 that goes through purchases table
    // and add more POS to make up the theoretical
    const purchases2 = [
      purchase({ total_amount: 68, ingredient_id: 'ing-chicken', purchase_date: '2026-05-10' }),
    ];
    const pos2 = [
      posRow({ grams: 5000, cost: 42.50, ingredient_id: 'ing-chicken' }),
      posRow({ grams: 3000, cost: 25.50, ingredient_id: 'ing-chicken' }),
    ];
    const result = computeFCVReport({
      purchases: purchases2,
      posStaging: pos2,
      period: period(),
    });
    expect(result.headline.actualSpend).toBe(68);
    expect(result.headline.theoreticalCOGS).toBe(68);
    expect(result.headline.gap).toBe(0);
  });

  it('detects overspend when purchases exceed theoretical', () => {
    const result = computeFCVReport({
      purchases: [
        purchase({ total_amount: 200, purchase_date: '2026-05-10' }),
        purchase({ total_amount: 300, purchase_date: '2026-05-20' }),
      ],
      posStaging: [
        posRow({ grams: 10000, cost: 85 }),  // theoretical = 85
        posRow({ grams: 5000, cost: 42.50 }), // theoretical = 42.50
      ],
      period: period(),
    });
    // actual = 500, theoretical = 127.50, gap = 372.50
    expect(result.headline.actualSpend).toBe(500);
    expect(result.headline.theoreticalCOGS).toBeCloseTo(127.50, 1);
    expect(result.headline.gap).toBeGreaterThan(0);
    expect(result.direction).toBe('BLEEDING');
  });

  it('detects profitable variance when theoretical exceeds purchases', () => {
    const result = computeFCVReport({
      purchases: [
        purchase({ total_amount: 100, purchase_date: '2026-05-10' }),
      ],
      posStaging: [
        posRow({ grams: 15000, cost: 127.50 }), // theoretical = 127.50
      ],
      period: period(),
    });
    expect(result.headline.actualSpend).toBe(100);
    expect(result.headline.theoreticalCOGS).toBeCloseTo(127.50, 1);
    expect(result.headline.gap).toBeLessThan(0);
    expect(result.direction).toBe('PROFITABLE');
  });

  it('excludes purchases outside the period', () => {
    const result = computeFCVReport({
      purchases: [
        purchase({ purchase_date: '2026-04-30' }), // before period
        purchase({ purchase_date: '2026-06-01' }), // after period
      ],
      posStaging: [],
      period: period(),
    });
    expect(result.headline.actualSpend).toBe(0);
    expect(result.headline.totalRevenue).toBe(0);
  });

  it('excludes POS data outside the period', () => {
    const result = computeFCVReport({
      purchases: [],
      posStaging: [
        posRow({ transaction_time: '2026-04-30T12:00:00Z' }),
        posRow({ transaction_time: '2026-06-01T12:00:00Z' }),
        posRow({ transaction_time: '2026-05-15T12:00:00Z', grams: 5000, cost: 42.50 }),
      ],
      period: period(),
    });
    expect(result.headline.theoreticalCOGS).toBeCloseTo(42.50, 1);
  });

  it('breaks down gap by ingredient', () => {
    const result = computeFCVReport({
      purchases: [
        purchase({ ingredient_id: 'ing-chicken', ingredient_name: 'Chicken Breast', total_amount: 300, purchase_date: '2026-05-10' }),
        purchase({ ingredient_id: 'ing-flour', ingredient_name: 'Flour', total_amount: 50, purchase_date: '2026-05-10' }),
      ],
      posStaging: [
        posRow({ ingredient_id: 'ing-chicken', ingredient_name: 'Chicken Breast', grams: 10000, cost: 85 }),
        posRow({ ingredient_id: 'ing-flour', ingredient_name: 'Flour', grams: 2500, cost: 3 }),
      ],
      period: period(),
    });
    expect(result.byIngredient).toHaveLength(2);
    const chicken = result.byIngredient.find(i => i.ingredient === 'Chicken Breast');
    const flour = result.byIngredient.find(i => i.ingredient === 'Flour');
    expect(chicken).toBeDefined();
    expect(flour).toBeDefined();
    expect(chicken.actualCost).toBe(300);
    expect(chicken.theoreticalCost).toBe(85);
    expect(chicken.gap).toBe(215);
  });

  it('computes data coverage from POS days', () => {
    const result = computeFCVReport({
      purchases: [],
      posStaging: [
        posRow({ transaction_time: '2026-05-01T12:00:00Z' }),
        posRow({ transaction_time: '2026-05-01T18:00:00Z' }), // same day
        posRow({ transaction_time: '2026-05-03T12:00:00Z' }),
        posRow({ transaction_time: '2026-05-05T12:00:00Z' }),
        posRow({ transaction_time: '2026-05-10T12:00:00Z' }),
      ],
      period: period(),
    });
    // 31 days in period, 4 unique days with data (May 1, 3, 5, 10)
    expect(result.dataCoverage.daysWithPOSData).toBe(4);
    expect(result.dataCoverage.daysInPeriod).toBe(31);
    expect(result.dataCoverage.pctCovered).toBeCloseTo(12.9, 0);
    expect(result.dataCoverage.warning).not.toBeNull();
  });

  it('returns full coverage warning when no gaps exist', () => {
    const posRows: FCVPOSRow[] = [];
    for (let d = 1; d <= 31; d++) {
      posRows.push(posRow({ transaction_time: `2026-05-${String(d).padStart(2, '0')}T12:00:00Z` }));
    }
    const result = computeFCVReport({ purchases: [], posStaging: posRows, period: period() });
    expect(result.dataCoverage.daysWithPOSData).toBe(31);
    expect(result.dataCoverage.pctCovered).toBe(100);
    expect(result.dataCoverage.warning).toBeNull();
  });

  it('sets direction to NEUTRAL when gap is within 5% of revenue', () => {
    const result = computeFCVReport({
      purchases: [
        purchase({ total_amount: 105, purchase_date: '2026-05-10' }),
      ],
      posStaging: [
        posRow({ revenue: 2000, grams: 10000, cost: 100 }),
      ],
      period: period(),
    });
    // actual = 105, theoretical = 100, gap = 5, revenue = 2000
    expect(result.direction).toBe('NEUTRAL');
  });

  describe('weekly trend', () => {
    it('groups data by ISO week', () => {
      const result = computeFCVReport({
        purchases: [
          purchase({ purchase_date: '2026-05-04', total_amount: 100 }), // Week 19
          purchase({ purchase_date: '2026-05-11', total_amount: 200 }), // Week 20
        ],
        posStaging: [
          posRow({ transaction_time: '2026-05-04T12:00:00Z', grams: 5000, cost: 50, revenue: 500 }),  // W19
          posRow({ transaction_time: '2026-05-11T12:00:00Z', grams: 10000, cost: 100, revenue: 1000 }), // W20
        ],
        period: period(),
      });
      expect(result.weeklyTrend).toHaveLength(2);
      if (result.weeklyTrend.length >= 2) {
        expect(result.weeklyTrend[0].week).toMatch(/2026-W19/);
        expect(result.weeklyTrend[0].actualSpend).toBe(100);
        expect(result.weeklyTrend[1].week).toMatch(/2026-W20/);
      }
    });

    it('handles weeks with no data', () => {
      const result = computeFCVReport({
        purchases: [
          purchase({ purchase_date: '2026-05-01', total_amount: 50 }), // Week 18
        ],
        posStaging: [],
        period: period(),
      });
      // May 1 is in Week 18 (in 2026)
      expect(result.weeklyTrend.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('edge cases', () => {
    it('returns gap=0 for POS items with no recipe resolution', () => {
      const result = computeFCVReport({
        purchases: [
          purchase({ total_amount: 200, purchase_date: '2026-05-10' }),
        ],
        posStaging: [
          posRow({ grams: 0, cost: 0 }), // unresolved recipe
        ],
        period: period(),
      });
      // theoretical should not include the unresolved item
      expect(result.headline.theoreticalCOGS).toBe(0);
    });

    it('calculates totalRevenue from POS staging revenue', () => {
      const result = computeFCVReport({
        purchases: [],
        posStaging: [
          posRow({ revenue: 500 }),
          posRow({ revenue: 300 }),
        ],
        period: period(),
      });
      expect(result.headline.totalRevenue).toBe(800);
    });

    it('handles large ingredient gap for share calculation', () => {
      const result = computeFCVReport({
        purchases: [
          purchase({ ingredient_id: 'ing-a', ingredient_name: 'A', total_amount: 1000, purchase_date: '2026-05-10' }),
          purchase({ ingredient_id: 'ing-b', ingredient_name: 'B', total_amount: 500, purchase_date: '2026-05-10' }),
          purchase({ ingredient_id: 'ing-c', ingredient_name: 'C', total_amount: 200, purchase_date: '2026-05-10' }),
        ],
        posStaging: [
          posRow({ ingredient_id: 'ing-a', ingredient_name: 'A', grams: 1000, cost: 20 }),
          posRow({ ingredient_id: 'ing-b', ingredient_name: 'B', grams: 2000, cost: 40 }),
          posRow({ ingredient_id: 'ing-c', ingredient_name: 'C', grams: 5000, cost: 100 }),
        ],
        period: period(),
      });
      // total actual = 1700, total theoretical = 160
      // total gap = 1540
      const a = result.byIngredient.find(i => i.ingredient === 'A');
      expect(a).toBeDefined();
      expect(a.shareOfTotalGap).toBeCloseTo(980 / 1540, 2);
    });

    it('sorts topIngredients by gap descending', () => {
      const result = computeFCVReport({
        purchases: [
          purchase({ ingredient_id: 'ing-a', ingredient_name: 'A', total_amount: 500, purchase_date: '2026-05-10' }),
          purchase({ ingredient_id: 'ing-b', ingredient_name: 'B', total_amount: 1000, purchase_date: '2026-05-10' }),
        ],
        posStaging: [
          posRow({ ingredient_id: 'ing-a', ingredient_name: 'A', grams: 5000, cost: 50 }),
          posRow({ ingredient_id: 'ing-b', ingredient_name: 'B', grams: 5000, cost: 50 }),
        ],
        period: period(),
      });
      expect(result.byIngredient[0].ingredient).toBe('B');
      expect(result.byIngredient[1].ingredient).toBe('A');
    });
  });

  describe('variance spikes', () => {
    it('flags dates where actual exceeds theoretical by >30%', () => {
      const result = computeFCVReport({
        purchases: [
          purchase({ purchase_date: '2026-05-10', total_amount: 200 }),
        ],
        posStaging: [
          posRow({ transaction_time: '2026-05-10T12:00:00Z', grams: 5000, cost: 50, revenue: 500 }),
        ],
        period: period(),
      });
      // actual = 200, theoretical = 50, gap = 150, ratio = 200/50 = 4x -> HIGH_VARIANCE
      const spike = result.varianceSpikes.find(s => s.date === '2026-05-10');
      expect(spike).toBeDefined();
      expect(spike.flag).toBe('HIGH_VARIANCE');
    });

    it('flags dates with negative variance when actual < 70% theoretical', () => {
      const result = computeFCVReport({
        purchases: [
          purchase({ purchase_date: '2026-05-10', total_amount: 20 }),
        ],
        posStaging: [
          posRow({ transaction_time: '2026-05-10T12:00:00Z', grams: 10000, cost: 100, revenue: 500 }),
        ],
        period: period(),
      });
      // actual = 20, theoretical = 100, actual/theoretical = 0.2 -> NEGATIVE_VARIANCE
      const spike = result.varianceSpikes.find(s => s.date === '2026-05-10');
      expect(spike).toBeDefined();
      expect(spike.flag).toBe('NEGATIVE_VARIANCE');
    });

    it('marks dates as NORMAL when gap is within bounds', () => {
      const result = computeFCVReport({
        purchases: [
          purchase({ purchase_date: '2026-05-10', total_amount: 55 }),
        ],
        posStaging: [
          posRow({ transaction_time: '2026-05-10T12:00:00Z', grams: 5000, cost: 50, revenue: 500 }),
        ],
        period: period(),
      });
      // actual = 55, theoretical = 50, ratio = 1.1 -> between 0.7 and 1.3 -> NORMAL
      const spike = result.varianceSpikes.find(s => s.date === '2026-05-10');
      expect(spike).toBeDefined();
      expect(spike.flag).toBe('NORMAL');
    });
  });
});
