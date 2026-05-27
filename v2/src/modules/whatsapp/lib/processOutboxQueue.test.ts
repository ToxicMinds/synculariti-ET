import { processOutboxQueue } from './processOutboxQueue';

const mockSendText = jest.fn();
const mockFrom = jest.fn();
const mockRpc = jest.fn();
const mockOrder = jest.fn();
const mockLimit = jest.fn();
const mockIn = jest.fn();
const mockSelect = jest.fn();

jest.mock('@synculariti/whatsapp-client', () => ({
  OpenWAClient: jest.fn(() => ({
    sendText: mockSendText,
  })),
}));

jest.mock('@/lib/logger-server', () => ({
  ServerLogger: { system: jest.fn(), user: jest.fn() },
}));

function makeClient() {
  return { sendText: mockSendText } as any;
}

function makeSupabase() {
  return {
    rpc: mockRpc,
    from: jest.fn((table: string) => {
      if (table === 'whatsapp_outbox') {
        return {
          select: mockSelect,
          in: mockIn,
          order: mockOrder,
          limit: mockLimit,
        };
      }
      return {};
    }),
  };
}

function makeTextRecord(overrides: Record<string, unknown> = {}) {
  return {
    id: 'outbox-text-1',
    tenant_id: 'tenant-123',
    recipient_phone: '421901234567',
    payload: { type: 'text', text: 'Hello from test' },
    ...overrides,
  };
}

function makePollRecord(overrides: Record<string, unknown> = {}) {
  return {
    id: 'outbox-poll-1',
    tenant_id: 'tenant-123',
    recipient_phone: '421901234567',
    payload: {
      type: 'poll',
      name: 'Approve?',
      options: ['Yes', 'No'],
      metadata: { invoiceId: 'inv-001' },
    },
    ...overrides,
  };
}

