import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'node:crypto';
import { env } from '../config/env.js';

const VERSION = 'v1';
const ALGORITHM = 'aes-256-gcm';
const key = scryptSync(
  env.TOKEN_ENCRYPTION_SECRET || env.JWT_SECRET,
  'epx-food-whatsapp-token',
  32,
);

export function encryptSecret(value: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [VERSION, iv.toString('base64url'), tag.toString('base64url'), encrypted.toString('base64url')].join('.');
}

export function decryptSecret(value: string) {
  const [version, encodedIv, encodedTag, encodedPayload] = value.split('.');
  if (version !== VERSION || !encodedIv || !encodedTag || !encodedPayload) throw new Error('Formato de segredo invÃ¡lido.');
  const decipher = createDecipheriv(ALGORITHM, key, Buffer.from(encodedIv, 'base64url'));
  decipher.setAuthTag(Buffer.from(encodedTag, 'base64url'));
  return Buffer.concat([
    decipher.update(Buffer.from(encodedPayload, 'base64url')),
    decipher.final(),
  ]).toString('utf8');
}
