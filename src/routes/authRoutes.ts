import { Router } from 'express';
import { AuthController } from '../controllers/authController';
import { RecoveryController } from '../controllers/recoveryController';
import {
  loginLimiter,
  mfaLimiter,
  mfaEmailSendLimiter,
  recoveryResetLimiter,
  recoveryStartLimiter,
  recoveryVerifyLimiter,
  googleAuthLimiter,
  signupLimiter,
} from '../middlewares/security';
import {
  validateBody,
  signupSchema,
  loginSchema,
  mfaSchema,
  googleSchema,
  recoveryStartSchema,
  recoveryVerifySchema,
  recoveryResetSchema,
} from '../validation/authSchemas';

const router = Router();

router.get('/config/public', AuthController.publicConfig);
router.post('/signup', signupLimiter, validateBody(signupSchema), AuthController.signup);
router.post('/login', loginLimiter, validateBody(loginSchema), AuthController.login);
router.post('/verify-token', mfaLimiter, validateBody(mfaSchema), AuthController.verifyToken);
router.post('/send-mfa-email', mfaEmailSendLimiter, AuthController.sendMfaEmail);
router.post('/logout', AuthController.logout);
router.post(
  '/auth/google',
  googleAuthLimiter,
  validateBody(googleSchema),
  AuthController.googleAuth,
);
router.post(
  '/recover/start',
  recoveryStartLimiter,
  validateBody(recoveryStartSchema),
  RecoveryController.start,
);
router.post(
  '/recover/verify',
  recoveryVerifyLimiter,
  validateBody(recoveryVerifySchema),
  RecoveryController.verify,
);
router.post(
  '/recover/reset',
  recoveryResetLimiter,
  validateBody(recoveryResetSchema),
  RecoveryController.reset,
);

export default router;
