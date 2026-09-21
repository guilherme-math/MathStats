import { Router } from 'express';
import { LgpdController } from '../controllers/lgpdController';
import { isAuthenticated } from '../middlewares/auth';
import { lgpdLimiter } from '../middlewares/security';

const router = Router();

router.get('/lgpd/data', isAuthenticated, lgpdLimiter, LgpdController.getData);
router.get('/lgpd/export', isAuthenticated, lgpdLimiter, LgpdController.exportData);
router.patch('/lgpd/profile', isAuthenticated, lgpdLimiter, LgpdController.correctProfile);
router.post('/lgpd/request', isAuthenticated, lgpdLimiter, LgpdController.requestDataRight);
router.get('/lgpd/requests', isAuthenticated, lgpdLimiter, LgpdController.getPrivacyRequests);
router.delete('/lgpd/account', isAuthenticated, lgpdLimiter, LgpdController.deleteAccount);
router.get('/lgpd/audit-logs', isAuthenticated, lgpdLimiter, LgpdController.getMyAuditLogs);

export default router;