describe('processOutboxQueue', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('record claiming via RPC', () => {
    it('should claim records via RPC and process text messages successfully', async () => {
      const supabase = makeSupabase() as unknown as ReturnType<typeof makeSupabase>;
      mockRpc.mockResolvedValue({ data: [makeTextRecord()], error: null });
      mockSendText.mockResolvedValue(true);

      const result = await processOutboxQueue(supabase as any, makeClient(), 'https://app.com');

      expect(result).toEqual({ processed: 1, failed: 0 });
      expect(mockRpc).toHaveBeenCalledWith('claim_whatsapp_outbox_batch', { p_batch_size: 10 });
      expect(mockSendText).toHaveBeenCalledWith('421901234567@c.us', 'Hello from test');
      expect(mockRpc).toHaveBeenCalledWith('set_outbox_delivery_result_v1', { p_outbox_id: 'outbox-text-1', p_success: true });
    });

    it('should fall back to direct SELECT when RPC returns no data', async () => {
      const supabase = makeSupabase() as unknown as ReturnType<typeof makeSupabase>;
      mockRpc.mockResolvedValue({ data: null, error: null });
      mockSelect.mockReturnThis();
      mockIn.mockReturnThis();
      mockOrder.mockReturnThis();
      mockLimit.mockResolvedValue({ data: [makeTextRecord()], error: null });
      mockSendText.mockResolvedValue(true);

      const result = await processOutboxQueue(supabase as any, makeClient(), 'https://app.com');

      expect(result).toEqual({ processed: 1, failed: 0 });
      expect(mockSelect).toHaveBeenCalledWith('*');
      expect(mockIn).toHaveBeenCalledWith('status', ['PENDING', 'FAILED']);
    });

    it('should return zero counts when no records are pending', async () => {
      const supabase = makeSupabase() as unknown as ReturnType<typeof makeSupabase>;
      mockRpc.mockResolvedValue({ data: [], error: null });
      mockSelect.mockReturnThis();
      mockIn.mockReturnThis();
      mockOrder.mockReturnThis();
      mockLimit.mockResolvedValue({ data: [], error: null });

      const result = await processOutboxQueue(supabase as any, makeClient(), 'https://app.com');

      expect(result).toEqual({ processed: 0, failed: 0 });
    });
  });

  describe('explicit records', () => {
    it('should process records passed explicitly (bypass claiming)', async () => {
      const supabase = makeSupabase() as unknown as ReturnType<typeof makeSupabase>;
      mockSendText.mockResolvedValue(true);

      const result = await processOutboxQueue(
        supabase as any, makeClient(), 'https://app.com',
        [makeTextRecord()]
      );

      expect(result).toEqual({ processed: 1, failed: 0 });
      // Claiming is skipped for explicit records, but delivery result RPC is called
      expect(mockRpc).toHaveBeenCalledWith('set_outbox_delivery_result_v1', { p_outbox_id: 'outbox-text-1', p_success: true });
    });

    it('should process poll records as action-link text fallback', async () => {
      const supabase = makeSupabase() as unknown as ReturnType<typeof makeSupabase>;
      mockSendText.mockResolvedValue(true);

      const result = await processOutboxQueue(
        supabase as any, makeClient(), 'https://app.com',
        [makePollRecord()]
      );

      expect(result).toEqual({ processed: 1, failed: 0 });
      const sentText = mockSendText.mock.calls[0][1];
      expect(sentText).toContain('Approve?');
      expect(sentText).toContain('1. Yes');
      expect(sentText).toContain('2. No');
      expect(sentText).toContain('https://app.com/action/outbox-poll-1');
    });
  });

  describe('error handling', () => {
    it('should mark as FAILED when sendText returns false', async () => {
      const supabase = makeSupabase() as unknown as ReturnType<typeof makeSupabase>;
      mockSendText.mockResolvedValue(false);

      const result = await processOutboxQueue(
        supabase as any, makeClient(), 'https://app.com',
        [makeTextRecord()]
      );

      expect(result).toEqual({ processed: 0, failed: 1 });
      expect(mockRpc).toHaveBeenCalledWith('set_outbox_delivery_result_v1', { p_outbox_id: 'outbox-text-1', p_success: false });
    });

    it('should mark as FAILED when sendText throws', async () => {
      const supabase = makeSupabase() as unknown as ReturnType<typeof makeSupabase>;
      mockSendText.mockRejectedValue(new Error('Network error'));

      const result = await processOutboxQueue(
        supabase as any, makeClient(), 'https://app.com',
        [makeTextRecord()]
      );

      expect(result).toEqual({ processed: 0, failed: 1 });
      expect(mockRpc).toHaveBeenCalledWith('set_outbox_delivery_result_v1', { p_outbox_id: 'outbox-text-1', p_success: false });
    });

    it('should handle unknown payload type gracefully (no-op)', async () => {
      const supabase = makeSupabase() as unknown as ReturnType<typeof makeSupabase>;

      const result = await processOutboxQueue(
        supabase as any, makeClient(), 'https://app.com',
        [{ ...makeTextRecord(), payload: { type: 'unknown' } }]
      );

      expect(result).toEqual({ processed: 0, failed: 1 });
    });

    it('should skip text records with no text field', async () => {
      const supabase = makeSupabase() as unknown as ReturnType<typeof makeSupabase>;

      const result = await processOutboxQueue(
        supabase as any, makeClient(), 'https://app.com',
        [{ ...makeTextRecord(), payload: { type: 'text', text: null } }]
      );

      expect(result).toEqual({ processed: 0, failed: 1 });
    });

    it('should skip poll records with no name or options', async () => {
      const supabase = makeSupabase() as unknown as ReturnType<typeof makeSupabase>;

      const result = await processOutboxQueue(
        supabase as any, makeClient(), 'https://app.com',
        [{ ...makePollRecord(), payload: { type: 'poll', name: null, options: null } }]
      );

      expect(result).toEqual({ processed: 0, failed: 1 });
    });

    it('should continue processing remaining records after one failure', async () => {
      const supabase = makeSupabase() as unknown as ReturnType<typeof makeSupabase>;
      mockSendText
        .mockRejectedValueOnce(new Error('First fails'))
        .mockResolvedValueOnce(true);

      const result = await processOutboxQueue(
        supabase as any, makeClient(), 'https://app.com',
        [makeTextRecord({ id: 'outbox-1' }), makeTextRecord({ id: 'outbox-2' })]
      );

      expect(result).toEqual({ processed: 1, failed: 1 });
    });
  });
});