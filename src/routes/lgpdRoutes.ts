import { Router } from 'express';
import { LgpdController } from '../controllers/lgpdController';
import { requireRole } from '../middlewares/auth';
import { lgpdLimiter } from '../middlewares/security';

const router = Router();

router.get('/lgpd/data', requireRole('aluno'), lgpdLimiter, LgpdController.getData);
router.get('/lgpd/export', requireRole('aluno'), lgpdLimiter, LgpdController.exportData);
router.patch('/lgpd/profile', requireRole('aluno'), lgpdLimiter, LgpdController.correctProfile);
router.post('/lgpd/request', requireRole('aluno'), lgpdLimiter, LgpdController.requestDataRight);
router.get('/lgpd/requests', requireRole('aluno'), lgpdLimiter, LgpdController.getPrivacyRequests);
router.delete('/lgpd/account', requireRole('aluno'), lgpdLimiter, LgpdController.deleteAccount);
router.get('/lgpd/audit-logs', requireRole('aluno'), lgpdLimiter, LgpdController.getMyAuditLogs);

export default router;