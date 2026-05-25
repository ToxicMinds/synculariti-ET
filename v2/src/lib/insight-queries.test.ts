import { Session } from 'neo4j-driver';
import { queryPriceIntelligence, queryTimingPatterns, queryWasteRisk, InsightFinding } from './insight-queries';

jest.mock('./logger', () => ({
  Logger: { system: jest.fn(), user: jest.fn() },
}));

function mockRecord(getMap: Record<string, unknown>): { get: (k: string) => unknown } {
  return { get: (k: string) => getMap[k] };
}

function mockSession(runResult: ReturnType<typeof mockRecord>[]): Session {
  return {
    run: jest.fn().mockResolvedValue({ records: runResult }),
    close: jest.fn(),
    executeWrite: jest.fn(),
    _beginTransaction: jest.fn(),
    beginTransaction: jest.fn(),
    lastBookmark: jest.fn(),
    readTransaction: jest.fn(),
    writeTransaction: jest.fn(),
  } as unknown as Session;
}

function mockSessionError(): Session {
  return {
    run: jest.fn().mockRejectedValue(new Error('Neo4j connection failed')),
    close: jest.fn(),
    executeWrite: jest.fn(),
    _beginTransaction: jest.fn(),
    beginTransaction: jest.fn(),
    lastBookmark: jest.fn(),
    readTransaction: jest.fn(),
    writeTransaction: jest.fn(),
  } as unknown as Session;
}

const tenantId = 'test-tenant-123';

describe('queryPriceIntelligence', () => {
  it('returns a price finding when merchants have different prices for the same ingredient', async () => {
    const records = [
      mockRecord({
        ingredient: 'Milk 1L',
        merchants: [
          { merchant: 'Metro', avgPrice: { low: 1.2 }, purchases: { low: 10 } },
          { merchant: 'Billa', avgPrice: { low: 1.5 }, purchases: { low: 8 } },
          { merchant: 'Lidl', avgPrice: { low: 1.1 }, purchases: { low: 12 } },
        ],
      }),
    ];
    const session = mockSession(records);
    const result = await queryPriceIntelligence(session, tenantId);

    expect(result).not.toBeNull();
    expect(result!.type).toBe('price');
    expect(result!.impact).toBeGreaterThan(0);
    expect(result!.summary).toContain('Milk 1L');
    expect(result!.summary).toContain('more');
    expect(session.run).toHaveBeenCalledWith(
      expect.stringContaining('MATCH (ing:Ingredient)'),
      { tid: tenantId }
    );
  });

  it('returns null when no records found', async () => {
    const session = mockSession([]);
    const result = await queryPriceIntelligence(session, tenantId);
    expect(result).toBeNull();
  });

  it('returns null when fewer than 2 merchants for an ingredient', async () => {
    const records = [
      mockRecord({
        ingredient: 'Milk 1L',
        merchants: [
          { merchant: 'Metro', avgPrice: { low: 1.2 }, purchases: { low: 10 } },
        ],
      }),
    ];
    const session = mockSession(records);
    const result = await queryPriceIntelligence(session, tenantId);
    expect(result).toBeNull();
  });

  it('returns null when price difference is below 5% threshold', async () => {
    const records = [
      mockRecord({
        ingredient: 'Salt',
        merchants: [
          { merchant: 'Metro', avgPrice: { low: 0.5 }, purchases: { low: 5 } },
          { merchant: 'Billa', avgPrice: { low: 0.51 }, purchases: { low: 3 } },
        ],
      }),
    ];
    const session = mockSession(records);
    const result = await queryPriceIntelligence(session, tenantId);
    expect(result).toBeNull();
  });

  it('handles Neo4j integer objects for numeric fields', async () => {
    const records = [
      mockRecord({
        ingredient: 'Butter 250g',
        merchants: [
          { merchant: 'Metro', avgPrice: { low: 1.8 }, purchases: { low: 5 } },
          { merchant: 'Lidl', avgPrice: { low: 2.5 }, purchases: { low: 3 } },
        ],
      }),
    ];
    const session = mockSession(records);
    const result = await queryPriceIntelligence(session, tenantId);
    expect(result).not.toBeNull();
    expect(result!.impact).toBeGreaterThan(0);
  });

  it('handles plain number values (not Neo4j Integer objects)', async () => {
    const records = [
      mockRecord({
        ingredient: 'Eggs 10pcs',
        merchants: [
          { merchant: 'Metro', avgPrice: 2.0, purchases: 10 },
          { merchant: 'Billa', avgPrice: 3.0, purchases: 5 },
        ],
      }),
    ];
    const session = mockSession(records);
    const result = await queryPriceIntelligence(session, tenantId);
    expect(result).not.toBeNull();
    expect(result!.impact).toBeGreaterThan(0);
  });

  it('throws when Neo4j is unreachable', async () => {
    const session = mockSessionError();
    await expect(queryPriceIntelligence(session, tenantId)).rejects.toThrow('Neo4j connection failed');
  });
});

