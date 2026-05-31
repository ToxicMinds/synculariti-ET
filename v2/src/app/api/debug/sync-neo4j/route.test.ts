import { GET } from './route';

const mockServerLoggerSystem = jest.fn();

jest.mock('@/lib/logger-server', () => ({
  ServerLogger: { system: (...args: any[]) => mockServerLoggerSystem(...args) },
}));

jest.mock('@/lib/withTestHandler', () => ({
  withTestHandler: (handler: any) => handler,
}));

const mockDriver = {
  session: jest.fn().mockReturnValue({
    close: jest.fn().mockResolvedValue(undefined),
    run: jest.fn().mockResolvedValue({ records: [] }),
  }),
  close: jest.fn().mockResolvedValue(undefined),
};

const mockGetNeo4jDriver = jest.fn();
const mockProcessOutboxSync = jest.fn();
const mockNeo4jDeleteTransaction = jest.fn();

jest.mock('@/lib/neo4j', () => ({
  getNeo4jDriver: () => mockGetNeo4jDriver(),
  processOutboxSync: (...args: any[]) => mockProcessOutboxSync(...args),
  neo4jDeleteTransaction: (...args: any[]) => mockNeo4jDeleteTransaction(...args),
}));

const mockBuildSyncPayload = jest.fn();
jest.mock('@/lib/neo4j-ontology', () => ({
  buildSyncPayload: (...args: any[]) => mockBuildSyncPayload(...args),
}));

describe('GET /api/debug/sync-neo4j', () => {
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
    mockProcessOutboxSync.mockResolvedValue(5);
  });

  const mockContext = {
    auth: { tenantId: 'tenant-1', user: { email: 'admin@test.com', app_metadata: {} } },
  };

  it('returns 401 when session is missing', async () => {
    const req = new Request('http://localhost/api/debug/sync-neo4j');
    const context = { auth: null };
    const res = await (GET as any)(req, context);
    const body = await res.json();
    expect(res.status).toBe(401);
    expect(body.error).toContain('Session missing');
  });

  it('returns 500 when Neo4j driver is not initialized', async () => {
    mockGetNeo4jDriver.mockReturnValue(null);

    const req = new Request('http://localhost/api/debug/sync-neo4j');
    const res = await GET(req, mockContext);
    const body = await res.json();
    expect(res.status).toBe(500);
    expect(body.error).toContain('Neo4j driver not initialized');
  });

  it('returns success with empty message when no pending events', async () => {
    const mockRpc = jest.fn();
    const mockSupabase = {
      from: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      order: jest.fn().mockReturnThis(),
      limit: jest.fn().mockResolvedValue({ data: [], error: null }),
      rpc: mockRpc,
      single: jest.fn(),
    };

    jest.mock('@/lib/supabase-server', () => ({
      createClient: jest.fn().mockResolvedValue(mockSupabase),
    }));

    jest.resetModules();
    const freshRoute = await import('./route');
    const req = new Request('http://localhost/api/debug/sync-neo4j');
    const res = await freshRoute.GET(req, mockContext);
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.message).toContain('No pending events');
  });
});
