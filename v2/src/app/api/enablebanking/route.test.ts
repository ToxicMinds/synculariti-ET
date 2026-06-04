/**
 * Phase 2c Contract Tests: enablebanking/route.ts event-log wiring
 * Proves recordEventServer is called with bank_sync.session_started
 */

jest.mock('@/lib/event-log-server', () => ({
  recordEventServer: jest.fn().mockResolvedValue(true),
}));
jest.mock('@/lib/logger-server', () => ({
  ServerLogger: { system: jest.fn() },
}));

jest.mock('@/lib/withTestHandler', () => ({
  withTestHandler: (handler: any) => handler,
}));

import { POST } from './route';
import { recordEventServer } from '@/lib/event-log-server';

// Mock fetch globally
global.fetch = jest.fn();

describe('enablebanking/route — Event Log Wiring (Contract)', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = {
      ...originalEnv,
      ENABLE_BANKING_APP_ID: 'test-id',
      ENABLE_BANKING_APP_SECRET: 'test-secret',
      NEXT_PUBLIC_APP_URL: 'https://app.test',
    };

    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: jest.fn().mockResolvedValue({ session_id: 'bank-session-123' }),
    });
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('POSITIVE: calls recordEventServer with bank_sync.session_started on start_session action', async () => {
    const req = new Request('https://app.test/api/enablebanking', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'start_session',
        institution_id: 'bank-abc',
        redirect_uri: 'https://app.test/callback',
      }),
    });
    
    const context = { auth: { tenantId: 'tenant-abc', user: { email: 'test@example.com' } } };
    
    // GET is exported as POST in the route
    await (POST as any)(req, context);

    expect(recordEventServer).toHaveBeenCalledWith(expect.objectContaining({
      action: 'bank_sync.session_started',
      tenantId: 'tenant-abc',
      whoType: 'user',
      metadata: expect.objectContaining({
        institutionId: 'bank-abc'
      })
    }));
  });

  it('NEGATIVE: does NOT call recordEventServer for non-start_session actions (e.g. institutions)', async () => {
    const req = new Request('https://app.test/api/enablebanking', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'institutions',
        country: 'SK',
      }),
    });
    
    const context = { auth: { tenantId: 'tenant-abc', user: { email: 'test@example.com' } } };
    
    await (POST as any)(req, context);

    expect(recordEventServer).not.toHaveBeenCalled();
  });

  it('NEGATIVE: does NOT call recordEventServer if upstream Enable Banking API fails', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: false,
      status: 400,
      json: jest.fn().mockResolvedValue({ error: 'Invalid config' }),
    });

    const req = new Request('https://app.test/api/enablebanking', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'start_session',
        institution_id: 'bank-abc',
        redirect_uri: 'https://app.test/callback',
      }),
    });
    
    const context = { auth: { tenantId: 'tenant-abc', user: { email: 'test@example.com' } } };
    
    await (POST as any)(req, context);

    expect(recordEventServer).not.toHaveBeenCalled();
  });
});
