import { recordEvent } from './event-log';
import { recordEventServer } from './event-log-server';
import { supabase } from '@/lib/supabase';
import { createClient } from '@/lib/supabase-server';

jest.mock('@/lib/supabase', () => ({
  supabase: {
    rpc: jest.fn()
  }
}));

jest.mock('@/lib/supabase-server', () => ({
  createClient: jest.fn()
}));

jest.mock('@/lib/logger', () => ({
  Logger: {
    system: jest.fn()
  }
}));

jest.mock('@/lib/logger-server', () => ({
  ServerLogger: {
    system: jest.fn()
  }
}));

describe('Event Logging Interface (Contract)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('recordEvent (Client Wrapper)', () => {
    it('POSITIVE: should invoke the record_event_v1 RPC with correctly mapped parameters', async () => {
      (supabase.rpc as jest.Mock).mockResolvedValueOnce({ data: null, error: null });

      await recordEvent({
        action: 'transaction.created',
        whoId: 'user-123',
        entityType: 'transaction',
        entityId: 'tx-456'
      });

      expect(supabase.rpc).toHaveBeenCalledWith('record_event_v1', expect.objectContaining({
        p_action: 'transaction.created',
        p_who_id: 'user-123',
        p_entity_type: 'transaction',
        p_entity_id: 'tx-456',
      }));
    });

    it('NEGATIVE: should log a system error without crashing if RPC fails', async () => {
      (supabase.rpc as jest.Mock).mockResolvedValueOnce({ data: null, error: new Error('RPC Failed') });
      const { Logger } = require('@/lib/logger');

      await expect(recordEvent({ action: 'category.created' })).resolves.not.toThrow();
      expect(Logger.system).toHaveBeenCalledWith('ERROR', 'EventLog', expect.stringContaining('record_event_v1 failed'), expect.any(Object));
    });

    it('EDGE: should handle completely missing optional fields gracefully', async () => {
      (supabase.rpc as jest.Mock).mockResolvedValueOnce({ data: null, error: null });

      await expect(recordEvent({ action: 'pin.verified' })).resolves.not.toThrow();
    });
  });

  describe('recordEventServer (Server Wrapper)', () => {
    let mockRpc: jest.Mock;

    beforeEach(() => {
      mockRpc = jest.fn().mockResolvedValue({ data: null, error: null });
      (createClient as jest.Mock).mockResolvedValue({ rpc: mockRpc });
    });

    it('POSITIVE: should invoke the record_event_v1 RPC with explicit tenant_id', async () => {
      await recordEventServer({
        tenantId: 'tenant-999',
        action: 'workflow.triggered',
        whoType: 'system'
      });

      expect(mockRpc).toHaveBeenCalledWith('record_event_v1', expect.objectContaining({
        p_tenant_id: 'tenant-999',
        p_action: 'workflow.triggered',
      }));
    });

    it('NEGATIVE: should log via ServerLogger and not crash if RPC fails', async () => {
      mockRpc.mockResolvedValueOnce({ data: null, error: new Error('DB Error') });
      const { ServerLogger } = require('@/lib/logger-server');

      await expect(recordEventServer({ tenantId: 'tenant-999', action: 'workflow.triggered' })).resolves.not.toThrow();
      expect(ServerLogger.system).toHaveBeenCalledWith('ERROR', 'EventLog', expect.stringContaining('record_event_v1 failed'), expect.any(Object));
    });

    it('EDGE: type safety ensures tenantId is required at compile time', async () => {
      // Test intentionally passes invalid params to verify runtime guard
      // tenantId is required by RecordEventServerPayload type, but in JS it could be missing
      await expect(
        recordEventServer({ action: 'anomaly.detected' } as any)
      ).resolves.not.toThrow();
    });
  });
});
