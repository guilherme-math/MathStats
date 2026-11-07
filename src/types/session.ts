import type { Session } from 'express-session';
import type { UserRole } from '../config/userRoles';

export type AppSession = Session & {
  userId?: string;
  username?: string;
  role?: UserRole;
  credentialFingerprint?: string;
  pendingCredentialFingerprint?: string;
  pending2faExpires?: number;
  pending2faUserId?: string;
  mfaEmailCodeHash?: string;
  mfaEmailExpires?: number;
  mfaEmailUserId?: string;
  mfaSetup?: { secret: string; expires: number };
  mfaDisableEmail?: { hash: string; expires: number; fingerprint: string; attempts: number };
  pendingRecoveryUserId?: string;
  recoveryVerified?: boolean;
  recoveryExpires?: number;
  recoveryCredentialFingerprint?: string;
};
