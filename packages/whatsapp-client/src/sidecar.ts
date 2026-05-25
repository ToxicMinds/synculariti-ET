import { verifyWebhookSignature } from './hmac';

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
   * Generates HMAC-SHA256 signature natively using Web Crypto API.
   * Matches the verification algorithm on the Next.js side.
   */
  private async signPayload(payload: string, secret: string): Promise<string> {
    const encoder = new TextEncoder();
    const key = await globalThis.crypto.subtle.importKey(
      'raw',
      encoder.encode(secret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    );

    const signatureBuf = await globalThis.crypto.subtle.sign(
      'HMAC',
      key,
      encoder.encode(payload)
    );

    // Convert ArrayBuffer to Hex String
    return Array.from(new Uint8Array(signatureBuf))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
  }

  async dispatchSecureEvent(targetUrl: string, payload: any, secret: string): Promise<boolean> {
    try {
      const payloadString = JSON.stringify(payload);
      const signature = await this.signPayload(payloadString, secret);

      const response = await fetch(targetUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-OpenWA-Signature': signature
        },
        body: payloadString
      });

      return response.ok;
    } catch (e) {
      console.error('Webhook dispatch failed:', e);
      return false;
    }
  }
}
