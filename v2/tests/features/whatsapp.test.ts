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

// Mock Supabase
const mockInsert = jest.fn();
jest.mock('@/lib/supabase-server', () => ({
  createClient: jest.fn(() => Promise.resolve({
    from: jest.fn((table: string) => {
      if (table === 'whatsapp_inbox') {
        return {
          insert: mockInsert.mockResolvedValue({ error: null }),
        };
      }
      return {};
    })
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
    process.env.OPENWA_WEBHOOK_SECRET = 'test-secret';
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
      // The current route returns 403 on invalid signature, which is appropriate.
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
      expect(mockInsert).toHaveBeenCalledWith(
        expect.objectContaining({
          tenant_id: tenantId,
          outbox_id: outboxId,
          sender_phone: '421951153761',
          message_id: 'msg-123',
          message_type: 'poll_vote',
          content: 'Approve'
        })
      );
    });
  });
});
