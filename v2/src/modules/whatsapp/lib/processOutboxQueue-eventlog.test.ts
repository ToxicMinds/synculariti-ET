/**
 * processOutboxQueue — Event Log Wiring (Contract)
 * Extends the existing test suite to prove recordEventServer is called
 * for whatsapp.delivered and whatsapp.delivery_failed events.
 */

// Must declare mocks before imports
jest.mock('@/lib/event-log-server', () => ({
  recordEventServer: jest.fn().mockResolvedValue(true)
}));
jest.mock('@synculariti/whatsapp-client', () => ({
  OpenWAClient: jest.fn(() => ({ sendText: mockSendText })),
}));
jest.mock('@/lib/logger-server', () => ({
  ServerLogger: { system: jest.fn() },
}));

// Hoisted mock fn (referenced in jest.mock factory above)
const mockSendText = jest.fn();
const mockRpc = jest.fn();
const mockUpdate = jest.fn();
const mockEq = jest.fn();

import { processOutboxQueue } from './processOutboxQueue';
import { recordEventServer } from '@/lib/event-log-server';

function makeSupabase() {
  return {
    rpc: mockRpc,
    from: jest.fn(() => ({
      select: jest.fn().mockReturnThis(),
      in: jest.fn().mockReturnThis(),
      order: jest.fn().mockReturnThis(),
      limit: jest.fn().mockResolvedValue({ data: [], error: null }),
      update: mockUpdate,
    })),
  };
}

function makeTextRecord(overrides: Record<string, unknown> = {}) {
  return {
    id: 'outbox-1',
    tenant_id: 'tenant-abc',
    recipient_phone: '421901234567',
    payload: { type: 'text', text: 'Hello' },
    ...overrides,
  };
}

describe('processOutboxQueue — Event Log Wiring (Contract)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUpdate.mockReturnValue({ eq: mockEq });
    mockEq.mockResolvedValue({ data: null, error: null });
    // Default: delivery result RPC succeeds
    mockRpc.mockResolvedValue({ data: null, error: null });
  });

  it('POSITIVE: calls recordEventServer with whatsapp.delivered on successful sendText', async () => {
    mockSendText.mockResolvedValue(true);
    const supabase = makeSupabase();

    await processOutboxQueue(supabase as any, { sendText: mockSendText } as any, 'https://app.com', [makeTextRecord()]);

    expect(recordEventServer).toHaveBeenCalledWith(expect.objectContaining({
      action: 'whatsapp.delivered',
      tenantId: 'tenant-abc',
      entityId: 'outbox-1',
    }));
  });

  it('NEGATIVE: calls recordEventServer with whatsapp.delivery_failed when sendText returns false', async () => {
    mockSendText.mockResolvedValue(false);
    const supabase = makeSupabase();

    await processOutboxQueue(supabase as any, { sendText: mockSendText } as any, 'https://app.com', [makeTextRecord()]);

    expect(recordEventServer).toHaveBeenCalledWith(expect.objectContaining({
      action: 'whatsapp.delivery_failed',
      tenantId: 'tenant-abc',
      entityId: 'outbox-1',
    }));
  });

  it('NEGATIVE: calls recordEventServer with whatsapp.delivery_failed when sendText throws', async () => {
    mockSendText.mockRejectedValue(new Error('Network timeout'));
    const supabase = makeSupabase();

    await processOutboxQueue(supabase as any, { sendText: mockSendText } as any, 'https://app.com', [makeTextRecord()]);

    expect(recordEventServer).toHaveBeenCalledWith(expect.objectContaining({
      action: 'whatsapp.delivery_failed',
    }));
  });
});
