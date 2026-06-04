/**
 * Phase 2c Contract Tests: auth/pin/route.ts event-log wiring
 * Proves recordEventServer is called with pin.verified
 */

jest.mock('@/lib/event-log-server', () => ({
  recordEventServer: jest.fn().mockResolvedValue(true),
}));
jest.mock('@/lib/logger-server', () => ({
  ServerLogger: { system: jest.fn() },
}));

// We need a complex mock for supabaseAdmin
const mockRpc = jest.fn();
const mockSelect = jest.fn().mockReturnThis();
const mockEq = jest.fn().mockReturnThis();
const mockSingle = jest.fn();

const mockSignInWithPassword = jest.fn();

jest.mock('@/lib/supabase-server', () => ({
  createServiceClient: jest.fn(() => ({
    rpc: mockRpc,
    from: jest.fn(() => ({
      select: mockSelect,
      eq: mockEq,
      single: mockSingle,
    })),
    auth: {
      signInWithPassword: mockSignInWithPassword,
    }
  })),
}));

import { POST } from './route';
import { recordEventServer } from '@/lib/event-log-server';

describe('auth/pin/route — Event Log Wiring (Contract)', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv, PIN_DERIVATION_SECRET: 'test-secret' };
    jest.clearAllMocks();

    // Default happy path
    mockRpc.mockImplementation(async (name) => {
      if (name === 'check_rate_limit') return { data: { allowed: true, remaining_attempts: 5, retry_after_seconds: 0 }, error: null };
      if (name === 'verify_tenant_access') return { data: [{ target_id: 'tenant-abc', target_name: 'Test Tenant' }], error: null };
      if (name === 'check_tenant_pin') return { data: true, error: null };
      return { data: null, error: null };
    });
    
    mockSingle.mockResolvedValue({ data: { handle: 'test-handle' }, error: null });
    mockSignInWithPassword.mockResolvedValue({ data: { session: { access_token: 'token', refresh_token: 'refresh' } }, error: null });
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('POSITIVE: calls recordEventServer with pin.verified on successful login', async () => {
    const req = new Request('https://app/api/auth/pin', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pin: '1234' }),
    });

    await POST(req);

    expect(recordEventServer).toHaveBeenCalledWith(expect.objectContaining({
      action: 'pin.verified',
      tenantId: 'tenant-abc',
      whoType: 'user', // System processes the login, but the action is a user action
    }));
  });

  it('NEGATIVE: does NOT call recordEventServer on rate limit failure', async () => {
    mockRpc.mockImplementationOnce(async (name) => {
      if (name === 'check_rate_limit') return { data: { allowed: false, remaining_attempts: 0, retry_after_seconds: 60 }, error: null };
      return { data: null, error: null };
    });

    const req = new Request('https://app/api/auth/pin', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pin: '1234' }),
    });

    await POST(req);

    expect(recordEventServer).not.toHaveBeenCalled();
  });

  it('NEGATIVE: does NOT call recordEventServer on incorrect PIN', async () => {
    mockRpc.mockImplementation(async (name) => {
      if (name === 'check_rate_limit') return { data: { allowed: true, remaining_attempts: 5, retry_after_seconds: 0 }, error: null };
      if (name === 'verify_tenant_access') return { data: [{ target_id: 'tenant-abc', target_name: 'Test Tenant' }], error: null };
      if (name === 'check_tenant_pin') return { data: false, error: null }; // PIN INVALID
      return { data: null, error: null };
    });

    const req = new Request('https://app/api/auth/pin', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pin: '9999' }),
    });

    await POST(req);

    expect(recordEventServer).not.toHaveBeenCalled();
  });
});
