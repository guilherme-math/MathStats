import { Router } from 'express';
import { AuthController } from '../controllers/authController';
import { isAuthenticated } from '../middlewares/auth';

const router = Router();
router.get('/dashboard', isAuthenticated, AuthController.dashboard);
router.post('/account/password', isAuthenticated, AuthController.setPassword);
export default router;
