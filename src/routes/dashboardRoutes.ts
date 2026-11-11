import { Router } from 'express';
import { DashboardController } from '../controllers/dashboardController';
import { AuthController } from '../controllers/authController';
import { requireRole } from '../middlewares/auth';
import { passwordChangeLimiter } from '../middlewares/security';
import { validateBody, passwordChangeSchema, mfaPreferenceSchema } from '../validation/authSchemas';

const router = Router();
router.get('/dashboard', requireRole('aluno', 'professor'), DashboardController.dashboard);
router.post(
  '/account/mfa',
  requireRole('aluno', 'professor'),
  passwordChangeLimiter,
  validateBody(mfaPreferenceSchema),
  AuthController.setMfaPreference,
);
router.post(
  '/account/password',
  requireRole('aluno', 'professor'),
  passwordChangeLimiter,
  validateBody(passwordChangeSchema),
  AuthController.setPassword,
);
export default router;
