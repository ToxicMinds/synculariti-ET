import { POST } from './route';
import { NextRequest } from 'next/server';

const mockInsert = jest.fn();
const mockMaybeSingle = jest.fn();
const mockApiSingle = jest.fn();
const mockTenantSingle = jest.fn();

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
      if (table === 'whatsapp_outbox') {
        return {
          insert: mockInsert.mockResolvedValue({ error: null }),
          select: jest.fn().mockReturnThis(),
          eq: jest.fn().mockReturnThis(),
          maybeSingle: mockMaybeSingle,
        };
      }
      return {};
    }),
  })),
}));

jest.mock('@/lib/logger-server', () => ({
  ServerLogger: { system: jest.fn(), user: jest.fn() },
}));

describe('WhatsApp Notify API Contract', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockMaybeSingle.mockReset();
    mockInsert.mockReset();
    mockApiSingle.mockReset();
    mockTenantSingle.mockReset();
  });

  it('should reject requests without an API key', async () => {
    const req = new NextRequest('http://localhost/api/whatsapp/notify', {
      method: 'POST',
      body: JSON.stringify({}),
    });

    const response = await (POST as any)(req, { params: Promise.resolve({}) });
    expect(response.status).toBe(401);

    const data = await response.json();
    expect(data.error).toBe('Missing X-Api-Key header');
  });

  it('should reject requests with an invalid API key', async () => {
    mockApiSingle.mockResolvedValueOnce({ data: null, error: new Error('Not found') });

    const req = new NextRequest('http://localhost/api/whatsapp/notify', {
      method: 'POST',
      headers: { 'X-Api-Key': 'invalid_key', 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });

    const response = await (POST as any)(req, { params: Promise.resolve({}) });
    expect(response.status).toBe(401);
  });

  describe('per-tenant API keys (existing behavior)', () => {
    it('should accept a valid request, write to outbox, and return 202', async () => {
      mockApiSingle.mockResolvedValueOnce({
        data: { tenant_id: 'tenant-123', id: 'key-123' },
        error: null,
      });
      mockMaybeSingle.mockResolvedValue({ data: null, error: null });

      const body = {
        recipientPhone: '421903123456',
        payload: {
          type: 'poll' as const,
          name: 'Approve Invoice #INV-001?',
          options: ['Approve', 'Reject'],
          metadata: { invoiceId: 'inv-001', amount: 100, currency: 'EUR' },
        },
        webhookUrl: 'https://my-app.com/webhook/callback',
        webhookSecret: 'test-secret',
        idempotencyKey: '550e8400-e29b-41d4-a716-446655440000',
      };

      const req = new NextRequest('http://localhost/api/whatsapp/notify', {
        method: 'POST',
        headers: { 'X-Api-Key': 'valid_key_123', 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      const response = await (POST as any)(req, { params: Promise.resolve({}) });
      expect(response.status).toBe(202);

      expect(mockInsert).toHaveBeenCalledWith(
        expect.objectContaining({
          tenant_id: 'tenant-123',
          api_key_id: 'key-123',
          recipient_phone: '421903123456',
          payload: expect.objectContaining({
            type: 'poll',
            name: 'Approve Invoice #INV-001?',
            options: ['Approve', 'Reject'],
            text: null,
            metadata: { invoiceId: 'inv-001', amount: 100, currency: 'EUR' },
          }),
          status: 'PENDING',
          webhook_url: body.webhookUrl,
          webhook_secret: body.webhookSecret,
          idempotency_key: body.idempotencyKey,
        })
      );
    });

    it('should reject invalid payload with bad recipient phone', async () => {
      mockApiSingle.mockResolvedValueOnce({
        data: { tenant_id: 'tenant-123', id: 'key-123' },
        error: null,
      });

      const req = new NextRequest('http://localhost/api/whatsapp/notify', {
        method: 'POST',
        headers: { 'X-Api-Key': 'valid_key_123', 'Content-Type': 'application/json' },
        body: JSON.stringify({ recipientPhone: '', payload: { type: 'text' } }),
      });

      const response = await (POST as any)(req, { params: Promise.resolve({}) });
      expect(response.status).toBe(400);
    });

    it('should reject payload with unknown type', async () => {
      mockApiSingle.mockResolvedValueOnce({
        data: { tenant_id: 'tenant-123', id: 'key-123' },
        error: null,
      });

      const req = new NextRequest('http://localhost/api/whatsapp/notify', {
        method: 'POST',
        headers: { 'X-Api-Key': 'valid_key_123', 'Content-Type': 'application/json' },
        body: JSON.stringify({ recipientPhone: '421901234567', payload: { type: 'fax' } }),
      });

      const response = await (POST as any)(req, { params: Promise.resolve({}) });
      expect(response.status).toBe(400);
    });

    it('should reject malformed JSON body', async () => {
      mockApiSingle.mockResolvedValueOnce({
        data: { tenant_id: 'tenant-123', id: 'key-123' },
        error: null,
      });

      const req = new NextRequest('http://localhost/api/whatsapp/notify', {
        method: 'POST',
        headers: { 'X-Api-Key': 'valid_key_123', 'Content-Type': 'application/json' },
        body: 'not-json',
      });

      const response = await (POST as any)(req, { params: Promise.resolve({}) });
      expect(response.status).toBe(400);
    });

    it('should process a text-type payload correctly', async () => {
      mockApiSingle.mockResolvedValueOnce({
        data: { tenant_id: 'tenant-abc', id: 'key-456' },
        error: null,
      });
      mockMaybeSingle.mockResolvedValue({ data: null, error: null });

      const req = new NextRequest('http://localhost/api/whatsapp/notify', {
        method: 'POST',
        headers: { 'X-Api-Key': 'valid_key_123', 'Content-Type': 'application/json' },
        body: JSON.stringify({
          recipientPhone: '421901234567',
          payload: { type: 'text', text: 'Hello from API' },
        }),
      });

      const response = await (POST as any)(req, { params: Promise.resolve({}) });
      expect(response.status).toBe(202);

      expect(mockInsert).toHaveBeenCalledWith(
        expect.objectContaining({
          tenant_id: 'tenant-abc',
          recipient_phone: '421901234567',
          payload: expect.objectContaining({
            type: 'text',
            text: 'Hello from API',
          }),
        })
      );
    });

    it('should return existing outbox on idempotency key collision', async () => {
      mockApiSingle.mockResolvedValueOnce({
        data: { tenant_id: 'tenant-123', id: 'key-123' },
        error: null,
      });
      mockMaybeSingle.mockResolvedValue({
        data: { id: 'existing-outbox-id' },
        error: null,
      });

      const req = new NextRequest('http://localhost/api/whatsapp/notify', {
        method: 'POST',
        headers: { 'X-Api-Key': 'valid_key_123', 'Content-Type': 'application/json' },
        body: JSON.stringify({
          recipientPhone: '421901234567',
          payload: { type: 'text', text: 'Duplicate' },
          idempotencyKey: '550e8400-e29b-41d4-a716-446655440000',
        }),
      });

      const response = await (POST as any)(req, { params: Promise.resolve({}) });

      const json = await response.json();
      expect(mockMaybeSingle).toHaveBeenCalled();
      expect(response.status).toBe(200);
      expect(json.existing).toBe(true);
      expect(json.outboxId).toBe('existing-outbox-id');
    });
  });

  describe('service-level API keys (shared across tenants)', () => {
    const TARGET_TENANT = 'f039714b-8276-4733-8172-58b049bd9163';

    it('should accept request with valid tenant_id and source', async () => {
      mockApiSingle.mockResolvedValueOnce({
        data: { tenant_id: null, id: 'svc-key-001' },
        error: null,
      });
      mockTenantSingle.mockResolvedValueOnce({
        data: { id: TARGET_TENANT },
        error: null,
      });
      mockMaybeSingle.mockResolvedValue({ data: null, error: null });

      const req = new NextRequest('http://localhost/api/whatsapp/notify', {
        method: 'POST',
        headers: { 'X-Api-Key': 'svc_key_shared', 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tenant_id: TARGET_TENANT,
          source: 'ims',
          recipientPhone: '421901234567',
          payload: { type: 'text', text: 'Stock alert from IMS' },
        }),
      });

      const response = await (POST as any)(req, { params: Promise.resolve({}) });
      expect(response.status).toBe(202);

      expect(mockInsert).toHaveBeenCalledWith(
        expect.objectContaining({
          tenant_id: TARGET_TENANT,
          api_key_id: 'svc-key-001',
          recipient_phone: '421901234567',
          payload: expect.objectContaining({
            type: 'text',
            text: 'Stock alert from IMS',
            metadata: expect.objectContaining({ source: 'ims' }),
          }),
        })
      );
    });

    it('should reject when tenant_id is missing in body', async () => {
      mockApiSingle.mockResolvedValueOnce({
        data: { tenant_id: null, id: 'svc-key-001' },
        error: null,
      });

      const req = new NextRequest('http://localhost/api/whatsapp/notify', {
        method: 'POST',
        headers: { 'X-Api-Key': 'svc_key_shared', 'Content-Type': 'application/json' },
        body: JSON.stringify({
          recipientPhone: '421901234567',
          payload: { type: 'text', text: 'Missing tenant' },
        }),
      });

      const response = await (POST as any)(req, { params: Promise.resolve({}) });
      expect(response.status).toBe(400);
      const json = await response.json();
      expect(json.error).toContain('tenant_id is required');
    });

    it('should reject when tenant_id does not exist', async () => {
      mockApiSingle.mockResolvedValueOnce({
        data: { tenant_id: null, id: 'svc-key-001' },
        error: null,
      });
      mockTenantSingle.mockResolvedValueOnce({
        data: null,
        error: new Error('Not found'),
      });

      const req = new NextRequest('http://localhost/api/whatsapp/notify', {
        method: 'POST',
        headers: { 'X-Api-Key': 'svc_key_shared', 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tenant_id: '00000000-0000-0000-0000-000000000000',
          recipientPhone: '421901234567',
          payload: { type: 'text', text: 'Bad tenant' },
        }),
      });

      const response = await (POST as any)(req, { params: Promise.resolve({}) });
      expect(response.status).toBe(400);
    });
  });
});
