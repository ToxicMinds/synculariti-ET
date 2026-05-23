export async function verifyWebhookSignature(payload: string, signature: string, secret: string): Promise<boolean> {
  try {
    const encoder = new TextEncoder();
    const key = await globalThis.crypto.subtle.importKey(
      'raw',
      encoder.encode(secret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['verify']
    );

    // Assuming signature is a hex string
    const sigBytes = new Uint8Array(signature.match(/[\da-f]{2}/gi)?.map(h => parseInt(h, 16)) || []);
    
    return await globalThis.crypto.subtle.verify(
      'HMAC',
      key,
      sigBytes,
      encoder.encode(payload)
    );
  } catch (e) {
    return false;
  }
}
