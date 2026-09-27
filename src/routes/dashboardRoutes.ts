import { Router } from 'express';
import { DashboardController } from '../controllers/dashboardController';
import { AuthController } from '../controllers/authController';
import { requireRole } from '../middlewares/auth';
import { passwordChangeLimiter } from '../middlewares/security';
import { validateBody, passwordChangeSchema } from '../validation/authSchemas';

const router = Router();
router.get('/dashboard', requireRole('aluno'), DashboardController.dashboard);
router.post(
  '/account/password',
  requireRole('aluno'),
  passwordChangeLimiter,
  validateBody(passwordChangeSchema),
  AuthController.setPassword,
);
export default router;
