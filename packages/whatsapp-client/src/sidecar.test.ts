import { SessionCache, WebhookDispatcher, OutboundContext } from './sidecar';
import { verifyWebhookSignature } from './hmac';

// We mock fetch for the Dispatcher
global.fetch = jest.fn();

describe('Sidecar SessionCache Contract', () => {
  let cache: SessionCache;

  beforeEach(() => {
    cache = new SessionCache();
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('should store and retrieve context by message ID', () => {
    const ctx: OutboundContext = {
      whatsappMessageId: 'msg-123',
      outboxId: 'outbox-456',
      tenantId: 'tenant-789',
      webhookUrl: 'https://test.com/webhook',
      phoneNumber: '421951153761',
      timestamp: Date.now()
    };

    cache.setContext('msg-123', ctx);

    const retrieved = cache.getContextByMessageId('msg-123');
    expect(retrieved).toBeDefined();
    expect(retrieved?.outboxId).toBe('outbox-456');
  });

  it('should retrieve the last known context by phone number', () => {
    const ctx1: OutboundContext = {
      whatsappMessageId: 'msg-1',
      outboxId: 'outbox-1',
      tenantId: 'tenant-1',
      webhookUrl: 'https://test.com/webhook',
      phoneNumber: '421951153761',
      timestamp: Date.now() - 5000 // Older
    };

    const ctx2: OutboundContext = {
      whatsappMessageId: 'msg-2',
      outboxId: 'outbox-2',
      tenantId: 'tenant-2',
      webhookUrl: 'https://test.com/webhook2',
      phoneNumber: '421951153761',
      timestamp: Date.now() // Newer
    };

    cache.setContext('msg-1', ctx1);
    cache.setContext('msg-2', ctx2);

    // Should return the most recent context for this phone number
    const retrieved = cache.getLastContextByPhone('421951153761');
    expect(retrieved?.whatsappMessageId).toBe('msg-2');
    expect(retrieved?.webhookUrl).toBe('https://test.com/webhook2');
  });

  it('should automatically evict expired records (older than 24 hours)', () => {
    const now = Date.now();
    const expiredCtx: OutboundContext = {
      whatsappMessageId: 'msg-old',
      outboxId: 'outbox-old',
      tenantId: 'tenant-old',
      webhookUrl: 'https://test.com/webhook',
      phoneNumber: '421951153761',
      timestamp: now - (25 * 60 * 60 * 1000) // 25 hours ago
    };

    const validCtx: OutboundContext = {
      whatsappMessageId: 'msg-new',
      outboxId: 'outbox-new',
      tenantId: 'tenant-new',
      webhookUrl: 'https://test.com/webhook',
      phoneNumber: '421951153761',
      timestamp: now - (1 * 60 * 60 * 1000) // 1 hour ago
    };

    cache.setContext('msg-old', expiredCtx);
    cache.setContext('msg-new', validCtx);

    cache.evictExpired();

    expect(cache.getContextByMessageId('msg-old')).toBeUndefined();
    expect(cache.getContextByMessageId('msg-new')).toBeDefined();
  });
});

describe('Sidecar WebhookDispatcher Contract', () => {
  let dispatcher: WebhookDispatcher;

  beforeEach(() => {
    dispatcher = new WebhookDispatcher();
    jest.clearAllMocks();
  });

  it('should dispatch secure event with valid HMAC-SHA256 signature', async () => {
    const targetUrl = 'https://synculariti.com/api/whatsapp/webhook';
    const payload = { type: 'text', text: 'Hello' };
    const secret = 'super-secret-key';

    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      status: 200
    });

    const success = await dispatcher.dispatchSecureEvent(targetUrl, payload, secret);

    expect(success).toBe(true);
    expect(global.fetch).toHaveBeenCalledTimes(1);
    
    const callArgs = (global.fetch as jest.Mock).mock.calls[0];
    expect(callArgs[0]).toBe(targetUrl);
    expect(callArgs[1].method).toBe('POST');
    
    // Check that headers contain the signature
    const headers = callArgs[1].headers;
    expect(headers['X-OpenWA-Signature']).toBeDefined();
    expect(headers['Content-Type']).toBe('application/json');

    // Verify the signature is actually valid against the payload
    const signature = headers['X-OpenWA-Signature'];
    const isValid = await verifyWebhookSignature(JSON.stringify(payload), signature, secret);
    expect(isValid).toBe(true);
  });

  it('should return false if the webhook target fails', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: false,
      status: 500
    });

    const success = await dispatcher.dispatchSecureEvent(
      'https://synculariti.com/fail',
      { type: 'test' },
      'secret'
    );

    expect(success).toBe(false);
  });
});
