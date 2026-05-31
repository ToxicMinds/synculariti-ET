import { GET } from './route';

// Build a thenable chain that simulates Supabase Query Builder
function createChain(data: unknown[]) {
  const chain: Record<string, any> = {};
  const self = () => chain;
  chain.select = self;
  chain.eq = self;
  chain.gte = self;
  chain.lte = self;
  chain.order = self;
  chain.range = self;
  chain.then = (onfulfilled: Function, onrejected: Function) =>
    Promise.resolve({ data, error: null }).then(onfulfilled, onrejected);
  chain.catch = (onrejected: Function) =>
    Promise.resolve({ data, error: null }).catch(onrejected);
  return chain;
}

jest.mock('@/lib/supabase-server', () => ({
  createClient: jest.fn(() => ({
    from: jest.fn((_table: string) => createChain([])),
  })),
}));

jest.mock('@/lib/food-cost-variance', () => ({
  computeFCVReport: jest.fn(),
}));

import { computeFCVReport } from '@/lib/food-cost-variance';
const mockComputeFCVReport = computeFCVReport as jest.Mock;

jest.mock('@/lib/logger-server', () => ({
  ServerLogger: { system: jest.fn(), user: jest.fn() },
}));

describe('Food Cost Variance API', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockComputeFCVReport.mockReset();
  });

  it('returns report for current month period', async () => {
    const mockReport = {
      period: { start: '2026-05-01', end: '2026-05-31' },
      headline: {
        totalRevenue: 10000,
        theoreticalCOGS: 3500,
        actualSpend: 4200,
        gap: 700,
        gapPct: 0.07,
        direction: 'BLEEDING',
      },
      topIngredients: [],
      weeklyTrend: [],
      varianceSpikes: [],
    };

    mockComputeFCVReport.mockReturnValue(mockReport);

    const response = await GET(
      new Request('http://localhost/api/analytics/food-cost-variance'),
      {} as any,
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.report.headline.direction).toBe('BLEEDING');
  });

  it('accepts start and end query params', async () => {
    mockComputeFCVReport.mockReturnValue({
      period: { start: '2026-01-01', end: '2026-03-31' },
      headline: {
        totalRevenue: 0, theoreticalCOGS: 0, actualSpend: 0,
        gap: 0, gapPct: 0, direction: 'NEUTRAL',
      },
      topIngredients: [], weeklyTrend: [], varianceSpikes: [],
    });

    const response = await GET(
      new Request('http://localhost/api/analytics/food-cost-variance?start=2026-01-01&end=2026-03-31'),
      {} as any,
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
  });

  it('returns 500 when computeFCVReport throws', async () => {
    mockComputeFCVReport.mockImplementation(() => {
      throw new Error('Neo4j unavailable');
    });

    const response = await GET(
      new Request('http://localhost/api/analytics/food-cost-variance'),
      {} as any,
    );
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.success).toBe(false);
  });
});
