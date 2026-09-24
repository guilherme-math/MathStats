import { Router } from 'express';
import { AuthController } from '../controllers/authController';
import { requireRole } from '../middlewares/auth';

const router = Router();
router.get('/dashboard', requireRole('aluno'), AuthController.dashboard);
router.post('/account/password', requireRole('aluno'), AuthController.setPassword);
export default router;