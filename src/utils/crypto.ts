import crypto from 'crypto';

const rawKey = process.env.ENCRYPTION_KEY || '';
if (!/^[a-fA-F0-9]{64}$/.test(rawKey)) {
  throw new Error('ENCRYPTION_KEY deve possuir exatamente 64 caracteres hexadecimais (32 bytes).');
}

const ENCRYPTION_KEY = Buffer.from(rawKey, 'hex');
const AES_ALGORITHM = 'aes-256-gcm';

export function encryptAES(text: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(AES_ALGORITHM, ENCRYPTION_KEY, iv);
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const authTag = cipher.getAuthTag().toString('hex');
  return `${iv.toString('hex')}:${authTag}:${encrypted}`;
}

export function decryptAES(encryptedData: string): string | null {
  try {
    const parts = encryptedData.split(':');
    if (parts.length !== 3) return null;
    const iv = Buffer.from(parts[0], 'hex');
    const authTag = Buffer.from(parts[1], 'hex');
    const encryptedText = parts[2];
    const decipher = crypto.createDecipheriv(AES_ALGORITHM, ENCRYPTION_KEY, iv);
    decipher.setAuthTag(authTag);
    let decrypted = decipher.update(encryptedText, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  } catch {
    return null;
  }
}