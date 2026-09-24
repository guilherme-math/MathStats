import { Request, Response, NextFunction } from 'express';
import type { AppSession } from '../types/session';
import type { UserRole } from '../config/userRoles';

export function isAuthenticated(req: Request, res: Response, next: NextFunction) {
  if (!(req.session as AppSession).userId) {
    return res.status(401).json({ error: 'Acesso negado. Faça login para continuar.' });
  }
  next();
}

export function requirePageAuth(req: Request, res: Response, next: NextFunction) {
  if (!(req.session as AppSession).userId) return res.redirect('/login');
  next();
}

export function requireRole(...allowedRoles: UserRole[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    const session = req.session as AppSession;
    if (!session.userId)
      return res.status(401).json({ error: 'Acesso negado. Faça login para continuar.' });
    if (!session.role || !allowedRoles.includes(session.role))
      return res.status(403).json({ error: 'Seu perfil não possui acesso a esta funcionalidade.' });
    next();
  };
}

export function requirePageRole(...allowedRoles: UserRole[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    const session = req.session as AppSession;
    if (!session.userId) return res.redirect('/login');
    if (!session.role || !allowedRoles.includes(session.role))
      return res.status(403).send('Acesso negado.');
    next();
  };
}