import { Router } from 'express';
import { gerarDesafio, repetirTrilha, responderDesafio } from '../controllers/challengeController';
import { requireRole } from '../middlewares/auth';
import { challengeAnswerLimiter, challengeGenerationLimiter } from '../middlewares/security';

const router = Router();
router.get('/desafio', requireRole('aluno'), challengeGenerationLimiter, gerarDesafio);
router.post(
  '/trilhas/:trilha/repetir',
  requireRole('aluno'),
  challengeGenerationLimiter,
  repetirTrilha,
);
router.post(
  '/desafio/:id/responder',
  requireRole('aluno'),
  challengeAnswerLimiter,
  responderDesafio,
);
export default router;
