import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

function key(): Buffer {
  const value = process.env.TOKEN_ENCRYPTION_KEY ?? '';
  const decoded = Buffer.from(value, 'base64');
  if (decoded.length !== 32 || decoded.toString('base64') !== value) {
    throw new Error('CALENDAR_ENCRYPTION_NOT_CONFIGURED');
  }
  return decoded;
}

/** AES-256-GCM envelope bound to the stable Google-login owner ID. */
export function encryptToken(value: string, userId: string): string {
  if (!value || !userId) throw new Error('INVALID_CALENDAR_SECRET');
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key(), iv);
  cipher.setAAD(Buffer.from(`venn-calendar:${userId}`));
  const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  return ['v1', iv.toString('base64url'), cipher.getAuthTag().toString('base64url'), encrypted.toString('base64url')].join('.');
}

export function decryptToken(envelope: string, userId: string): string {
  const [version, iv, tag, encrypted, extra] = envelope.split('.');
  if (version !== 'v1' || !iv || !tag || !encrypted || extra || !userId) throw new Error('INVALID_CALENDAR_SECRET');
  const nonce = Buffer.from(iv, 'base64url');
  const authTag = Buffer.from(tag, 'base64url');
  if (nonce.length !== 12 || authTag.length !== 16) throw new Error('INVALID_CALENDAR_SECRET');
  const decipher = createDecipheriv('aes-256-gcm', key(), nonce);
  decipher.setAAD(Buffer.from(`venn-calendar:${userId}`));
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(Buffer.from(encrypted, 'base64url')), decipher.final()]).toString('utf8');
}
