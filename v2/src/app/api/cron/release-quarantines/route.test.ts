import { GET } from './route';
import { NextRequest } from 'next/server';
import { createClient } from '@supabase/supabase-js';

jest.mock('@supabase/supabase-js', () => ({
  createClient: jest.fn(),
}));

describe('GET /api/cron/release-quarantines', () => {
  const mockRpc = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.CRON_SECRET = 'test-secret';
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-key';

    (createClient as jest.Mock).mockReturnValue({
      rpc: mockRpc,
    });
  });

  function createReq(secret: string | null) {
    const req = new NextRequest('http://localhost:3000/api/cron/release-quarantines');
    if (secret !== null) {
      req.headers.set('x-cron-secret', secret);
    }
    return req;
  }

  test('Missing cron secret -> 401', async () => {
    const res = await GET(createReq(null));
    expect(res.status).toBe(401);
  });

  test('Wrong cron secret -> 401', async () => {
    const res = await GET(createReq('wrong'));
    expect(res.status).toBe(401);
  });

  test('Valid cron secret, RPC returns data -> 200 with released object', async () => {
    mockRpc.mockResolvedValueOnce({
      data: [{ released_purchases: 5, released_pending: 2, errors: [] }],
      error: null,
    });
    const res = await GET(createReq('test-secret'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({
      released: [{ released_purchases: 5, released_pending: 2, errors: [] }],
    });
  });

  test('RPC throws -> 500', async () => {
    mockRpc.mockResolvedValueOnce({
      data: null,
      error: new Error('DB Error'),
    });
    const res = await GET(createReq('test-secret'));
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body).toEqual({ error: 'DB Error' });
  });
});
