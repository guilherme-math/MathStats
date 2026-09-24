import { Router } from 'express';
import { gerarDesafio, responderDesafio } from '../controllers/challengeController';
import { requireRole } from '../middlewares/auth';

const router = Router();
router.get('/desafio', requireRole('aluno'), gerarDesafio);
router.post('/desafio/:id/responder', requireRole('aluno'), responderDesafio);
export default router;