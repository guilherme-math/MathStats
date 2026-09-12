import { Router } from 'express';
import { gerarDesafio, responderDesafio } from '../controllers/challengeController';
 
const router = Router();
 
router.get('/desafio', gerarDesafio);
router.post('/desafio/:id/responder', responderDesafio);
 
export default router;