import crypto from 'crypto';

function deriveKey(): Buffer {
  const raw = process.env.ENCRYPTION_KEY!;
  if (!raw) throw new Error('ENCRYPTION_KEY environment variable is required');
  const buf = Buffer.from(raw, 'hex');
  if (buf.length === 32) return buf;
  return crypto.createHash('sha256').update(raw, 'utf8').digest();
}

export function encryptToken(plaintext: string): string {
  const key = deriveKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const enc = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv.toString('hex'), tag.toString('hex'), enc.toString('hex')].join(':');
}

export function decryptToken(ciphertext: string): string {
  const [ivHex, tagHex, encHex] = ciphertext.split(':');
  const key = deriveKey();
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(ivHex, 'hex'));
  decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
  return decipher.update(Buffer.from(encHex, 'hex')) + decipher.final('utf8');
}

export function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}
