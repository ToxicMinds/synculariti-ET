/**
 * Phase 2c Contract Tests: notify/route.ts & notifyLargeInvoice.ts event-log wiring
 * Proves recordEventServer is called with whatsapp.notification.sent
 */

jest.mock('@/lib/event-log-server', () => ({
  recordEventServer: jest.fn().mockResolvedValue(true),
}));
jest.mock('@/lib/logger-server', () => ({
  ServerLogger: { system: jest.fn() },
}));
jest.mock('@/lib/logger', () => ({
  Logger: { system: jest.fn(), user: jest.fn() },
}));

const mockRpc = jest.fn();
const mockSelect = jest.fn().mockReturnThis();
const mockEq = jest.fn().mockReturnThis();
const mockSingle = jest.fn();
const mockMaybeSingle = jest.fn();

jest.mock('@/lib/supabase-server', () => ({
  createServiceClient: jest.fn(() => ({
    rpc: mockRpc,
    from: jest.fn(() => ({
      select: mockSelect,
      eq: mockEq,
      single: mockSingle,
      maybeSingle: mockMaybeSingle,
    })),
  })),
  createClient: jest.fn(() => Promise.resolve({
    rpc: mockRpc,
    from: jest.fn(() => ({
      select: mockSelect,
      eq: mockEq,
      single: mockSingle,
    })),
  })),
}));

import { POST } from './route';
import { notifyLargeInvoice } from '@/actions/notifyLargeInvoice';
import { recordEventServer } from '@/lib/event-log-server';

describe('WhatsApp Notify Logic — Event Log Wiring (Contract)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRpc.mockResolvedValue({ data: null, error: null });
    mockSingle.mockResolvedValue({ data: { id: 'key-1', tenant_id: 'tenant-abc' }, error: null });
    mockMaybeSingle.mockResolvedValue({ data: null, error: null }); // No idempotency hit
  });

  describe('API Route (notify/route.ts)', () => {
    it('POSITIVE: calls recordEventServer with whatsapp.notification.sent when queued successfully', async () => {
      const req = new Request('https://app/api/whatsapp/notify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': 'valid-key' },
        body: JSON.stringify({
          recipientPhone: '+421900000000',
          payload: { type: 'text', text: 'Hello API' },
        }),
      });

      await POST(req);

      expect(recordEventServer).toHaveBeenCalledWith(expect.objectContaining({
        action: 'whatsapp.notification.sent',
        tenantId: 'tenant-abc',
        whoType: 'system',
        metadata: expect.objectContaining({
          recipientPhone: '+421900000000',
          type: 'text',
        }),
      }));
    });

    it('NEGATIVE: does NOT call recordEventServer if API key is invalid', async () => {
      mockSingle.mockResolvedValueOnce({ data: null, error: new Error('Not found') }); // API key lookup fails

      const req = new Request('https://app/api/whatsapp/notify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': 'invalid-key' },
        body: JSON.stringify({
          recipientPhone: '+421900000000',
          payload: { type: 'text', text: 'Hello API' },
        }),
      });

      await POST(req);

      expect(recordEventServer).not.toHaveBeenCalled();
    });
    
    it('NEGATIVE: does NOT call recordEventServer if idempotency key matches existing', async () => {
      // Simulate idempotency hit
      mockMaybeSingle.mockResolvedValueOnce({ data: { id: 'existing-outbox-id' }, error: null });

      const req = new Request('https://app/api/whatsapp/notify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': 'valid-key' },
        body: JSON.stringify({
          recipientPhone: '+421900000000',
          idempotencyKey: 'idemp-123',
          payload: { type: 'text', text: 'Hello API' },
        }),
      });

      await POST(req);

      expect(recordEventServer).not.toHaveBeenCalled();
    });
  });

  describe('Server Action (notifyLargeInvoice.ts)', () => {
    it('POSITIVE: calls recordEventServer with whatsapp.notification.sent when queued successfully', async () => {
      // Mock tenant config
      mockSingle.mockResolvedValueOnce({ data: { config: { phones: { owner: '+421911111111' } } }, error: null });

      await notifyLargeInvoice('tenant-abc', [{ amount: 1000, description: 'Big purchase' }]);

      expect(recordEventServer).toHaveBeenCalledWith(expect.objectContaining({
        action: 'whatsapp.notification.sent',
        tenantId: 'tenant-abc',
        whoType: 'system',
        metadata: expect.objectContaining({
          recipientPhone: '+421911111111',
          source: 'large_invoice_auto',
        }),
      }));
    });

    it('NEGATIVE: does NOT call recordEventServer if no items are large enough', async () => {
      await notifyLargeInvoice('tenant-abc', [{ amount: 50, description: 'Small purchase' }]);

      expect(recordEventServer).not.toHaveBeenCalled();
    });
    
    it('NEGATIVE: does NOT call recordEventServer if owner phone is not configured', async () => {
      // Mock missing tenant config
      mockSingle.mockResolvedValueOnce({ data: { config: {} }, error: null });

      await notifyLargeInvoice('tenant-abc', [{ amount: 1000, description: 'Big purchase' }]);

      expect(recordEventServer).not.toHaveBeenCalled();
    });
  });
});
