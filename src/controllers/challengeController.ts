import { buildChallenge } from '../services/challengeBuilder';
import { Request, Response } from 'express';
import { db } from '../config/firebase';
import { audit } from '../utils/auditLogger';
import type { AppSession } from '../types/session';
import { registerStudyDay } from '../utils/streak';
import type { Transaction } from 'firebase-admin/firestore';
import { getRecentTeamMatches } from '../services/footballService';
import {
  challengeAnswerSchema,
  challengeIdSchema,
  challengeIndexSchema,
} from '../validation/challengeSchemas';

export const gerarDesafio = async (req: Request, res: Response) => {
  try {
    const parsedIndex = challengeIndexSchema.safeParse(req.query.indice);
    if (!parsedIndex.success) {
      return res.status(400).json({ erro: 'O índice do desafio deve estar entre 1 e 5.' });
    }

    const indice = parsedIndex.data;
    const teamId = 127;
    const session = req.session as AppSession;
    const userId = session.userId!;

    const jogos = await getRecentTeamMatches(teamId, 2024);

    if (jogos.length < 5) {
      return res
        .status(400)
        .json({ erro: 'Não existem jogos finalizados suficientes para gerar a trilha.' });
    }

    const desafio = buildChallenge(jogos, indice);

    const docRef = await db.collection('challenges').add({
      userId,
      tipo: desafio.tipo,
      tipoDesafio: desafio.tipoDesafio,
      categoria: desafio.categoria,
      dificuldade: desafio.dificuldade,
      titulo: desafio.titulo,
      pergunta: desafio.pergunta,
      respostaCorreta: desafio.respostaCorreta,
      explicacao: desafio.explicacao,
      xp: desafio.xp,
      criadoEm: new Date(),
    });

    await audit({
      event: 'CHALLENGE_CREATED',
      userId,
      username: session.username,
      ip: req.ip ?? req.socket?.remoteAddress ?? 'unknown',
      detail: desafio.tipoDesafio,
    });

    res.json({
      idDesafio: docRef.id,
      tipo: desafio.tipo,
      categoria: desafio.categoria,
      dificuldade: desafio.dificuldade,
      titulo: desafio.titulo,
      contexto: desafio.contexto,
      historia: desafio.historia,
      pergunta: desafio.pergunta,
      dicas: desafio.dicas,
      xp: desafio.xp,
      placeholder: desafio.placeholder,
      options: desafio.options,
      tabela: desafio.tabela,
    });
  } catch (error: any) {
    const session = req.session as AppSession;
    const statusCode = Number(error?.statusCode) || 500;
    console.error('[challenge] Falha ao gerar desafio.', { statusCode });
    await audit({
      event: 'CHALLENGE_GENERATION_FAILED',
      userId: session.userId,
      username: session.username,
      ip: req.ip ?? req.socket?.remoteAddress ?? 'unknown',
      detail: `status:${statusCode}`,
    });
    return res.status(statusCode).json({
      erro:
        statusCode === 503
          ? 'Os dados esportivos estão indisponíveis no momento. Tente novamente em instantes.'
          : 'Erro interno no servidor ao gerar o desafio.',
    });
  }
};

