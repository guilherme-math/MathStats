import { Router } from 'express';
import { gerarDesafio, responderDesafio } from '../controllers/challengeController';
import { isAuthenticated } from '../middlewares/auth';

const router = Router();
router.get('/desafio', isAuthenticated, gerarDesafio);
router.post('/desafio/:id/responder', isAuthenticated, responderDesafio);
export default router;
