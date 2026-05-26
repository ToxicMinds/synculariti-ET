import { GET } from './route';
import { NextRequest } from 'next/server';

const mockTenantSingle = jest.fn();
const mockApiSingle = jest.fn();

jest.mock('@supabase/supabase-js', () => ({
  createClient: jest.fn(() => ({
    from: jest.fn((table: string) => {
      if (table === 'api_keys') {
        return {
          select: jest.fn().mockReturnThis(),
          eq: jest.fn().mockReturnThis(),
          single: mockApiSingle,
        };
      }
      if (table === 'tenants') {
        return {
          select: jest.fn().mockReturnThis(),
          eq: jest.fn().mockReturnThis(),
          single: mockTenantSingle,
        };
      }
      return {};
    }),
  })),
}));

jest.mock('@/lib/logger-server', () => ({
  ServerLogger: { system: jest.fn(), user: jest.fn() },
}));

const TARGET_TENANT = 'f039714b-8276-4733-8172-58b049bd9163';

describe('GET /api/tenant/workflows', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockTenantSingle.mockReset();
    mockApiSingle.mockReset();
  });

  it('should reject requests without an API key', async () => {
    const req = new NextRequest('http://localhost/api/tenant/workflows');

    const response = await (GET as any)(req);
    expect(response.status).toBe(401);

    const data = await response.json();
    expect(data.error).toBe('Missing X-Api-Key header');
  });

  it('should reject requests with an invalid API key', async () => {
    mockApiSingle.mockResolvedValueOnce({ data: null, error: new Error('Not found') });

    const req = new NextRequest('http://localhost/api/tenant/workflows', {
      headers: { 'X-Api-Key': 'invalid_key' },
    });

    const response = await (GET as any)(req);
    expect(response.status).toBe(401);
  });

  it('should return workflows for a per-tenant API key', async () => {
    mockApiSingle.mockResolvedValueOnce({
      data: { tenant_id: TARGET_TENANT, id: 'key-123' },
      error: null,
    });
    mockTenantSingle.mockResolvedValueOnce({
      data: {
        config: {
          phones: { owner: '421901234567' },
          workflows: {
            bill_approval: { enabled: true, threshold: 150, recipients: ['owner'] },
            low_stock_alert: { enabled: true, threshold_pct: 80, recipients: ['manager'] },
          },
        },
      },
      error: null,
    });

    const req = new NextRequest('http://localhost/api/tenant/workflows', {
      headers: { 'X-Api-Key': 'valid_key_123' },
    });

    const response = await (GET as any)(req);
    expect(response.status).toBe(200);

    const data = await response.json();
    expect(data.workflows).toEqual({
      bill_approval: { enabled: true, threshold: 150, recipients: ['owner'] },
      low_stock_alert: { enabled: true, threshold_pct: 80, recipients: ['manager'] },
    });
  });

  it('should reject service-level key without tenant_id query param', async () => {
    mockApiSingle.mockResolvedValueOnce({
      data: { tenant_id: null, id: 'svc-key-001' },
      error: null,
    });

    const req = new NextRequest('http://localhost/api/tenant/workflows', {
      headers: { 'X-Api-Key': 'svc_key_shared' },
    });

    const response = await (GET as any)(req);
    expect(response.status).toBe(400);

    const data = await response.json();
    expect(data.error).toContain('tenant_id');
  });

  it('should return workflows for service-level key with valid tenant_id', async () => {
    mockApiSingle.mockResolvedValueOnce({
      data: { tenant_id: null, id: 'svc-key-001' },
      error: null,
    });
    mockTenantSingle.mockResolvedValueOnce({
      data: {
        config: {
          workflows: {
            daily_summary: { enabled: true, time: '21:00', recipients: ['owner'] },
          },
        },
      },
      error: null,
    });

    const req = new NextRequest(`http://localhost/api/tenant/workflows?tenant_id=${TARGET_TENANT}`, {
      headers: { 'X-Api-Key': 'svc_key_shared' },
    });

    const response = await (GET as any)(req);
    expect(response.status).toBe(200);

    const data = await response.json();
    expect(data.workflows).toEqual({
      daily_summary: { enabled: true, time: '21:00', recipients: ['owner'] },
    });
  });

  it('should return 404 when tenant is not found', async () => {
    mockApiSingle.mockResolvedValueOnce({
      data: { tenant_id: TARGET_TENANT, id: 'key-123' },
      error: null,
    });
    mockTenantSingle.mockResolvedValueOnce({
      data: null,
      error: new Error('Not found'),
    });

    const req = new NextRequest('http://localhost/api/tenant/workflows', {
      headers: { 'X-Api-Key': 'valid_key_123' },
    });

    const response = await (GET as any)(req);
    expect(response.status).toBe(404);
  });
});
