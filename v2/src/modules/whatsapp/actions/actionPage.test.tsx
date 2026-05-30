/**
 * Integration tests for ActionPageLoader.
 * Validates the cross-tenant access fix:
 *  - Uses service_role client (not RLS-bound session client) for outbox lookup
 *  - Checks tenant_members by email to authorize the user
 *  - Logs all failure paths via ServerLogger
 */

const mockGetSession = jest.fn();
const mockServiceFrom = jest.fn();
const mockServerLoggerSystem = jest.fn().mockResolvedValue(undefined);

jest.mock('@/lib/supabase-server', () => ({
  createClient: jest.fn(() => Promise.resolve({
    auth: { getSession: mockGetSession },
  })),
  createServiceClient: jest.fn(() => ({
    from: mockServiceFrom,
  })),
}));

const mockRedirect = jest.fn(() => { throw new Error('NEXT_REDIRECT'); });
jest.mock('next/navigation', () => ({ redirect: (...args: any[]) => mockRedirect(...args) }));

jest.mock('@/lib/logger-server', () => ({
  ServerLogger: { system: (...args: any[]) => mockServerLoggerSystem(...args) },
}));

import { ActionPageLoader, ActionNotFound } from '@/app/action/[actionId]/page';

/** Helper: builds a mock service client chain for a table+method+resolution */
function mockChain(
  chain: { table: string; method: 'single' | 'maybeSingle'; resolve: { data: any; error: any } }[]
) {
  mockServiceFrom.mockImplementation((table: string) => {
    const hit = chain.find(c => c.table === table);
    if (!hit) return { select: jest.fn().mockReturnThis(), eq: jest.fn().mockReturnThis(), single: jest.fn(), maybeSingle: jest.fn() };
    return {
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      single: hit.method === 'single' ? jest.fn().mockResolvedValue(hit.resolve) : jest.fn(),
      maybeSingle: hit.method === 'maybeSingle' ? jest.fn().mockResolvedValue(hit.resolve) : jest.fn(),
    };
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  mockGetSession.mockReset();
  mockServiceFrom.mockReset();
  mockServerLoggerSystem.mockClear();
  mockRedirect.mockClear();
});

describe('ActionPageLoader: auth guard', () => {
  it('redirects to login when no session exists', async () => {
    mockGetSession.mockResolvedValue({ data: { session: null }, error: null });

    await expect(ActionPageLoader({ actionId: 'test-id' })).rejects.toThrow('NEXT_REDIRECT');
    expect(mockRedirect).toHaveBeenCalledWith('/login?redirect=/action/test-id');
    expect(mockServerLoggerSystem).toHaveBeenCalledWith('WARN', 'WhatsApp', 'Action page — no session', expect.anything());
  });

  it('redirects to login when session has no user', async () => {
    mockGetSession.mockResolvedValue({ data: { session: { user: null } }, error: null });

    await expect(ActionPageLoader({ actionId: 'test-id' })).rejects.toThrow('NEXT_REDIRECT');
    expect(mockRedirect).toHaveBeenCalledWith('/login?redirect=/action/test-id');
  });
});

describe('ActionPageLoader: outbox resolution', () => {
  beforeEach(() => {
    mockGetSession.mockResolvedValue({
      data: { session: { user: { id: 'u1', email: 'nikshanbhag@gmail.com' } } },
      error: null,
    });
  });

  it('returns ActionNotFound when outbox query returns error', async () => {
    mockChain([{ table: 'whatsapp_outbox', method: 'single', resolve: { data: null, error: new Error('PGRST202: Cannot find relationship') } }]);

    const result = await ActionPageLoader({ actionId: 'bad-id' });

    expect(result?.type?.toString()).toMatch(/ActionNotFound|div/);
    expect(mockServerLoggerSystem).toHaveBeenCalledWith('WARN', 'WhatsApp', 'Action page — outbox not found', expect.objectContaining({
      actionId: 'bad-id',
      errorCode: 'N/A',
    }));
  });

  it('returns ActionNotFound when outbox record is null', async () => {
    mockChain([{ table: 'whatsapp_outbox', method: 'single', resolve: { data: null, error: null } }]);

    const result = await ActionPageLoader({ actionId: 'missing-id' });

    expect(result?.type?.toString()).toMatch(/ActionNotFound|div/);
    expect(mockServerLoggerSystem).toHaveBeenCalledWith('WARN', 'WhatsApp', 'Action page — outbox not found', expect.anything());
  });

  it('returns ActionNotFound when user has no email', async () => {
    mockGetSession.mockResolvedValue({
      data: { session: { user: { id: 'u1', email: null } } },
      error: null,
    });
    mockChain([{ table: 'whatsapp_outbox', method: 'single', resolve: {
      data: { id: 'o1', status: 'PENDING', payload: {}, tenants: { id: 't1', name: 'Demo' } },
      error: null,
    } }]);

    const result = await ActionPageLoader({ actionId: 'o1' });

    expect(result?.type?.toString()).toMatch(/ActionNotFound|div/);
    expect(mockServerLoggerSystem).toHaveBeenCalledWith('WARN', 'WhatsApp', 'Action page — user has no email, rejecting', expect.anything());
  });
});

describe('ActionPageLoader: tenant membership', () => {
  const outboxFound = {
    table: 'whatsapp_outbox', method: 'single' as const,
    resolve: { data: { id: 'o1', status: 'PENDING', payload: { name: 'Approve', options: ['Y', 'N'] }, tenants: { id: 't1', name: 'Demo' } }, error: null },
  };

  beforeEach(() => {
    mockGetSession.mockResolvedValue({
      data: { session: { user: { id: 'u1', email: 'nikshanbhag@gmail.com' } } },
      error: null,
    });
  });

  it('returns ActionNotFound when user is not a tenant member', async () => {
    mockChain([
      outboxFound,
      { table: 'tenant_members', method: 'maybeSingle', resolve: { data: null, error: null } },
    ]);

    const result = await ActionPageLoader({ actionId: 'o1' });

    expect(result?.type?.toString()).toMatch(/ActionNotFound|div/);
    expect(mockServerLoggerSystem).toHaveBeenCalledWith('WARN', 'WhatsApp', 'Action page — user not a tenant member', expect.objectContaining({
      tenantId: 't1',
      userEmail: 'nikshanbhag@gmail.com',
    }));
  });

  it('renders ActionClient when user IS a tenant member', async () => {
    mockChain([
      outboxFound,
      { table: 'tenant_members', method: 'maybeSingle', resolve: { data: { id: 'm1', role: 'OWNER' }, error: null } },
    ]);

    const result = await ActionPageLoader({ actionId: 'o1' });

    // Should render ActionClient (not ActionNotFound)
    expect(result?.type?.toString()).not.toMatch(/ActionNotFound/);
    expect(mockServerLoggerSystem).toHaveBeenCalledWith('INFO', 'WhatsApp', 'Action page — user authorized', expect.objectContaining({
      actionId: 'o1',
      role: 'OWNER',
    }));
  });

  it('shows completed screen when outbox status is COMPLETED', async () => {
    mockChain([
      { ...outboxFound, resolve: { data: { ...outboxFound.resolve.data, status: 'COMPLETED' }, error: null } },
      { table: 'tenant_members', method: 'maybeSingle', resolve: { data: { id: 'm1', role: 'OWNER' }, error: null } },
    ]);

    const result = await ActionPageLoader({ actionId: 'o1' });

    const rendered = typeof result?.type === 'function' ? result?.type?.name || '' : String(result?.type || '');
    expect(rendered).not.toMatch(/ActionNotFound/);
  });
});

describe('ActionPage: module exports', () => {
  it('exports the expected symbols', async () => {
    const mod = await import('@/app/action/[actionId]/page');
    expect(mod).toHaveProperty('generateMetadata');
    expect(mod).toHaveProperty('default');
    expect(mod).toHaveProperty('ActionPageLoader');
    expect(mod).toHaveProperty('ActionNotFound');
  });
});
