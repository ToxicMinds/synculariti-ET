import { GET } from './route';

const mockServerLoggerSystem = jest.fn();

jest.mock('@/lib/logger-server', () => ({
  ServerLogger: { system: (...args: any[]) => mockServerLoggerSystem(...args) },
}));

jest.mock('@/lib/withTestHandler', () => ({
  withTestHandler: (handler: any) => handler,
}));

const mockCreateClient = jest.fn();
jest.mock('@/lib/supabase-server', () => ({
  createClient: (...args: any[]) => mockCreateClient(...args),
}));

const mockDriver = {
  session: jest.fn().mockReturnValue({
    close: jest.fn().mockResolvedValue(undefined),
    run: jest.fn().mockResolvedValue({ records: [] }),
    executeWrite: jest.fn().mockResolvedValue(undefined),
  }),
  close: jest.fn().mockResolvedValue(undefined),
};

const mockGetNeo4jDriver = jest.fn();
jest.mock('@/lib/neo4j', () => ({
  getNeo4jDriver: () => mockGetNeo4jDriver(),
  processOutboxSync: jest.fn().mockResolvedValue(42),
}));

const mockBuildSyncPayload = jest.fn();
jest.mock('@/lib/neo4j-ontology', () => ({
  buildSyncPayload: (...args: any[]) => mockBuildSyncPayload(...args),
}));

describe('GET /api/debug/backfill-neo4j', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetNeo4jDriver.mockReturnValue(mockDriver);
    mockBuildSyncPayload.mockImplementation((tx: any) => ({
      txId: tx.id,
      tenantId: tx.tenant_id,
      amount: tx.amount,
      vendorName: tx.description,
      items: [],
    }));
  });

  const mockContext = {
    auth: { tenantId: 'tenant-1', user: { email: 'admin@test.com', app_metadata: {} } },
  };

  it('returns 401 when session is missing', async () => {
    const req = new Request('http://localhost/api/debug/backfill-neo4j');
    const context = { auth: null };
    const res = await (GET as any)(req, context);
    const body = await res.json();
    expect(res.status).toBe(401);
    expect(body.error).toContain('Session missing');
  });

  it('returns 500 when Neo4j driver is not initialized', async () => {
    mockGetNeo4jDriver.mockReturnValue(null);

    const req = new Request('http://localhost/api/debug/backfill-neo4j');
    const res = await GET(req, mockContext);
    const body = await res.json();
    expect(res.status).toBe(500);
    expect(body.error).toContain('Neo4j driver not initialized');
  });

  it('returns success with no-transactions message when empty', async () => {
    mockCreateClient.mockResolvedValue({
      from: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      order: jest.fn().mockResolvedValue({ data: [], error: null }),
    });

    const req = new Request('http://localhost/api/debug/backfill-neo4j');
    const res = await GET(req, mockContext);
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.message).toContain('No transactions found');
  });

  it('returns 500 when Neo4j merge fails', async () => {
    mockCreateClient.mockResolvedValue({
      from: jest.fn().mockImplementation((table: string) => ({
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        order: jest.fn().mockResolvedValue(
          table === 'transactions'
            ? { data: [{ id: 'tx-1', tenant_id: 'tenant-1', amount: 100, description: 'Metro' }], error: null }
            : { data: [{ id: 'item-1', transaction_id: 'tx-1', name: 'Mlieko', amount: 1.50, category: 'Food', currency: 'EUR' }], error: null }
        ),
      })),
    });

    const neo4jMock = jest.requireMock('@/lib/neo4j');
    neo4jMock.processOutboxSync.mockRejectedValue(new Error('Neo4j merge failed'));

    const req = new Request('http://localhost/api/debug/backfill-neo4j');
    const res = await GET(req, mockContext);
    const body = await res.json();
    expect(res.status).toBe(500);
    expect(body.error).toContain('Neo4j');
  });
});
