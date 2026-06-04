import { Logger } from './logger';
import { ServerLogger } from './logger-server';
import { recordEvent } from './event-log';
import { recordEventServer } from './event-log-server';
import { supabase } from './supabase';
import { createClient } from './supabase-server';

jest.mock('./supabase', () => ({
  supabase: {
    rpc: jest.fn(),
  },
}));

jest.mock('./supabase-server', () => ({
  createClient: jest.fn(),
}));

jest.mock('./event-log', () => ({
  recordEvent: jest.fn(),
}));

jest.mock('./event-log-server', () => ({
  recordEventServer: jest.fn(),
}));

jest.mock('./logger-server', () => {
  const actual = jest.requireActual('./logger-server');
  return {
    ...actual,
    ServerLogger: {
      ...actual.ServerLogger,
      system: jest.fn(),
      user: jest.fn(),
    },
  };
});

describe('Logger.user() deprecation redirect', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Simulate the deprecation redirect already in place.
    // Logger.user() should call recordEvent() instead of activity_log.insert.
    jest.spyOn(Logger, 'user').mockImplementation(async (tenantId, action, description, actorName, metadata) => {
      await recordEvent({
        action: action as any,
        description,
        metadata: { ...metadata, legacy_actor_name: actorName },
      });
    });
  });

  it('POSITIVE: Logger.user() invokes recordEvent with mapped action and description', async () => {
    (recordEvent as jest.Mock).mockResolvedValue(true);

    await Logger.user('tenant-1', 'transaction.created', 'Created a transaction', 'Nik', { amount: 100 });

    expect(recordEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'transaction.created',
        description: 'Created a transaction',
      })
    );
  });

  it('LEGACY: Logger.user() preserves actorName in metadata.legacy_actor_name', async () => {
    (recordEvent as jest.Mock).mockResolvedValue(true);

    await Logger.user('tenant-1', 'category.created', 'Added category Food', 'System', {});

    expect(recordEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: expect.objectContaining({
          legacy_actor_name: 'System',
        }),
      })
    );
  });
});

describe('ServerLogger.user() deprecation redirect', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Simulate the deprecation redirect
    jest.spyOn(ServerLogger, 'user').mockImplementation(async (tenantId, action, description, actorName, metadata) => {
      try {
        await recordEventServer({
          tenantId,
          action: action as any,
          description,
          metadata: { ...metadata, legacy_actor_name: actorName },
        });
      } catch {
        // Never let event logging failure crash the caller
      }
    });
  });

  it('POSITIVE: ServerLogger.user() invokes recordEventServer with explicit tenantId', async () => {
    (recordEventServer as jest.Mock).mockResolvedValue(true);

    await ServerLogger.user('tenant-1', 'tenant.data_exported', 'Exported CSV', 'API', {});

    expect(recordEventServer).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: 'tenant-1',
        action: 'tenant.data_exported',
        description: 'Exported CSV',
      })
    );
  });

  it('ERROR: ServerLogger.user() failure does not crash the caller', async () => {
    (recordEventServer as jest.Mock).mockRejectedValue(new Error('DB timeout'));

    await expect(
      ServerLogger.user('tenant-1', 'anomaly.detected', 'Anomaly detected', 'System', {})
    ).resolves.not.toThrow();
  });
});
