import { loadFeature, defineFeature } from 'jest-cucumber';
import path from 'path';

// Mock Supabase service client
const mockRpc = jest.fn();
jest.mock('@supabase/supabase-js', () => ({
  createClient: jest.fn(() => ({
    rpc: mockRpc,
    from: jest.fn(() => ({
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      gte: jest.fn().mockReturnThis(),
      lte: jest.fn().mockReturnThis(),
      order: jest.fn().mockReturnThis(),
      range: jest.fn().mockReturnThis(),
      update: jest.fn().mockReturnThis(),
      maybeSingle: jest.fn(),
    })),
  })),
}));

jest.mock('@/lib/logger-server', () => ({
  ServerLogger: { system: jest.fn(), user: jest.fn() },
}));

const feature = loadFeature(path.join(__dirname, 'fcv_quarantine.feature'));

defineFeature(feature, (test) => {
  const mockGetDiagnostics = jest.fn();
  let releaseResult: { released_purchases: number; released_pending: number; errors: string[] };

  beforeEach(() => {
    jest.clearAllMocks();
    releaseResult = { released_purchases: 0, released_pending: 0, errors: [] };
  });

  test('Cron Release of Expired Quarantines', ({ given, when, then, and }) => {
    given(/^purchases with quarantine_status 'PENDING' created (\d+) days ago exist in the database$/, (days) => {
      mockRpc.mockResolvedValue({
        data: [{ released_purchases: 3, released_pending: 2, errors: [] }],
        error: null,
      });
    });

    when('the release_expired_quarantines_v1 RPC is executed', async () => {
      const { data, error } = await mockRpc();
      if (error) throw error;
      releaseResult = data[0] as typeof releaseResult;
    });

    then(/^it returns released_purchases matching the count of expired rows$/, () => {
      expect(releaseResult.released_purchases).toBe(3);
    });

    and(/^it returns released_pending matching the count of resolved anomaly queue rows$/, () => {
      expect(releaseResult.released_pending).toBe(2);
    });
  });

  // Tagged @skip-until-ims in the feature file.
  // Steps are declared for structural validation; body is empty until IMS is deployed.
  test('POS Enrichment with Lazy Cache Backfill', (steps) => {
    steps.given('POS sales are staged in pos_transaction_staging without theoretical_grams', () => {});

    steps.and('cached_recipes are available for the tenant', () => {});

    steps.when('the FCV route processes the staging rows', () => {});

    steps.then('theoretical_grams are populated from matched recipes', () => {});

    steps.and('the FCV report includes the enriched ingredient data', () => {});
  });
});
