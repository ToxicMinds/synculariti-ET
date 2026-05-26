import { POST } from './route';
import { NextRequest } from 'next/server';

const mockInsert = jest.fn();
const mockSingle = jest.fn();
const mockEq = jest.fn();
const mockSelect = jest.fn();
const mockMaybeSingle = jest.fn();

jest.mock('@supabase/supabase-js', () => ({
  createClient: jest.fn(() => ({
    from: jest.fn((table: string) => {
      if (table === 'api_keys') {
        return {
          select: mockSelect.mockReturnThis(),
          eq: mockEq.mockReturnThis(),
          single: mockSingle,
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
    })
  })),
}));

describe('WhatsApp Notify API Contract', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should reject requests without an API key', async () => {
    const req = new NextRequest('http://localhost/api/whatsapp/notify', {
      method: 'POST',
      body: JSON.stringify({}),
    });
    
    // Pass empty context as this route uses API Keys, not cookies
    const response = await (POST as any)(req, { params: Promise.resolve({}) });
    expect(response.status).toBe(401);
    
    const data = await response.json();
    expect(data.error).toBe('Missing X-Api-Key header');
  });

  it('should reject requests with an invalid API key', async () => {
    mockSingle.mockResolvedValueOnce({ data: null, error: new Error('Not found') });
    
    const req = new NextRequest('http://localhost/api/whatsapp/notify', {
      method: 'POST',
      headers: {
        'X-Api-Key': 'invalid_key',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({}),
    });
    
    const response = await (POST as any)(req, { params: Promise.resolve({}) });
    expect(response.status).toBe(401);
  });

  it('should accept a valid request, write to outbox, and return 202', async () => {
    mockSingle.mockResolvedValueOnce({
      data: { tenant_id: 'tenant-123', id: 'key-123' },
      error: null
    });
    mockMaybeSingle.mockResolvedValueOnce({ data: null, error: null });

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
      headers: {
        'X-Api-Key': 'valid_key_123',
        'Content-Type': 'application/json'
      },
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
});
