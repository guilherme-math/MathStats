import { Request, Response, NextFunction } from 'express';
import type { AppSession } from '../types/session';
import type { UserRole } from '../config/userRoles';
import { UserModel } from '../models/userModel';
import { credentialFingerprint } from '../utils/authSession';

export async function validateSession(req: Request, res: Response, next: NextFunction) {
  const session = req.session as AppSession;
  if (!session.userId) return next();
  try {
    const user = await UserModel.findById(session.userId);
    if (user && session.credentialFingerprint === credentialFingerprint(user)) {
      session.role = user.role;
      return next();
    }
    await new Promise<void>((resolve, reject) =>
      session.destroy((error) => (error ? reject(error) : resolve())),
    );
    res.clearCookie(process.env.SESSION_COOKIE_NAME || 'mathstats.sid', { path: '/' });
    if (req.path.startsWith('/api/'))
      return res.status(401).json({ error: 'Sessão expirada. Faça login novamente.' });
    return res.redirect('/login');
  } catch {
    return res.status(503).json({ error: 'Não foi possível validar sua sessão. Tente novamente.' });
  }
}

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
