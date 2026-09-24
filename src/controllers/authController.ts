import { Request, Response } from 'express';
import argon2 from 'argon2';
import speakeasy from 'speakeasy';
import qrcode from 'qrcode';
import crypto from 'crypto';
import { OAuth2Client } from 'google-auth-library';
import { UserModel } from '../models/userModel';
import { encryptAES, decryptAES } from '../utils/crypto';
import { sendWelcomeEmail, sendMfaCodeEmail } from '../utils/mailer';
import { audit } from '../utils/auditLogger';
import type { AppSession } from '../types/session';
import { getEffectiveStreak, getStudyDateKey, previousStudyDateKey } from '../utils/streak';
import { validatePublicIdentity } from '../utils/contentFilter';
import { LEGAL_DOCUMENTS } from '../config/legalDocuments';
import { isTrustedDevice, rememberTrustedDevice } from '../utils/trustedDevice';
import { isPasswordValid, PASSWORD_POLICY_MESSAGE } from '../utils/passwordPolicy';

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || '';
const googleClient = new OAuth2Client(GOOGLE_CLIENT_ID);
const s = (req: Request) => req.session as AppSession;

function getIp(req: Request): string {
  return req.ip ?? req.socket?.remoteAddress ?? 'unknown';
}

function serializeDate(value: any): string | null {
  if (!value) return null;
  if (typeof value.toDate === 'function') return value.toDate().toISOString();
  if (value instanceof Date) return value.toISOString();
  return String(value);
}

