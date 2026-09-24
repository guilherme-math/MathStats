import type { Session } from 'express-session';
import type { UserRole } from '../config/userRoles';

export type AppSession = Session & {
  userId?: string;
  username?: string;
  role?: UserRole;
  pending2faUserId?: string;
  mfaEmailCodeHash?: string;
  mfaEmailExpires?: number;
  pendingRecoveryUserId?: string;
  recoveryVerified?: boolean;
};