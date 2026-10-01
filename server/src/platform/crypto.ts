import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

export const hashToken = (value: string): string => createHash('sha256').update(value).digest('hex');

export function encryptSecret(value: string, key: Buffer): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, ciphertext]).toString('base64url');
}

export function decryptSecret(value: string, key: Buffer): string {
  const packed = Buffer.from(value, 'base64url');
  if (packed.length < 29) throw new Error('invalid encrypted value');
  const decipher = createDecipheriv('aes-256-gcm', key, packed.subarray(0, 12));
  decipher.setAuthTag(packed.subarray(12, 28));
  return Buffer.concat([decipher.update(packed.subarray(28)), decipher.final()]).toString('utf8');
}
