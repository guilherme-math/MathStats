import type { Session } from 'express-session';

export type AppSession = Session & {
  userId?: string;
  username?: string;
  pending2faUserId?: string;
  mfaEmailCodeHash?: string;
  mfaEmailExpires?: number;
  pendingRecoveryUserId?: string;
  recoveryVerified?: boolean;
};
