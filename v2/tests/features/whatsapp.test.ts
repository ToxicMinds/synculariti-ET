import { loadFeature, defineFeature } from 'jest-cucumber';
import path from 'path';
import { NextRequest } from 'next/server';
// Mock @/lib/supabase to prevent SSR creation crash in Node test context
jest.mock('@/lib/supabase', () => ({
  supabase: {
    from: jest.fn(),
    rpc: jest.fn(),
  },
}));

import { POST } from '../../src/app/api/whatsapp/webhook/route';
import { verifyWebhookSignature } from '@synculariti/whatsapp-client';

const feature = loadFeature(path.join(__dirname, 'whatsapp.feature'));

// Mock next/headers
jest.mock('next/headers', () => ({
  cookies: jest.fn(() => Promise.resolve({
    get: jest.fn(),
    set: jest.fn(),
  })),
}));

// Mock Supabase (service-role client for webhook route)
const mockRpc = jest.fn();
const mockOutboxSingle = jest.fn();
jest.mock('@supabase/supabase-js', () => ({
  createClient: jest.fn(() => ({
    rpc: mockRpc.mockResolvedValue({ data: null, error: null }),
    from: jest.fn((table: string) => {
      if (table === 'whatsapp_outbox') {
        return {
          select: jest.fn().mockReturnThis(),
          eq: jest.fn().mockReturnThis(),
          order: jest.fn().mockReturnThis(),
          limit: jest.fn().mockReturnThis(),
          single: mockOutboxSingle,
        };
      }
      return {};
    }),
  })),
}));

// Mock logger to avoid console pollute
jest.mock('@/lib/logger-server', () => ({
  ServerLogger: {
    system: jest.fn(),
    user: jest.fn(),
  }
}));

// Mock the verifyWebhookSignature function from the library so we can control it in tests
jest.mock('@synculariti/whatsapp-client', () => {
  const actual = jest.requireActual('@synculariti/whatsapp-client');
  return {
    ...actual,
    verifyWebhookSignature: jest.fn(),
    getErrorMessage: actual.getErrorMessage,
  };
});

defineFeature(feature, (test) => {
  let payload: string = '';
  let signatureHeader: string | null = null;
  let response: Response;
  beforeEach(() => {
    jest.clearAllMocks();
    payload = '';
    signatureHeader = null;
    serviceShouldFail = false;
    process.env.OPENWA_WEBHOOK_SECRET = 'test-secret';
    // Default: outbox lookup succeeds
    mockOutboxSingle.mockResolvedValue({
      data: {
        id: 'outbox-123',
        tenant_id: 'tenant-123',
        payload: { metadata: {} },
      },
      error: null,
    });
  });

  test('Rejecting Webhook with Invalid Signature', ({ given, and, when, then }) => {
    given(/^a webhook request with payload '(.*)'$/, (p) => {
      payload = p;
    });

    and(/^an invalid signature header "(.*)"$/, (sig) => {
      signatureHeader = sig;
      (verifyWebhookSignature as jest.Mock).mockResolvedValue(false);
    });

    when('the webhook route processes the request', async () => {
      const headers: Record<string, string> = {};
      if (signatureHeader) {
        headers['X-OpenWA-Signature'] = signatureHeader;
      }
      const req = new NextRequest('http://localhost/api/whatsapp/webhook', {
        method: 'POST',
        headers,
        body: payload,
      });

      response = await POST(req);
    });

    then(/^it should reject the request with a (\d+) Forbidden status$/, (statusStr) => {
      expect(response.status).toBe(parseInt(statusStr, 10));
    });
  });

  test('Rejecting Webhook with Missing Signature Header', ({ given, and, when, then }) => {
    given(/^a webhook request with payload '(.*)'$/, (p) => {
      payload = p;
    });

    and('no signature header', () => {
      signatureHeader = null;
    });

    when('the webhook route processes the request', async () => {
      const req = new NextRequest('http://localhost/api/whatsapp/webhook', {
        method: 'POST',
        headers: {},
        body: payload,
      });

      response = await POST(req);
    });

    then(/^it should reject the request with a (\d+) Unauthorized status$/, (statusStr) => {
      expect(response.status).toBe(parseInt(statusStr, 10));
    });
  });

  test('Processing Valid Webhook Poll Vote', ({ given, and, when, then }) => {
    given(/^a webhook request with payload '(.*)'$/, (p) => {
      payload = p;
    });

    and(/^a valid signature header computed with secret "(.*)"$/, (secret) => {
      signatureHeader = 'valid-sig-hash';
      (verifyWebhookSignature as jest.Mock).mockResolvedValue(true);
    });

    when('the webhook route processes the request', async () => {
      const headers: Record<string, string> = {};
      if (signatureHeader) {
        headers['X-OpenWA-Signature'] = signatureHeader;
      }
      const req = new NextRequest('http://localhost/api/whatsapp/webhook', {
        method: 'POST',
        headers,
        body: payload,
      });

      response = await POST(req);
    });

    then(/^it should accept the request with a (\d+) OK status$/, (statusStr) => {
      expect(response.status).toBe(parseInt(statusStr, 10));
    });

    and(/^the event must be stored in the database inbox under tenant "(.*)" linked to outbox "(.*)"$/, (tenantId, outboxId) => {
      expect(mockRpc).toHaveBeenCalledWith(
        'insert_whatsapp_inbox_v1',
        expect.objectContaining({
          p_tenant_id: tenantId,
          p_outbox_id: outboxId,
          p_sender_phone: '421951153761',
          p_message_id: 'msg-123',
          p_message_type: 'poll_vote',
          p_content: 'Approve'
        })
      );
    });
  });

  test('Processing Webhook with Unknown Outbox', ({ given, and, when, then }) => {
    given(/^a webhook request with payload '(.*)'$/, (p) => {
      payload = p;
    });

    and(/^a valid signature header computed with secret "(.*)"$/, (secret) => {
      signatureHeader = 'valid-sig-hash';
      (verifyWebhookSignature as jest.Mock).mockResolvedValue(true);
    });

    when('the webhook route processes the request', async () => {
      mockOutboxSingle.mockResolvedValue({
        data: null,
        error: { message: 'Not found' },
      });

      const headers: Record<string, string> = {};
      if (signatureHeader) {
        headers['X-OpenWA-Signature'] = signatureHeader;
      }
      const req = new NextRequest('http://localhost/api/whatsapp/webhook', {
        method: 'POST',
        headers,
        body: payload,
      });

      response = await POST(req);
    });

    then(/^it should reject the request with a (\d+) Tenant Not Found status$/, (statusStr) => {
      expect(response.status).toBe(parseInt(statusStr, 10));
    });
  });


});