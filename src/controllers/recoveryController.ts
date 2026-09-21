import { Request, Response } from 'express';
import argon2 from 'argon2';
import crypto from 'crypto';
import { UserModel } from '../models/userModel';
import { sendRecoveryCodeEmail } from '../utils/mailer';
import { audit } from '../utils/auditLogger';
import type { AppSession } from '../types/session';
import type { Timestamp } from 'firebase-admin/firestore';

function getIp(req: Request): string {
  return req.ip ?? req.socket?.remoteAddress ?? 'unknown';
}

const s = (req: Request) => req.session as AppSession;

function toJsDate(val: Timestamp | Date | undefined): Date {
  if (!val) return new Date(0);
  return typeof (val as any).toDate === 'function' ? (val as Timestamp).toDate() : (val as Date);
}

function generateOtpCode(): string {
  const num = crypto.randomBytes(4).readUInt32BE(0) % 1_000_000;
  return num.toString().padStart(6, '0');
}

function hashCode(code: string): string {
  return crypto.createHash('sha256').update(code).digest('hex');
}

export const RecoveryController = {
  async start(req: Request, res: Response) {
    const { username } = req.body;

    if (!username?.trim()) {
      return res
        .status(400)
        .json({ error: 'Informe seu nome de usuário para recuperar o acesso.' });
    }

    try {
      const user = await UserModel.findByUsername(username.trim());

      if (!user || !user.email) {
        await new Promise((r) => setTimeout(r, 400));
        return res.status(200).json({
          message:
            'Se o usuário existir, um código de recuperação será enviado para o e-mail cadastrado.',
        });
      }

      const code = generateOtpCode();
      const expires = new Date(Date.now() + 15 * 60 * 1000);

      await UserModel.updateRecoveryToken(user.id, hashCode(code), expires);

      s(req).pendingRecoveryUserId = user.id;
      s(req).recoveryVerified = false;

      void sendRecoveryCodeEmail(user.email, user.username, code).catch((err) =>
        console.error('[mailer] Falha ao enviar e-mail de recuperação:', err),
      );

      await audit({
        event: 'RECOVERY_REQUESTED',
        userId: user.id,
        username: user.username,
        ip: getIp(req),
        detail: 'Código de recuperação gerado e enviado por e-mail',
      });

      return res.status(200).json({
        message: 'Código de recuperação enviado para o e-mail cadastrado. Válido por 15 minutos.',
      });
    } catch (err) {
      console.error('[recover/start]', err);
      return res
        .status(500)
        .json({ error: 'Não foi possível processar a solicitação. Tente novamente em instantes.' });
    }
  },

  async verify(req: Request, res: Response) {
    const { token } = req.body;
    const userId = s(req).pendingRecoveryUserId;

    if (!userId) {
      return res
        .status(401)
        .json({ error: 'Sessão de recuperação expirada. Inicie o processo novamente.' });
    }
    if (!token?.trim()) {
      return res
        .status(400)
        .json({ error: 'Digite o código de recuperação enviado para o seu e-mail.' });
    }

    try {
      const user = await UserModel.findById(userId);

      if (!user?.recoveryToken || !user.recoveryTokenExpires) {
        return res
          .status(401)
          .json({ error: 'Nenhum código de recuperação ativo. Solicite um novo.' });
      }

      if (toJsDate(user.recoveryTokenExpires) < new Date()) {
        await audit({
          event: 'RECOVERY_FAILURE',
          userId,
          username: user.username,
          ip: getIp(req),
          detail: 'Código de recuperação expirado',
        });
        return res
          .status(401)
          .json({ error: 'Código expirado. Solicite um novo código de recuperação.' });
      }

      if (hashCode(token.trim()) !== user.recoveryToken) {
        await audit({
          event: 'RECOVERY_FAILURE',
          userId,
          username: user.username,
          ip: getIp(req),
          detail: 'Código de recuperação inválido',
        });
        return res
          .status(401)
          .json({ error: 'Código incorreto. Verifique o e-mail e tente novamente.' });
      }

      await UserModel.updateRecoveryToken(user.id, '', new Date(0));
      s(req).recoveryVerified = true;

      await audit({
        event: 'RECOVERY_VERIFIED',
        userId,
        username: user.username,
        ip: getIp(req),
        detail: 'Identidade confirmada via e-mail na recuperação',
      });

      return res.status(200).json({ message: 'Identidade confirmada. Defina sua nova senha.' });
    } catch (err) {
      console.error('[recover/verify]', err);
      return res
        .status(500)
        .json({ error: 'Erro ao verificar o código. Tente novamente em instantes.' });
    }
  },

  async reset(req: Request, res: Response) {
    const { password } = req.body;
    const session = s(req);
    const userId = session.pendingRecoveryUserId;
    const verified = session.recoveryVerified;

    if (!userId || !verified) {
      return res
        .status(401)
        .json({ error: 'Sessão inválida. Reinicie o processo de recuperação de senha.' });
    }
    if (!password || password.length < 8) {
      return res.status(400).json({ error: 'A nova senha deve ter no mínimo 8 caracteres.' });
    }

    try {
      const user = await UserModel.findById(userId);
      if (!user) return res.status(404).json({ error: 'Usuário não encontrado.' });

      const newPasswordHash = await argon2.hash(password, { type: argon2.argon2id });
      await UserModel.updatePassword(userId, newPasswordHash);

      session.pendingRecoveryUserId = undefined;
      session.recoveryVerified = undefined;

      await audit({
        event: 'RECOVERY_SUCCESS',
        userId,
        username: user.username,
        ip: getIp(req),
        detail: 'Senha redefinida com sucesso via fluxo de recuperação',
      });

      return res
        .status(200)
        .json({ message: 'Senha redefinida com sucesso! Faça login com a nova senha.' });
    } catch (err) {
      console.error('[recover/reset]', err);
      return res
        .status(500)
        .json({ error: 'Não foi possível redefinir a senha. Tente novamente em instantes.' });
    }
  },
};
