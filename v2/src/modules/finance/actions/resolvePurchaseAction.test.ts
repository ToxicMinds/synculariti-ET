/**
 * Phase 2 Contract Tests: resolvePurchaseAction event-log wiring
 * Proves recordEventServer is called with purchase_quarantine.released/rejected
 */

jest.mock('@/lib/event-log-server', () => ({
  recordEventServer: jest.fn().mockResolvedValue(true)
}));
jest.mock('@/lib/logger-server', () => ({
  ServerLogger: { system: jest.fn() }
}));
jest.mock('next/cache', () => ({
  revalidatePath: jest.fn()
}));

const mockRpc = jest.fn().mockImplementation((name: string) => {
  if (name === 'get_my_tenant') return Promise.resolve({ data: 'tenant-abc', error: null });
  return Promise.resolve({ data: null, error: null });
});
const mockGetUser = jest.fn().mockResolvedValue({ data: { user: { id: 'user-abc' } }, error: null });
jest.mock('@/lib/supabase-server', () => ({
  createClient: jest.fn().mockResolvedValue({
    rpc: mockRpc,
    auth: { getUser: mockGetUser }
  })
}));

import { resolvePurchaseAction } from './resolvePurchaseAction';
import { recordEventServer } from '@/lib/event-log-server';

// Flush all pending microtasks so fire-and-forget void calls resolve
const flushPromises = () => new Promise(resolve => setImmediate(resolve));

describe('resolvePurchaseAction — Event Log Wiring (Contract)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-abc' } }, error: null });
    // Restore per-name routing: get_my_tenant → tenant-abc, everything else → null
    mockRpc.mockImplementation((name: string) => {
      if (name === 'get_my_tenant') return Promise.resolve({ data: 'tenant-abc', error: null });
      return Promise.resolve({ data: null, error: null });
    });
  });

  it('POSITIVE: emits purchase_quarantine.released when decision is RELEASED', async () => {
    await resolvePurchaseAction('purchase-1', 'RELEASED');
    await flushPromises();

    expect(recordEventServer).toHaveBeenCalledWith(expect.objectContaining({
      action: 'purchase_quarantine.released',
      entityId: 'purchase-1',
      entityType: 'purchase',
    }));
  });

  it('POSITIVE: emits purchase_quarantine.rejected when decision is REJECTED', async () => {
    await resolvePurchaseAction('purchase-2', 'REJECTED');
    await flushPromises();

    expect(recordEventServer).toHaveBeenCalledWith(expect.objectContaining({
      action: 'purchase_quarantine.rejected',
      entityId: 'purchase-2',
    }));
  });

  it('NEGATIVE: does NOT emit event when RPC fails', async () => {
    mockRpc.mockResolvedValue({ data: null, error: new Error('DB error') });

    await resolvePurchaseAction('purchase-3', 'RELEASED');

    expect(recordEventServer).not.toHaveBeenCalled();
  });
});