export const responderDesafio = async (req: Request<{ id: string }>, res: Response) => {
  try {
    const parsedId = challengeIdSchema.safeParse(req.params.id);
    const parsedBody = challengeAnswerSchema.safeParse(req.body);
    if (!parsedId.success || !parsedBody.success) {
      return res.status(400).json({ erro: 'Os dados enviados para o desafio são inválidos.' });
    }

    const id = parsedId.data;
    const { resposta, usouDica } = parsedBody.data;
    const session = req.session as AppSession;
    const userId = session.userId!;

    const docRef = db.collection('challenges').doc(id);
    const userRef = db.collection('users').doc(userId);
    const attemptRef = userRef.collection('attempts').doc(id);

    const resultado = await db.runTransaction(async (transaction: Transaction) => {
      const [challengeDoc, userDoc] = await Promise.all([
        transaction.get(docRef),
        transaction.get(userRef),
      ]);

      if (!challengeDoc.exists) {
        throw Object.assign(new Error('Desafio não encontrado.'), { statusCode: 404 });
      }

      if (!userDoc.exists) {
        throw Object.assign(new Error('Usuário não encontrado.'), { statusCode: 404 });
      }

      const desafio = challengeDoc.data();

      if (desafio?.userId !== userId) {
        throw Object.assign(new Error('Você não possui acesso a este desafio.'), {
          statusCode: 403,
        });
      }

      if (desafio?.respondidoEm) {
        throw Object.assign(new Error('Este desafio já foi respondido.'), { statusCode: 409 });
      }

      const respostaCorreta = desafio?.respostaCorreta;
      const tipo = desafio?.tipo;

      let acertou = false;
      let respostaUsuario: any = resposta;

      if (tipo === 'numeric') {
        const numero = Number(resposta);

        if (!Number.isFinite(numero)) {
          throw Object.assign(new Error('Informe uma resposta numérica válida.'), {
            statusCode: 400,
          });
        }

        const margemErro = 0.05;
        acertou = Math.abs(numero - Number(respostaCorreta)) <= margemErro;
        respostaUsuario = numero;
      } else {
        const normalizar = (valor: any) =>
          String(valor)
            .trim()
            .toLowerCase()
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '');

        acertou = normalizar(resposta) === normalizar(respostaCorreta);
      }

      const xpBase = Number(desafio?.xp) || 0;
      const xpGanho = acertou ? (Boolean(usouDica) ? Math.floor(xpBase / 2) : xpBase) : 0;

      const userData = userDoc.data();
      const xpAtual = Number(userData?.xpTotal) || 0;
      const xpTotal = xpAtual + xpGanho;
      const study = registerStudyDay(
        Number(userData?.streak) || 0,
        typeof userData?.lastStudyDate === 'string' ? userData.lastStudyDate : null,
      );
      const challengesAnswered = (Number(userData?.challengesAnswered) || 0) + 1;
      const challengesCorrect = (Number(userData?.challengesCorrect) || 0) + (acertou ? 1 : 0);
      const respondidoEm = new Date();

      transaction.update(docRef, {
        respostaUsuario,
        acertou,
        usouDica: Boolean(usouDica),
        xpGanho,
        respondidoEm,
      });

      transaction.set(
        userRef,
        {
          xpTotal,
          streak: study.streak,
          lastStudyDate: study.lastStudyDate,
          challengesAnswered,
          challengesCorrect,
          lastChallengeAt: respondidoEm,
        },
        { merge: true },
      );

      transaction.set(attemptRef, {
        challengeId: id,
        tipo: desafio?.tipo || 'desafio',
        tipoDesafio: desafio?.tipoDesafio || 'desafio',
        categoria: desafio?.categoria || 'Matemática',
        dificuldade: desafio?.dificuldade || 'Não informado',
        titulo: desafio?.titulo || 'Desafio MathStats',
        pergunta: desafio?.pergunta || '',
        respostaUsuario,
        respostaCorreta,
        acertou,
        usouDica: Boolean(usouDica),
        xpBase,
        xpGanho,
        respondidoEm,
      });

      return {
        acertou,
        respostaCorreta,
        explicacao: desafio?.explicacao || 'Confira os dados apresentados e revise o cálculo.',
        tipoDesafio: desafio?.tipoDesafio || 'desafio',
        xpGanho,
        xpTotal,
        streak: study.streak,
        lastStudyDate: study.lastStudyDate,
        streakChanged: study.changed,
        challengesAnswered,
        challengesCorrect,
        accuracy:
          challengesAnswered > 0 ? Math.round((challengesCorrect / challengesAnswered) * 100) : 0,
      };
    });

    await audit({
      event: 'CHALLENGE_ANSWERED',
      userId,
      username: session.username,
      ip: req.ip ?? req.socket?.remoteAddress ?? 'unknown',
      detail: `${resultado.tipoDesafio} | ${resultado.acertou ? 'acerto' : 'erro'} | dica:${Boolean(usouDica) ? 'sim' : 'não'} | xp:${resultado.xpGanho} | ofensiva:${resultado.streak}`,
    });

    return res.json({
      acertou: resultado.acertou,
      respostaCorreta: resultado.respostaCorreta,
      mensagem: resultado.acertou ? 'Resposta correta!' : 'Resposta incorreta.',
      explicacao: resultado.explicacao,
      xpGanho: resultado.xpGanho,
      xpTotal: resultado.xpTotal,
      streak: resultado.streak,
      lastStudyDate: resultado.lastStudyDate,
      streakChanged: resultado.streakChanged,
      challengesAnswered: resultado.challengesAnswered,
      challengesCorrect: resultado.challengesCorrect,
      accuracy: resultado.accuracy,
    });
  } catch (error: any) {
    const statusCode = Number(error?.statusCode) || 500;
    if (statusCode >= 500) console.error('Erro ao validar resposta:', error);
    return res.status(statusCode).json({
      erro: statusCode >= 500 ? 'Erro interno no servidor ao validar a resposta.' : error.message,
    });
  }
};
