import { createHmac } from 'node:crypto';
import type { Request } from 'express';
import type { User } from '../models/userModel';
import type { AppSession } from '../types/session';

export function credentialFingerprint(user: User): string {
  const secret = process.env.SESSION_SECRET;
  if (!secret) throw new Error('SESSION_SECRET não configurado.');
  return createHmac('sha256', secret)
    .update(JSON.stringify([user.id, user.passwordHash, user.googleId, user.twoFactorSecret]))
    .digest('hex');
}

export async function renewSession(req: Request): Promise<AppSession> {
  await new Promise<void>((resolve, reject) => {
    req.session.regenerate((error) => (error ? reject(error) : resolve()));
  });
  return req.session as AppSession;
}

export async function authenticateSession(req: Request, user: User): Promise<void> {
  const session = await renewSession(req);
  session.userId = user.id;
  session.username = user.username;
  session.role = user.role;
  session.credentialFingerprint = credentialFingerprint(user);
}

export function hasCurrentMfa(session: AppSession, user: User): boolean {
  return (
    session.pending2faUserId === user.id &&
    session.pendingCredentialFingerprint === credentialFingerprint(user) &&
    typeof session.pending2faExpires === 'number' &&
    session.pending2faExpires > Date.now()
  );
}
