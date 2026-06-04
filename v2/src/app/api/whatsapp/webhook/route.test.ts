/**
 * Phase 2c Contract Tests: whatsapp/webhook/route.ts event-log wiring
 * Proves recordEventServer is called with whatsapp.response.received
 * after a valid inbound webhook is processed.
 *
 * NOTE: This route uses `export const runtime = 'edge'` so we test the
 * extracted business logic path (insertInboxRecord + router.route), not
 * the HTTP handler directly — consistent with how the existing tests work.
 */

jest.mock('@/lib/event-log-server', () => ({
  recordEventServer: jest.fn().mockResolvedValue(true),
}));
jest.mock('@/lib/logger-server', () => ({
  ServerLogger: { system: jest.fn() },
}));
jest.mock('@/lib/supabase-server', () => ({
  createServiceClient: jest.fn(() => ({
    rpc: jest.fn().mockResolvedValue({ data: null, error: null }),
  })),
}));
jest.mock('@/modules/whatsapp/lib/verify-webhook', () => ({
  verifyWebhookRequest: jest.fn().mockResolvedValue(true),
}));
jest.mock('@/modules/whatsapp/lib/resolve-outbox', () => ({
  resolveOutboxContext: jest.fn().mockResolvedValue({
    tenantId: 'tenant-abc',
    outboxId: 'outbox-1',
    outboxRecord: { payload: { metadata: { source: 'workflow:bill_approval' } } },
  }),
}));
jest.mock('@/modules/whatsapp/lib/insert-inbox', () => ({
  insertInboxRecord: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('@/modules/whatsapp/lib/decision-router', () => ({
  DecisionRouter: jest.fn().mockImplementation(() => ({
    route: jest.fn().mockResolvedValue(undefined),
  })),
}));

import { POST } from './route';
import { recordEventServer } from '@/lib/event-log-server';
import { resolveOutboxContext } from '@/modules/whatsapp/lib/resolve-outbox';

function makeRequest(body: object, sig = 'valid-sig'): Request {
  return new Request('https://app/api/whatsapp/webhook', {
    method: 'POST',
    headers: { 'X-OpenWA-Signature': sig },
    body: JSON.stringify(body),
  });
}

describe('webhook/route — Event Log Wiring (Contract)', () => {
  beforeEach(() => jest.clearAllMocks());

  it('POSITIVE: calls recordEventServer with whatsapp.response.received after valid inbound message', async () => {
    const req = makeRequest({ type: 'text', sender: '+421900000000', content: 'Approve' });
    await POST(req);

    expect(recordEventServer).toHaveBeenCalledWith(expect.objectContaining({
      action: 'whatsapp.response.received',
      tenantId: 'tenant-abc',
      entityId: 'outbox-1',
      entityType: 'whatsapp_outbox',
    }));
  });

  it('NEGATIVE: does NOT call recordEventServer when tenantId cannot be resolved', async () => {
    (resolveOutboxContext as jest.Mock).mockResolvedValueOnce({
      tenantId: null,
      outboxId: null,
      outboxRecord: null,
    });

    const req = makeRequest({ type: 'text', sender: 'unknown' });
    await POST(req);

    expect(recordEventServer).not.toHaveBeenCalled();
  });

  it('EDGE: still calls recordEventServer for non-decision (plain text) inbound messages', async () => {
    (resolveOutboxContext as jest.Mock).mockResolvedValueOnce({
      tenantId: 'tenant-abc',
      outboxId: null, // no outbox match — just an inbound text
      outboxRecord: null,
    });

    const req = makeRequest({ type: 'text', sender: '+421900000000', content: 'Hello' });
    await POST(req);

    expect(recordEventServer).toHaveBeenCalledWith(expect.objectContaining({
      action: 'whatsapp.response.received',
      tenantId: 'tenant-abc',
    }));
  });
});
