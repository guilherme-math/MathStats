import { Router } from 'express';
import { LgpdController } from '../controllers/lgpdController';
import { requireRole } from '../middlewares/auth';
import { lgpdLimiter } from '../middlewares/security';

const router = Router();

router.get('/lgpd/data', requireRole('aluno', 'professor'), lgpdLimiter, LgpdController.getData);
router.get(
  '/lgpd/export',
  requireRole('aluno', 'professor'),
  lgpdLimiter,
  LgpdController.exportData,
);
router.patch(
  '/lgpd/profile',
  requireRole('aluno', 'professor'),
  lgpdLimiter,
  LgpdController.correctProfile,
);
router.post(
  '/lgpd/request',
  requireRole('aluno', 'professor'),
  lgpdLimiter,
  LgpdController.requestDataRight,
);
router.get(
  '/lgpd/requests',
  requireRole('aluno', 'professor'),
  lgpdLimiter,
  LgpdController.getPrivacyRequests,
);
router.delete(
  '/lgpd/account',
  requireRole('aluno', 'professor'),
  lgpdLimiter,
  LgpdController.deleteAccount,
);
router.get(
  '/lgpd/audit-logs',
  requireRole('aluno', 'professor'),
  lgpdLimiter,
  LgpdController.getMyAuditLogs,
);

export default router;
