import { POST } from './route';
import { NextRequest } from 'next/server';

jest.mock('@/modules/whatsapp/lib/processOutboxQueue', () => ({
  processOutboxQueue: jest.fn(),
}));

import { processOutboxQueue as mockProcessOutboxQueue } from '@/modules/whatsapp/lib/processOutboxQueue';

jest.mock('@/lib/supabase-server', () => ({
  createServiceClient: jest.fn(() => ({})),
}));

jest.mock('@/lib/create-openwa-client', () => ({
  createOpenWAClient: jest.fn(() => ({})),
}));

jest.mock('@/lib/logger-server', () => ({
  ServerLogger: { system: jest.fn(), user: jest.fn() },
}));

describe('WhatsApp Process Outbox (Webhook)', () => {
  const OLD_SECRET = process.env.SUPABASE_WEBHOOK_SECRET;

  beforeAll(() => {
    process.env.SUPABASE_WEBHOOK_SECRET = 'whs_test_secret_key_123';
    process.env.NEXT_PUBLIC_BASE_URL = 'https://example.com';
  });

  afterAll(() => {
    process.env.SUPABASE_WEBHOOK_SECRET = OLD_SECRET;
  });

  beforeEach(() => {
    jest.clearAllMocks();
    mockProcessOutboxQueue.mockReset();
  });

  it('returns 200 for valid INSERT with PENDING record', async () => {
    mockProcessOutboxQueue.mockResolvedValue({
      processed: 1, failed: 0, claimed: 1, errors: [],
    });

    const req = new NextRequest('http://localhost', {
      method: 'POST',
      headers: { authorization: 'Bearer whs_test_secret_key_123' },
      body: JSON.stringify({
        type: 'INSERT',
        table: 'whatsapp_outbox',
        record: { id: 'out-1', status: 'PENDING', payload: { type: 'text', text: 'hi' } },
      }),
    });

    const response = await POST(req);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.processed).toBe(1);
    expect(mockProcessOutboxQueue).toHaveBeenCalledTimes(1);
  });

  it('returns 401 when auth header is missing', async () => {
    const req = new NextRequest('http://localhost', {
      method: 'POST',
      body: JSON.stringify({ type: 'INSERT', record: { status: 'PENDING' } }),
    });

    const response = await POST(req);
    expect(response.status).toBe(401);
    expect(mockProcessOutboxQueue).not.toHaveBeenCalled();
  });

  it('returns 401 with wrong Bearer token', async () => {
    const req = new NextRequest('http://localhost', {
      method: 'POST',
      headers: { authorization: 'Bearer wrong-secret' },
      body: JSON.stringify({ type: 'INSERT', record: { status: 'PENDING' } }),
    });

    const response = await POST(req);
    expect(response.status).toBe(401);
    expect(mockProcessOutboxQueue).not.toHaveBeenCalled();
  });

  it('skips non-INSERT or non-PENDING records', async () => {
    const req = new NextRequest('http://localhost', {
      method: 'POST',
      headers: { authorization: 'Bearer whs_test_secret_key_123' },
      body: JSON.stringify({
        type: 'UPDATE',
        record: { id: 'out-2', status: 'SENT' },
      }),
    });

    const response = await POST(req);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.skipped).toBe(true);
    expect(mockProcessOutboxQueue).not.toHaveBeenCalled();
  });

  it('returns error details on exception', async () => {
    mockProcessOutboxQueue.mockRejectedValue(new Error('DB connection failed'));

    const req = new NextRequest('http://localhost', {
      method: 'POST',
      headers: { authorization: 'Bearer whs_test_secret_key_123' },
      body: JSON.stringify({
        type: 'INSERT',
        record: { id: 'out-3', status: 'PENDING', payload: { type: 'text', text: 'hi' } },
      }),
    });

    const response = await POST(req);
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.error).toContain('DB connection failed');
  });
});
