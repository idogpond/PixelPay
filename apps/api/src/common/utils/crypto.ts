import * as crypto from 'crypto';

export function hmacSha256(secret: string, data: string): string {
  return crypto.createHmac('sha256', secret).update(data).digest('hex');
}

export function verifyHmacSha256(secret: string, data: string, signature: string): boolean {
  const expected = hmacSha256(secret, data);
  try {
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
  } catch {
    // timingSafeEqual throws if buffers have different lengths
    return false;
  }
}

export function encryptAes256(key: string, plaintext: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', Buffer.from(key, 'hex'), iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString('hex')}:${tag.toString('hex')}:${encrypted.toString('hex')}`;
}

export function decryptAes256(key: string, ciphertext: string): string {
  const [ivHex, tagHex, dataHex] = ciphertext.split(':');
  const iv = Buffer.from(ivHex, 'hex');
  const tag = Buffer.from(tagHex, 'hex');
  const data = Buffer.from(dataHex, 'hex');
  const decipher = crypto.createDecipheriv('aes-256-gcm', Buffer.from(key, 'hex'), iv);
  decipher.setAuthTag(tag);
  return decipher.update(data).toString('utf8') + decipher.final('utf8');
}
