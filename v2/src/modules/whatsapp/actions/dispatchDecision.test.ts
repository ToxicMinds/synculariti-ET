import { dispatchDecision } from './dispatchDecision';
import { createServerClient } from '@supabase/ssr';
import { verifyWebhookSignature } from '@synculariti/whatsapp-client';

// Mock Supabase SSR client
jest.mock('@supabase/ssr', () => ({
  createServerClient: jest.fn()
}));

// Mock next/headers for server contexts
jest.mock('next/headers', () => ({
  cookies: jest.fn().mockResolvedValue({
    get: jest.fn(),
    set: jest.fn(),
    delete: jest.fn()
  })
}));

// Mock native fetch
global.fetch = jest.fn();

describe('Server Action: dispatchDecision', () => {
  let mockSingle: jest.Mock;
  let mockEq: jest.Mock;
  let mockUpdate: jest.Mock;
  let mockSelect: jest.Mock;
  let mockFrom: jest.Mock;

  beforeEach(() => {
    mockSingle = jest.fn();
    mockEq = jest.fn();
    mockUpdate = jest.fn();
    mockSelect = jest.fn();
    mockFrom = jest.fn();

    const mockQueryBuilder = {
      select: mockSelect.mockReturnThis(),
      update: mockUpdate.mockReturnThis(),
      eq: mockEq.mockReturnThis(),
      single: mockSingle
    };

    mockFrom.mockReturnValue(mockQueryBuilder);
    
    // Setup Supabase mock
    (createServerClient as jest.Mock).mockReturnValue({
      from: mockFrom
    });
  });

  it('should return error if the outbox item does not exist or is not PENDING', async () => {
    mockEq.mockReturnValueOnce({ single: mockSingle.mockResolvedValueOnce({ data: null, error: new Error('Not found') }) });

    const result = await dispatchDecision('invalid-id', 'Approve');

    expect(result.success).toBe(false);
    expect(result.error).toContain('Action not found');
  });

  it('should correctly sign and dispatch the decision to the webhook url, then update status', async () => {
    const mockOutboxRecord = {
      id: 'valid-id',
      status: 'PENDING',
      webhook_url: 'https://finance.synculariti.local/webhook',
      webhook_secret: 'test-secret-123',
      tenant_id: 'tenant-1',
      payload: {
        type: 'action_link',
        title: 'Approve Invoice',
        options: ['Approve', 'Reject']
      }
    };

    mockEq.mockReturnValueOnce({ single: mockSingle.mockResolvedValueOnce({ data: mockOutboxRecord, error: null }) });
    mockEq.mockReturnValueOnce({ data: null, error: null }); // for the update

    (global.fetch as jest.Mock).mockResolvedValueOnce({ ok: true });

    const result = await dispatchDecision('valid-id', 'Approve');

    expect(result.success).toBe(true);
    
    // Verify it called fetch
    expect(global.fetch).toHaveBeenCalledTimes(1);
    const fetchArgs = (global.fetch as jest.Mock).mock.calls[0];
    expect(fetchArgs[0]).toBe('https://finance.synculariti.local/webhook');
    expect(fetchArgs[1].method).toBe('POST');
    
    // Verify the body format is standard inbound event
    const body = JSON.parse(fetchArgs[1].body);
    expect(body.type).toBe('poll_vote');
    expect(body.outboxId).toBe('valid-id');
    expect(body.decision).toBe('Approve');

    // Verify it updated the database to COMPLETED
    expect(mockUpdate).toHaveBeenCalledWith({ status: 'COMPLETED' });
    expect(mockEq).toHaveBeenCalledWith('id', 'valid-id');
  });

  it('should fail gracefully if the webhook target returns a 500', async () => {
    const mockOutboxRecord = {
      id: 'valid-id',
      status: 'PENDING',
      webhook_url: 'https://finance.synculariti.local/webhook',
      webhook_secret: 'test-secret-123'
    };

    mockEq.mockReturnValueOnce({ single: mockSingle.mockResolvedValueOnce({ data: mockOutboxRecord, error: null }) });

    // Force fetch to fail
    (global.fetch as jest.Mock).mockResolvedValueOnce({ ok: false, status: 500 });

    const result = await dispatchDecision('valid-id', 'Approve');

    expect(result.success).toBe(false);
    expect(result.error).toContain('Webhook delivery failed');
    
    // Database should NOT be updated to COMPLETED if delivery failed
    expect(mockUpdate).not.toHaveBeenCalled();
  });
});
