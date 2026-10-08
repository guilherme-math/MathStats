import { Router } from 'express';
import { gerarDesafio, responderDesafio } from '../controllers/challengeController';
import { requireRole } from '../middlewares/auth';
import { challengeAnswerLimiter, challengeGenerationLimiter } from '../middlewares/security';

const router = Router();
router.get('/desafio', requireRole('aluno'), challengeGenerationLimiter, gerarDesafio);
router.post(
  '/desafio/:id/responder',
  requireRole('aluno'),
  challengeAnswerLimiter,
  responderDesafio,
);
export default router;
