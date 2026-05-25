import { signHmacPayload } from './hmac';

export interface OutboundContext {
  whatsappMessageId: string;
  outboxId: string;
  tenantId: string;
  webhookUrl: string;
  phoneNumber: string;
  timestamp: number;
}

export interface ISessionCache {
  setContext(messageId: string, context: OutboundContext): void;
  getContextByMessageId(messageId: string): OutboundContext | undefined;
  getLastContextByPhone(phoneNumber: string): OutboundContext | undefined;
  evictExpired(): void;
}

export class SessionCache implements ISessionCache {
  private messageMap: Map<string, OutboundContext>;

  constructor() {
    this.messageMap = new Map();
  }

  setContext(messageId: string, context: OutboundContext): void {
    this.messageMap.set(messageId, context);
  }

  getContextByMessageId(messageId: string): OutboundContext | undefined {
    return this.messageMap.get(messageId);
  }

  getLastContextByPhone(phoneNumber: string): OutboundContext | undefined {
    let latest: OutboundContext | undefined;
    for (const context of this.messageMap.values()) {
      if (context.phoneNumber === phoneNumber) {
        if (!latest || context.timestamp > latest.timestamp) {
          latest = context;
        }
      }
    }
    return latest;
  }

  evictExpired(): void {
    const now = Date.now();
    const TTL = 24 * 60 * 60 * 1000; // 24 hours in milliseconds

    for (const [messageId, context] of this.messageMap.entries()) {
      if (now - context.timestamp > TTL) {
        this.messageMap.delete(messageId);
      }
    }
  }
}

export class WebhookDispatcher {
  /**
   * Signs and dispatches a secure event to a webhook URL.
   * Uses the shared `signHmacPayload` from @synculariti/whatsapp-client/hmac
   * to guarantee algorithm parity with the Next.js receiver.
   */
  async dispatchSecureEvent(targetUrl: string, payload: Record<string, unknown>, secret: string): Promise<boolean> {
    try {
      const payloadString = JSON.stringify(payload);
      const signature = await signHmacPayload(payloadString, secret);

      const response = await fetch(targetUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-OpenWA-Signature': signature
        },
        body: payloadString
      });

      return response.ok;
    } catch (e: unknown) {
      // Fire-and-forget safety: log but don't crash the calling context
      const msg = e instanceof Error ? e.message : String(e);
      globalThis.console?.error?.('[WebhookDispatcher] dispatch failed:', msg);
      return false;
    }
  }
}
