import crypto from 'crypto';
import type { Request, Response } from 'express';

const COOKIE_NAME = 'mathstats.trusted_device';
const TRUST_DURATION_MS = 30 * 24 * 60 * 60 * 1000;

type TrustedDevicePayload = {
  sub: string;
  exp: number;
  pwd: string;
  ua: string;
};

function digest(value: string): string {
  return crypto.createHash('sha256').update(value).digest('base64url');
}

function signingSecret(): string {
  return `${process.env.SESSION_SECRET || 'configure-o-session-secret-no-env'}:trusted-device`;
}

function signature(encodedPayload: string): string {
  return crypto.createHmac('sha256', signingSecret()).update(encodedPayload).digest('base64url');
}

function userAgent(req: Request): string {
  return String(req.get('user-agent') || 'unknown');
}

function readCookie(req: Request): string | null {
  const header = req.headers.cookie || '';
  for (const part of header.split(';')) {
    const separator = part.indexOf('=');
    if (separator < 0) continue;
    const name = part.slice(0, separator).trim();
    if (name !== COOKIE_NAME) continue;
    return decodeURIComponent(part.slice(separator + 1).trim());
  }
  return null;
}

export function createTrustedDeviceToken(
  userId: string,
  passwordHash: string,
  currentUserAgent: string,
  expiresAt = Date.now() + TRUST_DURATION_MS,
): string {
  const payload: TrustedDevicePayload = {
    sub: digest(userId),
    exp: expiresAt,
    pwd: digest(passwordHash),
    ua: digest(currentUserAgent),
  };
  const encodedPayload = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return `${encodedPayload}.${signature(encodedPayload)}`;
}

export function validateTrustedDeviceToken(
  token: string | null,
  userId: string,
  passwordHash: string,
  currentUserAgent: string,
  now = Date.now(),
): boolean {
  if (!token) return false;
  const [encodedPayload, receivedSignature, extra] = token.split('.');
  if (!encodedPayload || !receivedSignature || extra) return false;

  const expectedSignature = signature(encodedPayload);
  const receivedBuffer = Buffer.from(receivedSignature);
  const expectedBuffer = Buffer.from(expectedSignature);
  if (
    receivedBuffer.length !== expectedBuffer.length ||
    !crypto.timingSafeEqual(receivedBuffer, expectedBuffer)
  ) {
    return false;
  }

  try {
    const payload = JSON.parse(
      Buffer.from(encodedPayload, 'base64url').toString('utf8'),
    ) as TrustedDevicePayload;
    return (
      payload.sub === digest(userId) &&
      payload.exp > now &&
      payload.pwd === digest(passwordHash) &&
      payload.ua === digest(currentUserAgent)
    );
  } catch {
    return false;
  }
}

export function isTrustedDevice(req: Request, userId: string, passwordHash: string): boolean {
  return validateTrustedDeviceToken(readCookie(req), userId, passwordHash, userAgent(req));
}

export function rememberTrustedDevice(
  req: Request,
  res: Response,
  userId: string,
  passwordHash: string,
): void {
  res.cookie(COOKIE_NAME, createTrustedDeviceToken(userId, passwordHash, userAgent(req)), {
    secure: true,
    httpOnly: true,
    sameSite: 'strict',
    maxAge: TRUST_DURATION_MS,
    path: '/',
  });
}

export { COOKIE_NAME, TRUST_DURATION_MS };