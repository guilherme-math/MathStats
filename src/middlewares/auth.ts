import { Request, Response, NextFunction } from 'express';
import type { AppSession } from '../types/session';

export function isAuthenticated(req: Request, res: Response, next: NextFunction) {
  if (!(req.session as AppSession).userId) {
    return res.status(401).json({ error: 'Acesso negado. Faça login para continuar.' });
  }
  next();
}

export function requirePageAuth(req: Request, res: Response, next: NextFunction) {
  if (!(req.session as AppSession).userId) return res.redirect('/');
  next();
}
