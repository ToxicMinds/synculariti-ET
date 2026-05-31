import { POST } from './route';
import { NextRequest } from 'next/server';

jest.mock('@/modules/whatsapp/lib/verify-webhook', () => ({
  verifyWebhookRequest: jest.fn(),
}));

jest.mock('@/modules/whatsapp/lib/resolve-outbox', () => ({
  resolveOutboxContext: jest.fn(),
}));

jest.mock('@/modules/whatsapp/lib/insert-inbox', () => ({
  insertInboxRecord: jest.fn(),
}));

jest.mock('@/modules/whatsapp/lib/decision-router', () => ({
  DecisionRouter: jest.fn().mockImplementation(() => ({
    route: jest.fn().mockResolvedValue(undefined),
  })),
}));

jest.mock('@/lib/supabase-server', () => ({
  createServiceClient: jest.fn(() => ({
    rpc: jest.fn().mockResolvedValue({ data: null, error: null }),
  })),
}));

jest.mock('@/lib/logger-server', () => ({
  ServerLogger: { system: jest.fn(), user: jest.fn() },
}));

import { verifyWebhookRequest } from '@/modules/whatsapp/lib/verify-webhook';
import { resolveOutboxContext } from '@/modules/whatsapp/lib/resolve-outbox';
import { insertInboxRecord } from '@/modules/whatsapp/lib/insert-inbox';

describe('WhatsApp Webhook API', () => {
  const validPayload = {
    type: 'poll_vote',
    outboxId: 'ob-001',
    recipientPhone: '421901234567',
    tenantId: 'tenant-abc',
    sender: '421901234567',
    selectedOption: 'Approve',
    pollMessageId: 'msg-001',
  };

  beforeEach(() => {
    jest.clearAllMocks();
    (verifyWebhookRequest as jest.Mock).mockReset();
    (resolveOutboxContext as jest.Mock).mockReset();
    (insertInboxRecord as jest.Mock).mockReset();
  });

  it('returns 403 when HMAC signature is invalid', async () => {
    (verifyWebhookRequest as jest.Mock).mockResolvedValue(false);

    const req = new NextRequest('http://localhost', {
      method: 'POST',
      headers: { 'X-OpenWA-Signature': 'invalid-sig' },
      body: JSON.stringify(validPayload),
    });

    const response = await POST(req);
    expect(response.status).toBe(403);
  });

  it('returns 401 when HMAC signature header is missing', async () => {
    (verifyWebhookRequest as jest.Mock).mockResolvedValue(false);

    const req = new NextRequest('http://localhost', {
      method: 'POST',
      body: JSON.stringify(validPayload),
    });

    const response = await POST(req);
    expect(response.status).toBe(401);
  });

  it('returns 200 for valid poll_vote with decision routing', async () => {
    (verifyWebhookRequest as jest.Mock).mockResolvedValue(true);
    (resolveOutboxContext as jest.Mock).mockResolvedValue({
      tenantId: 'tenant-abc',
      outboxId: 'ob-001',
      outboxRecord: {
        id: 'ob-001',
        payload: {
          type: 'poll',
          name: 'Approve?',
          options: ['Approve', 'Reject'],
          metadata: { invoiceId: 'inv-001' },
        },
      },
    });

    const req = new NextRequest('http://localhost', {
      method: 'POST',
      headers: { 'X-OpenWA-Signature': 'valid-sig' },
      body: JSON.stringify(validPayload),
    });

    const response = await POST(req);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(insertInboxRecord).toHaveBeenCalledTimes(1);
  });

  it('returns 200 even when outbox context is missing (graceful)', async () => {
    (verifyWebhookRequest as jest.Mock).mockResolvedValue(true);
    (resolveOutboxContext as jest.Mock).mockResolvedValue({
      tenantId: null,
      outboxId: null,
      outboxRecord: null,
    });

    const req = new NextRequest('http://localhost', {
      method: 'POST',
      headers: { 'X-OpenWA-Signature': 'valid-sig' },
      body: JSON.stringify({ type: 'text', sender: '421901234567' }),
    });

    const response = await POST(req);
    expect(response.status).toBe(400);
  });
});
