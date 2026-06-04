/**
 * Phase 2c Contract Tests: export/route.ts event-log wiring
 * Proves recordEventServer is called with tenant.data_exported
 */

jest.mock('@/lib/event-log-server', () => ({
  recordEventServer: jest.fn().mockResolvedValue(true),
}));
jest.mock('@/lib/logger-server', () => ({
  ServerLogger: { system: jest.fn() },
}));

const mockSelect = jest.fn().mockReturnThis();
const mockEq = jest.fn().mockReturnThis();
const mockOrder = jest.fn().mockResolvedValue({ data: [{ id: 1 }], error: null });

jest.mock('@/lib/supabase-server', () => ({
  createClient: jest.fn(() => Promise.resolve({
    from: jest.fn(() => ({
      select: mockSelect,
      eq: mockEq,
      order: mockOrder,
    })),
  })),
}));

// Mock withTestHandler since we just want to test the inner logic
jest.mock('@/lib/withTestHandler', () => ({
  withTestHandler: (handler: any) => handler,
}));

import { GET } from './route';
import { recordEventServer } from '@/lib/event-log-server';

describe('export/route — Event Log Wiring (Contract)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockOrder.mockResolvedValue({ data: [{ date: '2025-01-01' }], error: null });
  });

  it('POSITIVE: calls recordEventServer with tenant.data_exported on successful export', async () => {
    const req = new Request('https://app/api/export?format=csv');
    const context = { auth: { tenantId: 'tenant-abc' } };
    
    // The exported GET is the unwrapped handler because of our mock
    await (GET as any)(req, context);

    expect(recordEventServer).toHaveBeenCalledWith(expect.objectContaining({
      action: 'tenant.data_exported',
      tenantId: 'tenant-abc',
      whoType: 'user', // Default for standard API routes
    }));
  });

  it('NEGATIVE: does NOT call recordEventServer if DB query fails', async () => {
    mockOrder.mockResolvedValueOnce({ data: null, error: new Error('DB Error') });
    
    const req = new Request('https://app/api/export?format=csv');
    const context = { auth: { tenantId: 'tenant-abc' } };
    
    await (GET as any)(req, context);

    expect(recordEventServer).not.toHaveBeenCalled();
  });
});
