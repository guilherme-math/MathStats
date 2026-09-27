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
import { validatePublicIdentity } from '../utils/contentFilter';
import { LEGAL_DOCUMENTS } from '../config/legalDocuments';
import { isTrustedDevice, rememberTrustedDevice } from '../utils/trustedDevice';
import { isPasswordValid, PASSWORD_POLICY_MESSAGE } from '../utils/passwordPolicy';
import {
  authenticateSession,
  credentialFingerprint,
  hasCurrentMfa,
  renewSession,
} from '../utils/authSession';

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || '';
const googleClient = new OAuth2Client(GOOGLE_CLIENT_ID);
const getSession = (req: Request) => req.session as AppSession;

function getIp(req: Request): string {
  return req.ip ?? req.socket?.remoteAddress ?? 'unknown';
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
        await authenticateSession(req, user);
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

      const pendingSession = await renewSession(req);
      pendingSession.pending2faUserId = user.id;
      pendingSession.pendingCredentialFingerprint = credentialFingerprint(user);
      pendingSession.pending2faExpires = Date.now() + 15 * 60 * 1000;
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
    const userId = getSession(req).pending2faUserId;
    if (!userId) return res.status(401).json({ error: 'Sessão expirada. Faça login novamente.' });

    try {
      const user = await UserModel.findById(userId);
      if (!user?.email) return res.status(400).json({ error: 'E-mail da conta não encontrado.' });
      if (!hasCurrentMfa(getSession(req), user))
        return res.status(401).json({ error: 'Sessão expirada. Faça login novamente.' });

      const code = crypto.randomInt(1_000_000).toString().padStart(6, '0');
      await sendMfaCodeEmail(user.email, user.username, code);
      getSession(req).mfaEmailCodeHash = hashCode(code);
      getSession(req).mfaEmailExpires = Date.now() + 15 * 60 * 1000;
      getSession(req).mfaEmailUserId = user.id;

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
    const session = getSession(req);
    const pendingId = session.pending2faUserId;

    if (!pendingId)
      return res.status(403).json({ error: 'Sessão expirada. Faça login novamente.' });
    if (!token?.trim())
      return res.status(400).json({ error: 'Digite o código de verificação de 6 dígitos.' });

    try {
      const user = await UserModel.findById(pendingId);
      if (!user) return res.status(404).json({ error: 'Usuário não encontrado.' });
      if (!hasCurrentMfa(session, user))
        return res.status(401).json({ error: 'Sessão expirada. Faça login novamente.' });

      if (method === 'email') {
        const codeHash = session.mfaEmailCodeHash;
        const expires = session.mfaEmailExpires;

        if (!codeHash || !expires || session.mfaEmailUserId !== pendingId)
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

      await authenticateSession(req, user);

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
          return res.status(409).json({
            error:
              'Este e-mail possui cadastro com senha. Entre com usuário e senha ou recupere o acesso. A vinculação automática com Google não está disponível.',
          });
        }
        await audit({
          event: 'LOGIN_SUCCESS',
          userId: user.id,
          username: user.username,
          ip: getIp(req),
          detail: 'Login concluído via conta Google com e-mail verificado',
        });
        await authenticateSession(req, user);
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

      await authenticateSession(req, user);

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
    const userId = getSession(req).userId;
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

      const passwordHash = await hashPassword(password);
      await UserModel.updatePassword(user.id, passwordHash, user.passwordHash);
      await authenticateSession(req, { ...user, passwordHash });
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

  logout(req: Request, res: Response) {
    const session = getSession(req);
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