function toJsDate(value: any): Date | null {
  if (!value) return null;
  if (typeof value.toDate === 'function') return value.toDate();
  if (value instanceof Date) return value;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function formatDayLabel(dateKey: string) {
  const [year, month, day] = dateKey.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  const weekday = new Intl.DateTimeFormat('pt-BR', { weekday: 'short', timeZone: 'UTC' })
    .format(date)
    .replace('.', '')
    .toUpperCase();
  return { weekday, day: `${String(day).padStart(2, '0')}/${String(month).padStart(2, '0')}` };
}

function hashCode(code: string): string {
  return crypto.createHash('sha256').update(code).digest('hex');
}

function validUsername(username: string): boolean {
  return /^[A-Za-z0-9._-]{3,24}$/.test(username.trim());
}

function validDisplayName(displayName: string): boolean {
  const value = displayName.trim();
  return value.length >= 2 && value.length <= 60;
}

function normalizeUsername(username: string): string {
  return username.trim().normalize('NFKC').toLocaleLowerCase('pt-BR');
}

async function hashPassword(password: string): Promise<string> {
  return argon2.hash(password, {
    type: argon2.argon2id,
    memoryCost: 2 ** 16,
    timeCost: 3,
    parallelism: 1,
  });
}

export const AuthController = {
  publicConfig(_req: Request, res: Response) {
    return res.json({ googleClientId: GOOGLE_CLIENT_ID || null });
  },

  async signup(req: Request, res: Response) {
    const { displayName, username, email, password, lgpdAccepted } = req.body;

    if (!displayName?.trim() || !username?.trim() || !email?.trim() || !password) {
      return res
        .status(400)
        .json({ error: 'Nome de exibição, usuário, e-mail e senha são obrigatórios.' });
    }
    if (!validDisplayName(displayName)) {
      return res
        .status(400)
        .json({ error: 'O nome de exibição deve ter entre 2 e 60 caracteres.' });
    }
    if (!validUsername(username)) {
      return res.status(400).json({
        error:
          'O usuário deve ter de 3 a 24 caracteres e usar apenas letras, números, ponto, hífen ou underline.',
      });
    }
    if (!isPasswordValid(password)) {
      return res.status(400).json({ error: PASSWORD_POLICY_MESSAGE });
    }
    if (!lgpdAccepted) {
      return res.status(400).json({
        error: 'É necessário concordar com os Termos de Uso e a Política de Privacidade.',
      });
    }

    const displayNameValue = displayName.trim();
    const usernameNormalized = normalizeUsername(username);
    const emailNormalized = email.trim().toLowerCase();

    try {
      const displayNameModeration = validatePublicIdentity(displayNameValue, 'O nome de exibição');
      const usernameModeration = validatePublicIdentity(usernameNormalized, 'O nome de usuário');
      const moderationError = !displayNameModeration.allowed
        ? displayNameModeration.error
        : !usernameModeration.allowed
          ? usernameModeration.error
          : null;
      if (moderationError) {
        audit({
          event: 'SIGNUP_REJECTED',
          ip: getIp(req),
          detail: 'Identificador incompatível com as regras da plataforma',
        }).catch(() => {});
        return res.status(400).json({ error: moderationError });
      }

      const [existingByUsername, existingByEmail] = await Promise.all([
        UserModel.findByUsername(usernameNormalized),
        UserModel.findByEmail(emailNormalized),
      ]);

      if (existingByUsername) {
        return res.status(409).json({ error: 'Nome de usuário já está em uso.' });
      }
      if (existingByEmail) {
        const message =
          existingByEmail.googleId && !existingByEmail.passwordHash
            ? 'Este e-mail já pertence a uma conta criada com Google. Entre com Google para acessar essa conta.'
            : 'Este e-mail já possui uma conta cadastrada. Use o login ou a recuperação de senha.';
        return res.status(409).json({ error: message });
      }

      const passwordHash = await hashPassword(password);
      const mfaSecret = speakeasy.generateSecret({ name: `MathStats (${usernameNormalized})` });
      const encryptedSecret = encryptAES(mfaSecret.base32);

      const user = await UserModel.create({
        displayName: displayNameValue,
        username: usernameNormalized,
        email: emailNormalized,
        passwordHash,
        twoFactorSecret: encryptedSecret,
        legalAcceptedAt: new Date(),
        ...LEGAL_DOCUMENTS,
      });

      const qrCodeImage = await qrcode.toDataURL(mfaSecret.otpauth_url!);

      void sendWelcomeEmail(emailNormalized, displayNameValue, qrCodeImage).catch((error) =>
        console.error('[mailer] Falha ao enviar e-mail de boas-vindas:', error),
      );

      await audit({
        event: 'SIGNUP',
        userId: user.id,
        username: user.username,
        ip: getIp(req),
        detail: 'Nova conta criada no MathStats com e-mail e senha',
      });

      return res.status(201).json({
        message: 'Conta criada com sucesso. Configure o 2FA antes do primeiro acesso.',
        qrCodeUrl: qrCodeImage,
      });
    } catch (error) {
      console.error('[signup]', error);
      return res
        .status(500)
        .json({ error: 'Não foi possível criar a conta. Tente novamente em instantes.' });
    }
  },

  async login(req: Request, res: Response) {
    const { email, username, password } = req.body;

    if ((!email?.trim() && !username?.trim()) || !password) {
      return res.status(400).json({ error: 'Informe seu usuário ou e-mail e a senha.' });
    }

    try {
      const user = email
        ? await UserModel.findByEmail(email.trim())
        : await UserModel.findByUsername(username.trim());

      if (!user || !user.passwordHash || !(await argon2.verify(user.passwordHash, password))) {
        await audit({
          event: 'LOGIN_FAILURE',
          ip: getIp(req),
          detail: 'Tentativa de login com credenciais inválidas',
        });
        return res
          .status(401)
          .json({ error: 'Usuário ou senha incorretos. Verifique os dados e tente novamente.' });
      }

      await audit({
        event: 'LOGIN_SUCCESS',
        userId: user.id,
        username: user.username,
        ip: getIp(req),
        detail: 'Senha validada',
      });

      if (isTrustedDevice(req, user.id, user.passwordHash)) {
        s(req).userId = user.id;
        s(req).username = user.username;
        s(req).role = user.role;
        s(req).pending2faUserId = undefined;
        s(req).mfaEmailCodeHash = undefined;
        s(req).mfaEmailExpires = undefined;
        await audit({
          event: 'LOGIN_2FA_SUCCESS',
          userId: user.id,
          username: user.username,
          ip: getIp(req),
          detail: 'Login concluído em dispositivo confiável',
        });
        return res.json({
          message: 'Acesso liberado neste dispositivo confiável.',
          authenticated: true,
          rememberedDevice: true,
        });
      }

      s(req).pending2faUserId = user.id;
      return res.json({
        message: 'Senha validada. Informe o código de verificação.',
        require2FA: true,
      });
    } catch (error) {
      console.error('[login]', error);
      return res
        .status(500)
        .json({ error: 'Erro ao processar o login. Tente novamente em instantes.' });
    }
  },

  async sendMfaEmail(req: Request, res: Response) {
    const userId = s(req).pending2faUserId;
    if (!userId) return res.status(401).json({ error: 'Sessão expirada. Faça login novamente.' });

    try {
      const user = await UserModel.findById(userId);
      if (!user?.email) return res.status(400).json({ error: 'E-mail da conta não encontrado.' });

      const code = (crypto.randomBytes(4).readUInt32BE(0) % 1_000_000).toString().padStart(6, '0');
      await sendMfaCodeEmail(user.email, user.username, code);
      s(req).mfaEmailCodeHash = hashCode(code);
      s(req).mfaEmailExpires = Date.now() + 15 * 60 * 1000;

      return res.json({
        message: 'Código enviado para o e-mail cadastrado. Válido por 15 minutos.',
      });
    } catch (error) {
      console.error('[send-mfa-email]', error);
      return res
        .status(500)
        .json({ error: 'Não foi possível enviar o código. Tente novamente em instantes.' });
    }
  },

  async verifyToken(req: Request, res: Response) {
    const { token, method, rememberDevice } = req.body;
    const session = s(req);
    const pendingId = session.pending2faUserId;

    if (!pendingId)
      return res.status(403).json({ error: 'Sessão expirada. Faça login novamente.' });
    if (!token?.trim())
      return res.status(400).json({ error: 'Digite o código de verificação de 6 dígitos.' });

    try {
      const user = await UserModel.findById(pendingId);
      if (!user) return res.status(404).json({ error: 'Usuário não encontrado.' });

      if (method === 'email') {
        const codeHash = session.mfaEmailCodeHash;
        const expires = session.mfaEmailExpires;

        if (!codeHash || !expires)
          return res.status(400).json({ error: 'Solicite um código por e-mail antes de validar.' });
        if (Date.now() > expires)
          return res.status(401).json({ error: 'Código expirado. Solicite um novo código.' });

        if (hashCode(token.trim()) !== codeHash) {
          await audit({
            event: 'LOGIN_2FA_FAILURE',
            userId: pendingId,
            username: user.username,
            ip: getIp(req),
            detail: 'Código MFA por e-mail inválido',
          });
          return res
            .status(401)
            .json({ error: 'Código incorreto. Verifique o e-mail e tente novamente.' });
        }

        session.mfaEmailCodeHash = undefined;
        session.mfaEmailExpires = undefined;
      } else {
        if (!user.twoFactorSecret)
          return res.status(400).json({ error: 'Configuração de 2FA não encontrada.' });

        const decryptedSecret = decryptAES(user.twoFactorSecret);
        if (!decryptedSecret)
          return res.status(500).json({ error: 'Erro interno de criptografia.' });

        const isValid = speakeasy.totp.verify({
          secret: decryptedSecret,
          encoding: 'base32',
          token: token.trim(),
          window: 1,
        });

        if (!isValid) {
          await audit({
            event: 'LOGIN_2FA_FAILURE',
            userId: pendingId,
            username: user.username,
            ip: getIp(req),
            detail: 'Token TOTP inválido',
          });
          return res.status(401).json({
            error: 'Código incorreto. Os códigos do autenticador renovam a cada 30 segundos.',
          });
        }
      }

      session.userId = pendingId;
      session.username = user.username;
      session.role = user.role;
      session.pending2faUserId = undefined;

      if (rememberDevice === true && user.passwordHash) {
        rememberTrustedDevice(req, res, user.id, user.passwordHash);
      }

      await audit({
        event: 'LOGIN_2FA_SUCCESS',
        userId: pendingId,
        username: user.username,
        ip: getIp(req),
        detail: `Login completo via 2FA (${method === 'email' ? 'e-mail' : 'app'})`,
      });

      return res.json({
        message: 'Acesso liberado.',
        trustedDevice: rememberDevice === true && Boolean(user.passwordHash),
      });
    } catch (error) {
      console.error('[verify-token]', error);
      return res.status(500).json({ error: 'Erro ao validar o código. Tente novamente.' });
    }
  },

  async googleAuth(req: Request, res: Response) {
    const { credential, mode, displayName, username, lgpdAccepted } = req.body;
    if (!credential) return res.status(400).json({ error: 'Token do Google ausente.' });
    if (!GOOGLE_CLIENT_ID)
      return res.status(503).json({ error: 'Login com Google ainda não foi configurado.' });

    try {
      const ticket = await googleClient.verifyIdToken({
        idToken: credential,
        audience: GOOGLE_CLIENT_ID,
      });
      const payload = ticket.getPayload();

      if (!payload?.email || payload.email_verified !== true) {
        return res
          .status(401)
          .json({ error: 'A conta Google precisa possuir um e-mail verificado.' });
      }

      const emailNormalized = payload.email.trim().toLowerCase();
      const googleId = payload.sub;
      const [byGoogleId, byEmail] = await Promise.all([
        UserModel.findByGoogleId(googleId),
        UserModel.findByEmail(emailNormalized),
      ]);

      if (byGoogleId && byEmail && byGoogleId.id !== byEmail.id) {
        return res.status(409).json({
          error:
            'Existe um conflito entre as identidades desta conta. Entre em contato com o suporte.',
        });
      }

      let user = byGoogleId ?? byEmail;

      if (user) {
        if (user.googleId && user.googleId !== googleId) {
          return res
            .status(409)
            .json({ error: 'Este e-mail já está vinculado a outra identidade Google.' });
        }
        if (!user.googleId) {
          await UserModel.linkGoogleId(user.id, googleId);
          user.googleId = googleId;
          await audit({
            event: 'GOOGLE_LINKED',
            userId: user.id,
            username: user.username,
            ip: getIp(req),
            detail: 'Conta Google vinculada por e-mail verificado',
          });
        }
        await audit({
          event: 'LOGIN_SUCCESS',
          userId: user.id,
          username: user.username,
          ip: getIp(req),
          detail: 'Login concluído via conta Google com e-mail verificado',
        });
        s(req).userId = user.id;
        s(req).username = user.username;
        s(req).role = user.role;
        s(req).pending2faUserId = undefined;
        return res.json({
          authenticated: true,
          linkedExistingAccount: !byGoogleId && Boolean(byEmail),
        });
      }

      if (mode !== 'register') {
        return res.status(404).json({
          error:
            'Esta conta Google ainda não está cadastrada no MathStats. Use Criar conta para fazer o primeiro cadastro.',
          requiresRegistration: true,
        });
      }

      const displayNameValue = String(displayName || payload.name || '').trim();
      if (!validDisplayName(displayNameValue)) {
        return res
          .status(400)
          .json({ error: 'Informe um nome de exibição válido antes de continuar com Google.' });
      }
      if (!username?.trim() || !validUsername(username)) {
        return res
          .status(400)
          .json({ error: 'Informe um nome de usuário válido antes de continuar com Google.' });
      }
      if (!lgpdAccepted) {
        return res.status(400).json({
          error:
            'Aceite os Termos de Uso e a Política de Privacidade antes de criar a conta com Google.',
        });
      }

      const usernameNormalized = normalizeUsername(username);
      const displayNameModeration = validatePublicIdentity(displayNameValue, 'O nome de exibição');
      const usernameModeration = validatePublicIdentity(usernameNormalized, 'O nome de usuário');
      const moderationError = !displayNameModeration.allowed
        ? displayNameModeration.error
        : !usernameModeration.allowed
          ? usernameModeration.error
          : null;
      if (moderationError) {
        audit({
          event: 'SIGNUP_REJECTED',
          ip: getIp(req),
          detail: 'Identificador incompatível com as regras da plataforma',
        }).catch(() => {});
        return res.status(400).json({ error: moderationError });
      }

      const existingUsername = await UserModel.findByUsername(usernameNormalized);
      if (existingUsername) {
        return res.status(409).json({ error: 'Nome de usuário já está em uso.' });
      }

      user = await UserModel.create({
        displayName: displayNameValue,
        username: usernameNormalized,
        email: emailNormalized,
        passwordHash: '',
        twoFactorSecret: '',
        legalAcceptedAt: new Date(),
        ...LEGAL_DOCUMENTS,
        googleId,
      });

      await audit({
        event: 'SIGNUP',
        userId: user.id,
        username: user.username,
        ip: getIp(req),
        detail: 'Conta criada via Google com aceite dos documentos legais',
      });

      s(req).userId = user.id;
      s(req).username = user.username;
      s(req).role = user.role;
      s(req).pending2faUserId = undefined;

      return res.status(201).json({
        created: true,
        authenticated: true,
        message: 'Conta criada e autenticada com Google.',
      });
    } catch (error) {
      console.error('[google-auth]', error);
      return res.status(401).json({ error: 'Falha ao autenticar com o Google.' });
    }
  },

  async setPassword(req: Request, res: Response) {
    const userId = s(req).userId;
    const { currentPassword, password } = req.body;

    if (!userId) return res.status(401).json({ error: 'Acesso negado.' });
    if (!isPasswordValid(password)) return res.status(400).json({ error: PASSWORD_POLICY_MESSAGE });

    try {
      const user = await UserModel.findById(userId);
      if (!user) return res.status(404).json({ error: 'Usuário não encontrado.' });

      const changingPassword = Boolean(user.passwordHash);
      if (
        changingPassword &&
        (!currentPassword || !(await argon2.verify(user.passwordHash, currentPassword)))
      ) {
        return res.status(401).json({ error: 'A senha atual está incorreta.' });
      }

      await UserModel.updatePassword(user.id, await hashPassword(password));
      await audit({
        event: changingPassword ? 'PASSWORD_CHANGED' : 'PASSWORD_CREATED',
        userId: user.id,
        username: user.username,
        ip: getIp(req),
        detail: changingPassword
          ? 'Senha alterada pelo titular na área da conta'
          : 'Senha adicionada a uma conta criada com Google',
      });
      return res.json({
        message: changingPassword
          ? 'Senha alterada com sucesso.'
          : 'Senha criada com sucesso. Agora você também pode entrar usando e-mail/usuário e senha.',
      });
    } catch (error) {
      console.error('[set-password]', error);
      return res.status(500).json({ error: 'Não foi possível criar a senha agora.' });
    }
  },

  async dashboard(req: Request, res: Response) {
    try {
      const userId = s(req).userId!;
      const user = await UserModel.findById(userId);
      if (!user) return res.status(404).json({ error: 'Usuário não encontrado.' });

      const challengeHistory = await UserModel.getChallengeHistory(userId, 500);
      const recentChallenges = challengeHistory.slice(0, 10);
      const challengesAnswered = Number(user.challengesAnswered) || 0;
      const challengesCorrect = Number(user.challengesCorrect) || 0;
      const accuracy =
        challengesAnswered > 0 ? Math.round((challengesCorrect / challengesAnswered) * 100) : 0;

      const today = getStudyDateKey();
      const activityKeys = [today];
      for (let i = 1; i < 7; i += 1) activityKeys.unshift(previousStudyDateKey(activityKeys[0]));

      const activityMap = new Map(
        activityKeys.map((key) => [key, { answered: 0, correct: 0, xp: 0 }]),
      );
      const categoryMap = new Map<string, { answered: number; correct: number; xp: number }>();

      for (const attempt of challengeHistory) {
        const attemptDate = toJsDate(attempt.respondidoEm);
        if (attemptDate) {
          const key = getStudyDateKey(attemptDate);
          const activity = activityMap.get(key);
          if (activity) {
            activity.answered += 1;
            if (attempt.acertou) activity.correct += 1;
            activity.xp += Number(attempt.xpGanho) || 0;
          }
        }

        const categoryName = String(attempt.categoria || 'Matemática');
        const category = categoryMap.get(categoryName) || { answered: 0, correct: 0, xp: 0 };
        category.answered += 1;
        if (attempt.acertou) category.correct += 1;
        category.xp += Number(attempt.xpGanho) || 0;
        categoryMap.set(categoryName, category);
      }

      const activity7Days = activityKeys.map((key) => {
        const data = activityMap.get(key)!;
        const labels = formatDayLabel(key);
        return { date: key, ...labels, ...data };
      });

      const attemptsLast7Days = activity7Days.reduce((sum, item) => sum + item.answered, 0);
      const correctLast7Days = activity7Days.reduce((sum, item) => sum + item.correct, 0);
      const xpLast7Days = activity7Days.reduce((sum, item) => sum + item.xp, 0);
      const accuracyLast7Days =
        attemptsLast7Days > 0 ? Math.round((correctLast7Days / attemptsLast7Days) * 100) : 0;

      const categoryPerformance = Array.from(categoryMap.entries())
        .map(([name, stats]) => ({
          name,
          answered: stats.answered,
          correct: stats.correct,
          xp: stats.xp,
          accuracy: stats.answered > 0 ? Math.round((stats.correct / stats.answered) * 100) : 0,
        }))
        .sort((a, b) => b.answered - a.answered || b.accuracy - a.accuracy)
        .slice(0, 6);

      return res.json({
        message: 'Sessão autenticada.',
        user: {
          id: user.id,
          displayName: user.displayName || user.username,
          username: user.username,
          email: user.email,
          xpTotal: Number(user.xpTotal) || 0,
          streak: getEffectiveStreak(Number(user.streak) || 0, user.lastStudyDate || null),
          lastStudyDate: user.lastStudyDate || null,
          challengesAnswered,
          challengesCorrect,
          challengesIncorrect: Math.max(challengesAnswered - challengesCorrect, 0),
          accuracy,
          recentChallenges: recentChallenges.map((attempt) => ({
            id: attempt.id,
            challengeId: attempt.challengeId,
            tipoDesafio: attempt.tipoDesafio,
            categoria: attempt.categoria,
            dificuldade: attempt.dificuldade,
            titulo: attempt.titulo,
            acertou: attempt.acertou,
            usouDica: attempt.usouDica,
            xpGanho: Number(attempt.xpGanho) || 0,
            respondidoEm: serializeDate(attempt.respondidoEm),
          })),
          hasPassword: Boolean(user.passwordHash),
          googleLinked: Boolean(user.googleId),
        },
        dashboard: {
          attemptsLast7Days,
          correctLast7Days,
          accuracyLast7Days,
          xpLast7Days,
          activity7Days,
          categoryPerformance,
          historyAnalyzed: challengeHistory.length,
        },
      });
    } catch (error) {
      console.error('[dashboard]', error);
      return res.status(500).json({ error: 'Não foi possível carregar os dados da sessão.' });
    }
  },

  logout(req: Request, res: Response) {
    const session = s(req);
    const userId = session.userId;
    const username = session.username;
    audit({
      event: 'LOGOUT',
      userId,
      username,
      ip: getIp(req),
      detail: 'Sessão encerrada pelo usuário',
    }).catch(() => {});
    req.session.destroy(() => {
      res.clearCookie(process.env.SESSION_COOKIE_NAME || 'mathstats.sid', {
        secure: true,
        httpOnly: true,
        sameSite: 'strict',
      });
      res.json({ message: 'Sessão encerrada com sucesso.' });
    });
  },
};