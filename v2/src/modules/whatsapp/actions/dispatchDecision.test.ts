import { dispatchDecision } from './dispatchDecision';
import { createClient } from '@/lib/supabase-server';
import { signHmacPayload } from '@synculariti/whatsapp-client';

jest.mock('@/lib/supabase-server', () => ({
  createClient: jest.fn(),
}));

const mockRpc = jest.fn();
const mockMaybeSingle = jest.fn();

global.fetch = jest.fn();

function mockSupabaseClient() {
  mockRpc.mockReturnValue({ maybeSingle: mockMaybeSingle });
  (createClient as jest.Mock).mockResolvedValue({
    rpc: mockRpc,
  });
}

describe('Server Action: dispatchDecision', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSupabaseClient();
  });

  it('should return error if the RPC returns NOT_FOUND', async () => {
    mockMaybeSingle.mockResolvedValueOnce({
      data: { status: 'NOT_FOUND', webhook_url: null, webhook_secret: null, payload: null },
      error: null,
    });

    const result = await dispatchDecision('invalid-id', 'Approve');

    expect(result.success).toBe(false);
    expect(result.error).toContain('Action not found');
    expect(mockRpc).toHaveBeenCalledWith('complete_whatsapp_action_v1', {
      p_outbox_id: 'invalid-id',
      p_decision: 'Approve',
    });
  });

  it('should return error if the RPC throws a permission/network error', async () => {
    mockMaybeSingle.mockResolvedValueOnce({
      data: null,
      error: { message: 'permission denied for function', hint: null },
    });

    const result = await dispatchDecision('valid-id', 'Approve');

    expect(result.success).toBe(false);
    expect(result.error).toContain('permission denied');
  });

  it('should correctly sign and dispatch the decision via webhook after atomic completion', async () => {
    mockMaybeSingle.mockResolvedValueOnce({
      data: {
        status: 'COMPLETED',
        webhook_url: 'https://finance.synculariti.local/webhook',
        webhook_secret: 'test-secret-123',
        payload: { recipient_phone: '421900123456', tenant_id: 'tenant-1' },
      },
      error: null,
    });

    (global.fetch as jest.Mock).mockResolvedValueOnce({ ok: true });

    const result = await dispatchDecision('valid-id', 'Approve');

    expect(result.success).toBe(true);

    expect(global.fetch).toHaveBeenCalledTimes(1);
    const fetchArgs = (global.fetch as jest.Mock).mock.calls[0];
    expect(fetchArgs[0]).toBe('https://finance.synculariti.local/webhook');
    expect(fetchArgs[1].method).toBe('POST');

    const body = JSON.parse(fetchArgs[1].body);
    expect(body.type).toBe('poll_vote');
    expect(body.outboxId).toBe('valid-id');
    expect(body.decision).toBe('Approve');
    expect(body.recipientPhone).toBe('421900123456');
    expect(body.tenantId).toBe('tenant-1');

    expect(fetchArgs[1].headers['X-OpenWA-Signature']).toBeTruthy();
  });

  it('should still succeed even if the webhook target returns a 500 (best-effort)', async () => {
    mockMaybeSingle.mockResolvedValueOnce({
      data: {
        status: 'COMPLETED',
        webhook_url: 'https://finance.synculariti.local/webhook',
        webhook_secret: 'test-secret-123',
        payload: null,
      },
      error: null,
    });

    (global.fetch as jest.Mock).mockResolvedValueOnce({ ok: false, status: 500 });

    const result = await dispatchDecision('valid-id', 'Approve');

    expect(result.success).toBe(true);
  });
});

describe('dispatchDecision: COMPLETED_SKIP_WEBHOOK', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSupabaseClient();
  });

  it('should return success without calling fetch when status is COMPLETED_SKIP_WEBHOOK', async () => {
    mockMaybeSingle.mockResolvedValueOnce({
      data: {
        status: 'COMPLETED_SKIP_WEBHOOK',
        webhook_url: null,
        webhook_secret: null,
        payload: null,
      },
      error: null,
    });

    const result = await dispatchDecision('already-done-id', 'Approve');

    expect(result.success).toBe(true);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('should return error when RPC returns null data (outbox deleted or not found)', async () => {
    mockMaybeSingle.mockResolvedValueOnce({
      data: null,
      error: null,
    });

    const result = await dispatchDecision('ghost-id', 'Approve');

    expect(result.success).toBe(false);
    expect(result.error).toContain('Action not found');
  });
});
