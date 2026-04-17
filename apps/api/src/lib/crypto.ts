/**
 * AES-GCM encrypt/decrypt for storing user API keys in D1.
 * Uses Web Crypto API (available in Cloudflare Workers).
 *
 * Stored format: base64(iv[12 bytes] + ciphertext)
 */

function requireEncryptionSecret(secret: string | undefined): string {
  if (!secret) {
    throw new Error('KEY_ENCRYPTION_SECRET is required to encrypt or decrypt user API keys');
  }

  return secret;
}

async function deriveKey(secret: string): Promise<CryptoKey> {
  if (!/^[0-9a-fA-F]{64}$/.test(secret)) {
    throw new Error('KEY_ENCRYPTION_SECRET must be a 64-character hex string (32 bytes)');
  }
  const raw = new Uint8Array(
    secret.match(/.{2}/g)!.map((h) => parseInt(h, 16))
  );
  return crypto.subtle.importKey('raw', raw, { name: 'AES-GCM' }, false, [
    'encrypt',
    'decrypt',
  ]);
}

export async function encryptKey(
  plaintext: string,
  secret: string | undefined
): Promise<string> {
  const key = await deriveKey(requireEncryptionSecret(secret));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const enc = new TextEncoder();
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    enc.encode(plaintext)
  );
  const buf = new Uint8Array(12 + ciphertext.byteLength);
  buf.set(iv, 0);
  buf.set(new Uint8Array(ciphertext), 12);
  return btoa(String.fromCharCode(...buf));
}

/**
 * Decrypt a value previously encrypted with encryptKey.
 * @throws {DOMException} OperationError if the key is wrong or ciphertext is corrupted.
 */
export async function decryptKey(
  stored: string,
  secret: string | undefined
): Promise<string> {
  const key = await deriveKey(requireEncryptionSecret(secret));
  const buf = Uint8Array.from(atob(stored), (c) => c.charCodeAt(0));
  const iv = buf.slice(0, 12);
  const ciphertext = buf.slice(12);
  const dec = new TextDecoder();
  const plain = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv },
    key,
    ciphertext
  );
  return dec.decode(plain);
}
