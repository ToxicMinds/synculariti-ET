import { POST } from './route';
import { NextRequest } from 'next/server';

const mockCreateServiceClient = jest.fn();
const mockServerLoggerSystem = jest.fn();

jest.mock('@/lib/supabase-server', () => ({
  createServiceClient: () => mockCreateServiceClient(),
}));

jest.mock('@/lib/logger-server', () => ({
  ServerLogger: { system: (...args: any[]) => mockServerLoggerSystem(...args) },
}));

describe('POST /api/auth/pin', () => {
  const OLD_SYNC_KEY = process.env.SYNC_SECRET_KEY;
  const OLD_PIN_SECRET = process.env.PIN_DERIVATION_SECRET;

  beforeAll(() => {
    process.env.SYNC_SECRET_KEY = 'test-sync-secret';
    process.env.PIN_DERIVATION_SECRET = 'test-pin-secret-32-chars-minimum!!';
  });

  afterAll(() => {
    process.env.SYNC_SECRET_KEY = OLD_SYNC_KEY;
    process.env.PIN_DERIVATION_SECRET = OLD_PIN_SECRET;
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  const mockRpc = (rpcName: string, result: unknown) => {
    mockCreateServiceClient.mockReturnValue({
      rpc: jest.fn().mockImplementation((name: string) => {
        if (name === rpcName) return Promise.resolve({ data: result, error: null });
        return Promise.resolve({ data: null, error: { message: `Unexpected RPC: ${name}` } });
      }),
      from: jest.fn().mockReturnValue({
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({ data: { handle: '@demo-2026' }, error: null }),
      }),
      auth: {
        signInWithPassword: jest.fn().mockResolvedValue({
          data: { session: { access_token: 'mock-token', refresh_token: 'mock-refresh' } },
          error: null,
        }),
      },
    });
  };

  it('returns 400 for invalid PIN format (too short)', async () => {
    const req = new NextRequest('http://localhost/api/auth/pin', {
      method: 'POST',
      body: JSON.stringify({ pin: 'ab' }),
    });
    const res = await POST(req);
    const body = await res.json();
    expect(res.status).toBe(400);
    expect(body.error).toContain('Invalid PIN format');
  });

  it('returns 400 for non-alphanumeric PIN', async () => {
    const req = new NextRequest('http://localhost/api/auth/pin', {
      method: 'POST',
      body: JSON.stringify({ pin: '1234!' }),
    });
    const res = await POST(req);
    const body = await res.json();
    expect(res.status).toBe(400);
    expect(body.error).toContain('Invalid PIN format');
  });

  it('returns 503 when rate limit RPC fails', async () => {
    mockCreateServiceClient.mockReturnValue({
      rpc: jest.fn().mockResolvedValue({ data: null, error: { message: 'DB error' } }),
    });

    const req = new NextRequest('http://localhost/api/auth/pin', {
      method: 'POST',
      body: JSON.stringify({ pin: '1234' }),
    });
    const res = await POST(req);
    const body = await res.json();
    expect(res.status).toBe(503);
    expect(body.error).toBe('Security service unavailable');
  });

  it('returns 429 when rate limited', async () => {
    mockCreateServiceClient.mockReturnValue({
      rpc: jest.fn().mockImplementation((name: string) => {
        if (name === 'check_rate_limit') {
          return Promise.resolve({
            data: { allowed: false, remaining_attempts: 0, retry_after_seconds: 3600 },
            error: null,
          });
        }
        return Promise.resolve({ data: null, error: null });
      }),
    });

    const req = new NextRequest('http://localhost/api/auth/pin', {
      method: 'POST',
      body: JSON.stringify({ pin: '1234' }),
    });
    const res = await POST(req);
    const body = await res.json();
    expect(res.status).toBe(429);
    expect(body.error).toContain('Too many attempts');
  });

  it('returns 401 when PIN does not match any tenant', async () => {
    mockCreateServiceClient.mockReturnValue({
      rpc: jest.fn().mockImplementation((name: string) => {
        if (name === 'check_rate_limit') {
          return Promise.resolve({
            data: { allowed: true, remaining_attempts: 4, retry_after_seconds: 0 },
            error: null,
          });
        }
        if (name === 'verify_tenant_access') {
          return Promise.resolve({ data: [], error: null });
        }
        return Promise.resolve({ data: null, error: null });
      }),
    });

    const req = new NextRequest('http://localhost/api/auth/pin', {
      method: 'POST',
      body: JSON.stringify({ pin: '9999' }),
    });
    const res = await POST(req);
    const body = await res.json();
    expect(res.status).toBe(401);
    expect(body.error).toContain('Authentication failed');
  });

  it('returns 401 when PIN verification fails', async () => {
    mockCreateServiceClient.mockReturnValue({
      rpc: jest.fn().mockImplementation((name: string) => {
        if (name === 'check_rate_limit') {
          return Promise.resolve({
            data: { allowed: true, remaining_attempts: 4, retry_after_seconds: 0 },
            error: null,
          });
        }
        if (name === 'verify_tenant_access') {
          return Promise.resolve({
            data: [{ target_id: 'tenant-uuid', target_name: 'Demo' }],
            error: null,
          });
        }
        if (name === 'check_tenant_pin') {
          return Promise.resolve({ data: null, error: { message: 'Invalid PIN' } });
        }
        return Promise.resolve({ data: null, error: null });
      }),
    });

    const req = new NextRequest('http://localhost/api/auth/pin', {
      method: 'POST',
      body: JSON.stringify({ pin: 'wrong1' }),
    });
    const res = await POST(req);
    const body = await res.json();
    expect(res.status).toBe(401);
    expect(body.error).toContain('Authentication failed');
  });

  it('returns 200 with tokens on successful authentication', async () => {
    const mockFrom = jest.fn().mockReturnValue({
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      single: jest.fn().mockResolvedValue({ data: { handle: '@demo-2026' }, error: null }),
    });

    mockCreateServiceClient.mockReturnValue({
      rpc: jest.fn().mockImplementation((name: string) => {
        if (name === 'check_rate_limit') {
          return Promise.resolve({
            data: { allowed: true, remaining_attempts: 4, retry_after_seconds: 0 },
            error: null,
          });
        }
        if (name === 'verify_tenant_access') {
          return Promise.resolve({
            data: [{ target_id: 'tenant-uuid', target_name: 'Demo' }],
            error: null,
          });
        }
        if (name === 'check_tenant_pin') {
          return Promise.resolve({ data: true, error: null });
        }
        return Promise.resolve({ data: null, error: null });
      }),
      from: mockFrom,
      auth: {
        signInWithPassword: jest.fn().mockResolvedValue({
          data: { session: { access_token: 'mock-token-abc', refresh_token: 'mock-refresh-xyz' } },
          error: null,
        }),
      },
    });

    const req = new NextRequest('http://localhost/api/auth/pin', {
      method: 'POST',
      body: JSON.stringify({ pin: '1234' }),
    });
    const res = await POST(req);
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.access_token).toBe('mock-token-abc');
    expect(body.refresh_token).toBe('mock-refresh-xyz');
  });
});
