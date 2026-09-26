import express from 'express';
import session from 'express-session';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import cors from 'cors';
import path from 'path';
import { FirestoreSessionStore } from '../stores/firestoreSessionStore';

const REQUIRED_ENVIRONMENT_VARIABLES = [
  'SESSION_SECRET',
  'ENCRYPTION_KEY',
  'GMAIL_USER',
  'GMAIL_APP_PASSWORD',
  'API_FOOTBALL_KEY',
  'MONGODB_URI',
];

const missingEnvironmentVariables = REQUIRED_ENVIRONMENT_VARIABLES.filter(
  (key) => !process.env[key],
);

if (process.env.NODE_ENV === 'production' && missingEnvironmentVariables.length > 0) {
  throw new Error(
    `Variáveis de ambiente obrigatórias ausentes: ${missingEnvironmentVariables.join(', ')}.`,
  );
}

if (process.env.NODE_ENV !== 'production' && process.env.NODE_ENV !== 'test') {
  for (const key of missingEnvironmentVariables) {
    console.warn(`[security] ATENÇÃO: variável de ambiente "${key}" não definida.`);
  }
}

export function applySecurityMiddlewares(app: express.Application) {
  app.disable('x-powered-by');
  const production = process.env.NODE_ENV === 'production';
  if (production) app.set('trust proxy', 1);
  app.use(
    helmet({
      contentSecurityPolicy: false,
      crossOriginOpenerPolicy: { policy: 'same-origin-allow-popups' },
      hsts: production ? { maxAge: 31536000, includeSubDomains: true, preload: true } : false,
    }),
  );

  const allowedOrigin = process.env.ALLOWED_ORIGIN || 'https://localhost:3443';
  app.use(
    cors({
      origin: production && !process.env.ALLOWED_ORIGIN ? false : allowedOrigin,
      credentials: true,
    }),
  );
  app.use(express.json({ limit: '10kb' }));
  app.use(express.static(path.join(process.cwd(), 'public'), { redirect: false }));

  const sessionStore = process.env.NODE_ENV === 'test' ? undefined : new FirestoreSessionStore();

  app.use(
    session({
      name: process.env.SESSION_COOKIE_NAME || 'mathstats.sid',
      secret: process.env.SESSION_SECRET || 'configure-o-session-secret-no-env',
      resave: false,
      saveUninitialized: false,
      store: sessionStore,
      cookie: {
        secure: true,
        httpOnly: true,
        sameSite: 'strict',
        maxAge: 15 * 60 * 1000,
      },
    }),
  );
}

export const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Muitas tentativas de login. Aguarde 15 minutos antes de tentar novamente.' },
});

export const mfaLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 8,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: 'Muitas tentativas de verificação. Aguarde 15 minutos ou faça login novamente.',
  },
});

export const mfaEmailSendLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 3,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Limite de envios de código atingido. Aguarde 15 minutos.' },
});

export const recoveryLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 4,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Muitas tentativas de recuperação. Aguarde 15 minutos.' },
});

export const googleAuthLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Muitas tentativas com Google. Aguarde 15 minutos.' },
});

export const lgpdLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Muitas requisições. Aguarde 15 minutos.' },
});

export const challengeGenerationLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { erro: 'Limite de geração de desafios atingido. Aguarde 15 minutos.' },
});

export const challengeAnswerLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { erro: 'Limite de respostas atingido. Aguarde 15 minutos.' },
});
