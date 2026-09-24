import { Request, Response } from 'express';
import { UserModel } from '../models/userModel';
import {
  anonymizeAuditLogsForUser,
  getAuditLogsForUser,
  getAllAuditLogsForUser,
  audit,
} from '../utils/auditLogger';
import { sendPrivacyRequestNotification } from '../utils/mailer';
import { validatePublicIdentity } from '../utils/contentFilter';
import type { AppSession } from '../types/session';

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

function validDisplayName(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length >= 2 && value.trim().length <= 60;
}

const RIGHTS_REQUEST_TYPES = new Set(['oposicao', 'bloqueio-ou-anonimizacao']);

async function safeGetLogs(userId: string, limit: number) {
  try {
    return await getAuditLogsForUser(userId, limit);
  } catch (error) {
    console.error('[lgpd] Falha ao buscar logs de auditoria:', error);
    return [];
  }
}

export const LgpdController = {
  async getData(req: Request, res: Response) {
    const userId = s(req).userId!;
    try {
      const user = await UserModel.findById(userId);
      if (!user) return res.status(404).json({ error: 'Usuário não encontrado.' });

      const [logs, challengeHistory, privacyRequests] = await Promise.all([
        safeGetLogs(userId, 20),
        UserModel.getChallengeHistory(userId, 50),
        UserModel.getPrivacyRequests(userId),
      ]);
      audit({
        event: 'LGPD_DATA_QUERY',
        userId,
        username: user.username,
        ip: getIp(req),
        detail: 'Titular consultou seus dados pessoais',
      }).catch(() => {});

      return res.json({
        dadosPessoais: {
          displayName: user.displayName || user.username,
          username: user.username,
          email: user.email,
          documentosAceitosEm: serializeDate(user.legalAcceptedAt || user.lgpdAcceptedAt),
          versaoTermosAceita: user.termsVersion || 'legado-sem-versao',
          versaoPoliticaAceita: user.privacyPolicyVersion || 'legado-sem-versao',
          createdAt: serializeDate(user.createdAt),
          googleId: user.googleId ? '(vinculado)' : null,
          xpTotal: Number(user.xpTotal) || 0,
          streak: Number(user.streak) || 0,
          lastStudyDate: user.lastStudyDate || null,
          challengesAnswered: Number(user.challengesAnswered) || 0,
          challengesCorrect: Number(user.challengesCorrect) || 0,
        },
        historicoDesafios: challengeHistory.map((attempt) => ({
          challengeId: attempt.challengeId,
          tipoDesafio: attempt.tipoDesafio,
          categoria: attempt.categoria,
          dificuldade: attempt.dificuldade,
          titulo: attempt.titulo,
          acertou: attempt.acertou,
          usouDica: attempt.usouDica,
          xpGanho: attempt.xpGanho,
          respondidoEm: serializeDate(attempt.respondidoEm),
        })),
        tratamento: {
          finalidades: [
            'criar e manter a conta',
            'autenticar e proteger o acesso',
            'registrar o progresso de aprendizagem',
            'prevenir abuso e manter auditoria',
          ],
          fundamentos: [
            'execução do serviço solicitado pelo usuário',
            'segurança e prevenção a fraude',
            'cumprimento de obrigações aplicáveis quando necessário',
          ],
          compartilhamentos: [
            'Firebase/Google Cloud para conta e progresso',
            'MongoDB Atlas para auditoria',
            'Gmail/Google para mensagens de segurança',
            'Google Identity quando o login Google é escolhido',
          ],
        },
        historicoAuditoria: logs.map((log: any) => ({
          evento: log.event,
          dataHora: serializeDate(log.createdAt),
          detalhe: log.detail ?? null,
        })),
        solicitacoesPrivacidade: privacyRequests.map((request) => ({
          id: request.id,
          tipo: request.type,
          descricao: request.detail || null,
          status: request.status,
          solicitadaEm: serializeDate(request.requestedAt),
          atualizadaEm: serializeDate(request.updatedAt),
        })),
      });
    } catch (error) {
      console.error('[lgpd/data]', error);
      return res.status(500).json({ error: 'Erro interno.' });
    }
  },

  async exportData(req: Request, res: Response) {
    const userId = s(req).userId!;
    try {
      const user = await UserModel.findById(userId);
      if (!user) return res.status(404).json({ error: 'Usuário não encontrado.' });

      const [logs, challengeHistory, privacyRequests] = await Promise.all([
        getAllAuditLogsForUser(userId).catch((error) => {
          console.error('[lgpd] Falha ao exportar logs:', error);
          return [];
        }),
        UserModel.getAllChallengeHistory(userId),
        UserModel.getPrivacyRequests(userId),
      ]);
      audit({
        event: 'LGPD_DATA_EXPORT',
        userId,
        username: user.username,
        ip: getIp(req),
        detail: 'Titular exportou seus dados pessoais',
      }).catch(() => {});

      const payload = {
        exportadoEm: new Date().toISOString(),
        plataforma: 'MathStats',
        titular: {
          displayName: user.displayName || user.username,
          username: user.username,
          email: user.email,
          documentosAceitosEm: serializeDate(user.legalAcceptedAt || user.lgpdAcceptedAt),
          versaoTermosAceita: user.termsVersion || 'legado-sem-versao',
          versaoPoliticaAceita: user.privacyPolicyVersion || 'legado-sem-versao',
          contaCriadaEm: serializeDate(user.createdAt),
          loginGoogle: user.googleId ? 'Sim (vinculado)' : 'Não',
          xpTotal: Number(user.xpTotal) || 0,
          streak: Number(user.streak) || 0,
          lastStudyDate: user.lastStudyDate || null,
          challengesAnswered: Number(user.challengesAnswered) || 0,
          challengesCorrect: Number(user.challengesCorrect) || 0,
        },
        historicoDesafios: challengeHistory.map((attempt) => ({
          challengeId: attempt.challengeId,
          tipoDesafio: attempt.tipoDesafio,
          categoria: attempt.categoria,
          dificuldade: attempt.dificuldade,
          titulo: attempt.titulo,
          pergunta: attempt.pergunta,
          respostaUsuario: attempt.respostaUsuario,
          respostaCorreta: attempt.respostaCorreta,
          acertou: attempt.acertou,
          usouDica: attempt.usouDica,
          xpBase: attempt.xpBase,
          xpGanho: attempt.xpGanho,
          respondidoEm: serializeDate(attempt.respondidoEm),
        })),
        historicoAuditoria: logs.map((log: any) => ({
          evento: log.event,
          dataHora: serializeDate(log.createdAt),
          detalhe: log.detail ?? null,
          ip: log.ip ?? null,
        })),
        solicitacoesPrivacidade: privacyRequests.map((request) => ({
          id: request.id,
          tipo: request.type,
          descricao: request.detail || null,
          status: request.status,
          solicitadaEm: serializeDate(request.requestedAt),
          atualizadaEm: serializeDate(request.updatedAt),
        })),
        nota: 'Hash de senha, segredo MFA e outros dados de segurança não são exportados.',
      };

      res.setHeader(
        'Content-Disposition',
        `attachment; filename="mathstats-meus-dados-${userId}.json"`,
      );
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      return res.send(JSON.stringify(payload, null, 2));
    } catch (error) {
      console.error('[lgpd/export]', error);
      return res.status(500).json({ error: 'Erro interno.' });
    }
  },

  async correctProfile(req: Request, res: Response) {
    const userId = s(req).userId!;
    const { displayName } = req.body;
    if (!validDisplayName(displayName))
      return res
        .status(400)
        .json({ error: 'Informe um nome de exibição entre 2 e 60 caracteres.' });
    try {
      const user = await UserModel.findById(userId);
      if (!user) return res.status(404).json({ error: 'Usuário não encontrado.' });
      const moderation = validatePublicIdentity(displayName, 'O nome de exibição');
      if (!moderation.allowed) return res.status(400).json({ error: moderation.error });

      await UserModel.updateDisplayName(userId, displayName);
      audit({
        event: 'LGPD_PROFILE_CORRECTED',
        userId,
        username: user.username,
        ip: getIp(req),
        detail: 'Titular corrigiu o nome de exibição',
      }).catch(() => {});
      return res.json({ message: 'Nome de exibição atualizado.', displayName: displayName.trim() });
    } catch (error) {
      console.error('[lgpd/profile]', error);
      return res.status(500).json({ error: 'Erro interno.' });
    }
  },

  async requestDataRight(req: Request, res: Response) {
    const userId = s(req).userId!;
    const { type, detail } = req.body;
    if (!RIGHTS_REQUEST_TYPES.has(type))
      return res.status(400).json({ error: 'Tipo de solicitação inválido.' });
    if (detail != null && (typeof detail !== 'string' || detail.length > 500))
      return res.status(400).json({ error: 'A descrição deve ter no máximo 500 caracteres.' });
    try {
      const user = await UserModel.findById(userId);
      if (!user) return res.status(404).json({ error: 'Usuário não encontrado.' });
      const requestId = await UserModel.createPrivacyRequest(userId, type, detail?.trim());
      audit({
        event: 'LGPD_RIGHTS_REQUESTED',
        userId,
        username: user.username,
        ip: getIp(req),
        detail: `Solicitação do titular: ${type}`,
      }).catch(() => {});
      void sendPrivacyRequestNotification(
        user.username,
        user.email,
        type,
        detail?.trim() || '',
        requestId,
      ).catch((error) =>
        console.error('[mailer] Falha ao notificar solicitação de privacidade:', error),
      );
      return res.status(201).json({
        message: 'Solicitação registrada e enviada ao e-mail do projeto para análise.',
        requestId,
        status: 'received',
      });
    } catch (error) {
      console.error('[lgpd/request]', error);
      return res.status(500).json({ error: 'Erro interno.' });
    }
  },

  async getPrivacyRequests(req: Request, res: Response) {
    const userId = s(req).userId!;
    try {
      const requests = await UserModel.getPrivacyRequests(userId);
      return res.json({
        requests: requests.map((request) => ({
          id: request.id,
          type: request.type,
          detail: request.detail || null,
          status: request.status,
          requestedAt: serializeDate(request.requestedAt),
          updatedAt: serializeDate(request.updatedAt),
        })),
      });
    } catch (error) {
      console.error('[lgpd/requests]', error);
      return res.status(500).json({ error: 'Erro interno.' });
    }
  },

  async deleteAccount(req: Request, res: Response) {
    const userId = s(req).userId!;
    try {
      const user = await UserModel.findById(userId);
      if (!user) return res.status(404).json({ error: 'Usuário não encontrado.' });

      await audit({
        event: 'LGPD_ACCOUNT_DELETED',
        userId,
        username: user.username,
        ip: getIp(req),
        detail: 'Titular solicitou exclusão da conta e dos dados pessoais',
      });
      await UserModel.deleteUser(userId);
      await anonymizeAuditLogsForUser(userId);

      req.session.destroy(() => {});
      res.clearCookie(process.env.SESSION_COOKIE_NAME || 'mathstats.sid', {
        secure: true,
        httpOnly: true,
        sameSite: 'strict',
      });
      return res.json({ message: 'Conta e dados pessoais excluídos com sucesso.' });
    } catch (error) {
      console.error('[lgpd/delete]', error);
      return res.status(500).json({ error: 'Erro interno.' });
    }
  },

  async getMyAuditLogs(req: Request, res: Response) {
    const userId = s(req).userId!;
    try {
      const logs = await safeGetLogs(userId, 50);
      return res.json({
        logs: logs.map((log: any) => ({
          event: log.event,
          createdAt: serializeDate(log.createdAt),
          detail: log.detail ?? null,
          ip: log.ip ?? null,
        })),
      });
    } catch (error) {
      console.error('[lgpd/logs]', error);
      return res.status(500).json({ error: 'Erro interno.' });
    }
  },
};