describe('queryTimingPatterns', () => {
  it('returns timing finding when day-of-week variance exists', async () => {
    const records = [
      mockRecord({ dow: 5, weekend: false, avgSpend: 450, count: 8, total: 3600 }),
      mockRecord({ dow: 1, weekend: false, avgSpend: 320, count: 12, total: 3840 }),
      mockRecord({ dow: 3, weekend: false, avgSpend: 380, count: 10, total: 3800 }),
      mockRecord({ dow: 6, weekend: true, avgSpend: 520, count: 4, total: 2080 }),
    ];
    const session = mockSession(records);
    const result = await queryTimingPatterns(session, tenantId);

    expect(result).not.toBeNull();
    expect(result!.type).toBe('timing');
    expect(result!.impact).toBeGreaterThan(0);
    expect(session.run).toHaveBeenCalledWith(
      expect.stringContaining('MATCH (t:Transaction {tenant_id: $tid})'),
      { tid: tenantId }
    );
  });

  it('returns null when fewer than 2 day records', async () => {
    const records = [
      mockRecord({ dow: 1, weekend: false, avgSpend: 300, count: 5, total: 1500 }),
    ];
    const session = mockSession(records);
    const result = await queryTimingPatterns(session, tenantId);
    expect(result).toBeNull();
  });

  it('returns null when variance is below 10% threshold', async () => {
    const records = [
      mockRecord({ dow: 1, weekend: false, avgSpend: 100, count: 5, total: 500 }),
      mockRecord({ dow: 2, weekend: false, avgSpend: 103, count: 4, total: 412 }),
      mockRecord({ dow: 3, weekend: false, avgSpend: 101, count: 6, total: 606 }),
      mockRecord({ dow: 4, weekend: false, avgSpend: 102, count: 5, total: 510 }),
    ];
    const session = mockSession(records);
    const result = await queryTimingPatterns(session, tenantId);
    expect(result).toBeNull();
  });

  it('returns weekend vs weekday finding when significant pattern', async () => {
    const records = [
      mockRecord({ dow: 6, weekend: true, avgSpend: 800, count: 5, total: 4000 }),
      mockRecord({ dow: 0, weekend: true, avgSpend: 750, count: 3, total: 2250 }),
      mockRecord({ dow: 1, weekend: false, avgSpend: 300, count: 10, total: 3000 }),
      mockRecord({ dow: 2, weekend: false, avgSpend: 280, count: 8, total: 2240 }),
      mockRecord({ dow: 3, weekend: false, avgSpend: 310, count: 9, total: 2790 }),
    ];
    const session = mockSession(records);
    const result = await queryTimingPatterns(session, tenantId);

    expect(result).not.toBeNull();
    expect(result!.type).toBe('timing');
    expect(result!.summary).toContain('higher');
  });
});

describe('queryWasteRisk', () => {
  it('returns a waste finding for high-risk perishable ingredients', async () => {
    const records = [
      mockRecord({
        ingredient: 'Fresh Milk',
        shelfLife: { low: 5 },
        purchased: '2026-05-22',
        dow: 5,
        qty: { low: 10 },
        price: { low: 1.5 },
        isWeekend: false,
        beforeHoliday: true,
        holidayName: 'Some holiday',
        daysToNext: { low: 1 },
      }),
    ];
    const session = mockSession(records);
    const result = await queryWasteRisk(session, tenantId);

    expect(result).not.toBeNull();
    expect(result!.type).toBe('waste');
    expect(result!.impact).toBeGreaterThanOrEqual(30);
    expect(result!.summary).toContain('Fresh Milk');
    expect(session.run).toHaveBeenCalledWith(
      expect.stringContaining('MATCH (t:Transaction {tenant_id: $tid})-[c:CONTAINS]'),
      { tid: tenantId }
    );
  });

  it('returns null when no perishable items found', async () => {
    const session = mockSession([]);
    const result = await queryWasteRisk(session, tenantId);
    expect(result).toBeNull();
  });

  it('returns null when risk score is below 30 threshold', async () => {
    const records = [
      mockRecord({
        ingredient: 'Pasta',
        shelfLife: { low: 10 },
        purchased: '2026-05-18',
        dow: 1,
        qty: { low: 5 },
        price: { low: 2.0 },
        isWeekend: false,
        beforeHoliday: false,
        holidayName: null,
        daysToNext: { low: 10 },
      }),
    ];
    const session = mockSession(records);
    const result = await queryWasteRisk(session, tenantId);
    expect(result).toBeNull();
  });

  it('handles weekend purchase risk factor', async () => {
    const records = [
      mockRecord({
        ingredient: 'Fish Fillets',
        shelfLife: { low: 2 },
        purchased: '2026-05-23',
        dow: 6,
        qty: { low: 3 },
        price: { low: 8.0 },
        isWeekend: true,
        beforeHoliday: false,
        holidayName: null,
        daysToNext: { low: 7 },
      }),
    ];
    const session = mockSession(records);
    const result = await queryWasteRisk(session, tenantId);

    expect(result).not.toBeNull();
    expect(result!.summary).toContain('Fish Fillets');
    expect(result!.summary).toContain('Saturday');
  });
});
