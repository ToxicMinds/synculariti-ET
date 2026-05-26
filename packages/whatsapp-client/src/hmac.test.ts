import { signHmacPayload, verifyWebhookSignature } from './hmac';

describe('signHmacPayload', () => {
  it('should produce a consistent hex signature for identical inputs', async () => {
    const sig1 = await signHmacPayload('{"hello":"world"}', 'my-secret-key');
    const sig2 = await signHmacPayload('{"hello":"world"}', 'my-secret-key');
    expect(sig1).toBe(sig2);
    expect(sig1).toMatch(/^[a-f0-9]{64}$/);
  });

  it('should produce different signatures for different secrets', async () => {
    const sig1 = await signHmacPayload('payload', 'secret-a');
    const sig2 = await signHmacPayload('payload', 'secret-b');
    expect(sig1).not.toBe(sig2);
  });

  it('should produce different signatures for different payloads', async () => {
    const sig1 = await signHmacPayload('hello', 'secret');
    const sig2 = await signHmacPayload('world', 'secret');
    expect(sig1).not.toBe(sig2);
  });

  it('should handle empty payload', async () => {
    const sig = await signHmacPayload('', 'secret');
    expect(sig).toMatch(/^[a-f0-9]{64}$/);
  });

  it('should handle empty secret', async () => {
    const sig = await signHmacPayload('payload', '');
    expect(sig).toMatch(/^[a-f0-9]{64}$/);
  });

  it('should handle unicode characters', async () => {
    const sig = await signHmacPayload('ľščťžýáíéúäôň€', 'secret');
    expect(sig).toMatch(/^[a-f0-9]{64}$/);
  });
});

describe('verifyWebhookSignature', () => {
  it('should return true for a correctly signed payload', async () => {
    const payload = '{"decision":"Approve"}';
    const secret = 'test-webhook-secret';
    const signature = await signHmacPayload(payload, secret);
    const result = await verifyWebhookSignature(payload, signature, secret);
    expect(result).toBe(true);
  });

  it('should return false for a tampered payload', async () => {
    const secret = 'test-webhook-secret';
    const correctSig = await signHmacPayload('{"decision":"Approve"}', secret);
    const result = await verifyWebhookSignature('{"decision":"Reject"}', correctSig, secret);
    expect(result).toBe(false);
  });

  it('should return false for a wrong secret', async () => {
    const payload = '{"decision":"Approve"}';
    const signature = await signHmacPayload(payload, 'correct-secret');
    const result = await verifyWebhookSignature(payload, signature, 'wrong-secret');
    expect(result).toBe(false);
  });

  it('should return false for a malformed hex signature', async () => {
    const result = await verifyWebhookSignature('payload', 'not-a-hex-string!', 'secret');
    expect(result).toBe(false);
  });

  it('should return false for an empty signature', async () => {
    const result = await verifyWebhookSignature('payload', '', 'secret');
    expect(result).toBe(false);
  });

  it('should return false for an empty payload', async () => {
    const secret = 'secret';
    const sig = await signHmacPayload('something', secret);
    const result = await verifyWebhookSignature('', sig, secret);
    expect(result).toBe(false);
  });

  it('should verify a round-trip with unicode content', async () => {
    const payload = JSON.stringify({ note: 'Ďakujem za objednávku €50' });
    const secret = 'unicode-secret-123';
    const signature = await signHmacPayload(payload, secret);
    const result = await verifyWebhookSignature(payload, signature, secret);
    expect(result).toBe(true);
  });
});