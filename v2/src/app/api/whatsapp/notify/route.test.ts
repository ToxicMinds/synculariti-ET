import { POST } from './route';
import { NextRequest } from 'next/server';

// Mock server-side utilities
jest.mock('next/headers', () => ({
  cookies: jest.fn(() => Promise.resolve({
    get: jest.fn(),
    set: jest.fn(),
  })),
}));

const mockInsert = jest.fn();
const mockSingle = jest.fn();
const mockEq = jest.fn();
const mockSelect = jest.fn();

jest.mock('@/lib/supabase-server', () => ({
  createClient: jest.fn(() => Promise.resolve({
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
    // Mock valid API key lookup
    mockSingle.mockResolvedValueOnce({
      data: { tenant_id: 'tenant-123', id: 'key-123' },
      error: null
    });

    const payload = {
      locationName: 'HQ',
      event: 'INVOICE_APPROVED',
      recipientPhone: '421903123456',
      data: { amount: 100 }
    };

    const req = new NextRequest('http://localhost/api/whatsapp/notify', {
      method: 'POST',
      headers: {
        'X-Api-Key': 'valid_key_123',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload),
    });
    
    const response = await (POST as any)(req, { params: Promise.resolve({}) });
    
    expect(response.status).toBe(202);
    
    // Verify it wrote to the outbox
    expect(mockInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        tenant_id: 'tenant-123',
        api_key_id: 'key-123',
        recipient_phone: '421903123456',
        payload: payload,
        status: 'PENDING'
      })
    );
  });
});
