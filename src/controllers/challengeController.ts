import { randomUUID } from 'node:crypto';
import { buildChallenge } from '../services/challengeBuilder';
import { buildSportsPractice, isPracticeTrail } from '../services/practiceTrails';
import { Request, Response } from 'express';
import { db } from '../config/firebase';
import { audit } from '../utils/auditLogger';
import type { AppSession } from '../types/session';
import { registerStudyDay } from '../utils/streak';
import type { Transaction } from 'firebase-admin/firestore';
import { getRecentTeamMatches } from '../services/footballService';
import { UserModel } from '../models/userModel';
import {
  isTrailId,
  summarizeTrail,
  trailLengths,
  type TrailProgress,
} from '../services/trailProgress';
import {
  challengeAnswerSchema,
  challengeIdSchema,
  challengeIndexSchema,
  practiceIndexSchema,
} from '../validation/challengeSchemas';

export const gerarDesafio = async (req: Request, res: Response) => {
  try {
    const trail = req.query.trilha ?? 'diagnostico';
    if (trail !== 'diagnostico' && !isPracticeTrail(trail)) {
      return res.status(400).json({ erro: 'Trilha inválida.' });
    }
    const total = trail === 'diagnostico' ? 5 : 10;
    const indexSchema = trail === 'diagnostico' ? challengeIndexSchema : practiceIndexSchema;
    const parsedIndex = indexSchema.safeParse(req.query.indice);
    if (!parsedIndex.success) {
      return res.status(400).json({ erro: `O índice do desafio deve estar entre 1 e ${total}.` });
    }
    const session = req.session as AppSession;
    const userId = session.userId!;
    const user = await UserModel.findById(userId);
    if (!user) return res.status(404).json({ erro: 'Conta não encontrada.' });
    const progress = summarizeTrail(user.trailProgress, trail);
    if (progress.completed || progress.answered.includes(parsedIndex.data)) {
      return res.status(409).json({ erro: 'Esta questão já foi concluída.', progresso: progress });
    }

    let desafio;
    if (trail === 'diagnostico') {
      const jogos = await getRecentTeamMatches(127, 2024);
      if (jogos.length < 5) {
        return res.status(400).json({ erro: 'Não há partidas suficientes para o diagnóstico.' });
      }
      desafio = buildChallenge(jogos, parsedIndex.data);
    } else {
      desafio = await buildSportsPractice(trail, parsedIndex.data);
      if (!desafio) return res.status(400).json({ erro: 'Questão inexistente nesta trilha.' });
    }

    const docRef = await db.collection('challenges').add({
      userId,
      trilha: trail,
      indice: parsedIndex.data,
      rodadaTrilha: user.trailRuns?.[trail] ?? null,
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
        const numero =
          typeof resposta === 'number'
            ? resposta
            : /^-?\d+(?:[.,]\d+)?$/.test(resposta)
              ? Number(resposta.replace(',', '.'))
              : NaN;

        if (!Number.isFinite(numero)) {
          throw Object.assign(new Error('Informe uma resposta numérica válida.'), {
            statusCode: 400,
          });
        }

        const margemErro = desafio?.trilha && desafio.trilha !== 'diagnostico' ? 0.000001 : 0.05;
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
      const trail = desafio?.trilha;
      const position = desafio?.indice;
      if (
        isTrailId(trail) &&
        (desafio?.rodadaTrilha ?? null) !== (userData?.trailRuns?.[trail] ?? null)
      ) {
        throw Object.assign(new Error('Esta questão pertence a uma tentativa anterior.'), {
          statusCode: 409,
        });
      }
      let trailProgress: TrailProgress | undefined;
      let progresso;
      if (
        isTrailId(trail) &&
        Number.isInteger(position) &&
        position >= 1 &&
        position <= trailLengths[trail]
      ) {
        const previous: TrailProgress = userData?.trailProgress ?? {};
        if (summarizeTrail(previous, trail).answered.includes(position)) {
          throw Object.assign(new Error('Esta questão já foi concluída.'), { statusCode: 409 });
        }
        trailProgress = {
          ...previous,
          [trail]: { ...previous[trail], [position]: { correct: acertou, xp: xpGanho } },
        };
        progresso = summarizeTrail(trailProgress, trail);
      }
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
          ...(trailProgress ? { trailProgress } : {}),
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
        progresso,
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
      progresso: resultado.progresso,
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

export const repetirTrilha = async (req: Request, res: Response) => {
  const trail = req.params.trilha;
  if (!isPracticeTrail(trail))
    return res.status(400).json({ erro: 'Somente trilhas de prática podem ser refeitas.' });
  const userId = (req.session as AppSession).userId!;
  const ref = db.collection('users').doc(userId);
  try {
    const status = await db.runTransaction(async (transaction) => {
      const user = (await transaction.get(ref)).data();
      if (!user) return 404;
      if (!summarizeTrail(user.trailProgress, trail).completed) return 409;
      const trailProgress: TrailProgress = { ...user.trailProgress };
      delete trailProgress[trail];
      transaction.update(ref, {
        trailProgress,
        trailRuns: { ...user.trailRuns, [trail]: randomUUID() },
      });
      return 200;
    });
    if (status === 404) return res.status(404).json({ erro: 'Conta não encontrada.' });
    if (status === 409)
      return res.status(409).json({ erro: 'Conclua a tentativa atual antes de refazer a trilha.' });
    return res.json({ mensagem: 'Nova tentativa iniciada.' });
  } catch (error) {
    console.error('[trail/restart]', error);
    return res.status(500).json({ erro: 'Não foi possível refazer a trilha agora.' });
  }
};
