import { Router } from 'express';
import { AuthController } from '../controllers/authController';
import { RecoveryController } from '../controllers/recoveryController';
import {
  loginLimiter,
  mfaLimiter,
  mfaEmailSendLimiter,
  recoveryLimiter,
  googleAuthLimiter,
} from '../middlewares/security';

const router = Router();

router.get('/config/public', AuthController.publicConfig);
router.post('/signup', AuthController.signup);
router.post('/login', loginLimiter, AuthController.login);
router.post('/verify-token', mfaLimiter, AuthController.verifyToken);
router.post('/send-mfa-email', mfaEmailSendLimiter, AuthController.sendMfaEmail);
router.post('/logout', AuthController.logout);
router.post('/auth/google', googleAuthLimiter, AuthController.googleAuth);
router.post('/recover/start', recoveryLimiter, RecoveryController.start);
router.post('/recover/verify', recoveryLimiter, RecoveryController.verify);
router.post('/recover/reset', recoveryLimiter, RecoveryController.reset);

export default router;
