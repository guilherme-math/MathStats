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

    const totalGols = jogos.reduce((total: number, jogo: any) => total + jogo.gols, 0);
    const mediaGols = Number((totalGols / jogos.length).toFixed(2));

    const jogosComGol = jogos.filter((jogo: any) => jogo.gols > 0).length;
    const porcentagemComGol = Math.round((jogosComGol / jogos.length) * 100);

    const jogosComDoisOuMais = jogos.filter((jogo: any) => jogo.gols >= 2).length;
    const maiorNumeroGols = Math.max(...jogos.map((jogo: any) => jogo.gols));

    var desafio: any;

    if (indice === 1) {
      desafio = {
        tipo: 'numeric',
        tipoDesafio: 'media_de_gols',
        categoria: 'Estatística',
        dificuldade: 'Fácil',
        titulo: 'Média de gols',
        contexto: 'Dados reais de futebol',
        historia: `Um analista está avaliando o desempenho ofensivo do Flamengo nos últimos 5 jogos. Nesse período, o time marcou ${totalGols} gols no total.`,
        pergunta: 'Qual foi a média de gols por partida?',
        dicas: [
          'Pense em como a média representa um valor distribuído igualmente entre todas as partidas.',
          `Divida o total de ${totalGols} gols pelas 5 partidas analisadas.`,
        ],
        explicacao: `A média é calculada dividindo ${totalGols} gols por 5 partidas. O resultado é ${mediaGols.toLocaleString('pt-BR')}.`,
        respostaCorreta: mediaGols,
        xp: 20,
        placeholder: 'Digite a média de gols',
      };
    } else if (indice === 2) {
      const alternativas = [0, 20, 40, 60, 80, 100]
        .filter((valor) => valor !== porcentagemComGol)
        .sort(() => Math.random() - 0.5)
        .slice(0, 3);

      alternativas.push(porcentagemComGol);
      alternativas.sort(() => Math.random() - 0.5);

      desafio = {
        tipo: 'multiple-choice',
        tipoDesafio: 'porcentagem_jogos_com_gol',
        categoria: 'Porcentagem',
        dificuldade: 'Médio',
        titulo: 'Frequência de gols',
        contexto: 'Dados reais de futebol',
        historia: `Nos últimos 5 jogos analisados, o Flamengo marcou pelo menos um gol em ${jogosComGol} partidas. Um analista quer transformar essa frequência em porcentagem.`,
        pergunta: 'Em qual porcentagem dessas partidas o Flamengo marcou pelo menos um gol?',
        dicas: [
          'Pense em qual parte dos 5 jogos teve pelo menos um gol marcado pelo Flamengo.',
          `Divida ${jogosComGol} por 5 e multiplique o resultado por 100.`,
        ],
        explicacao: `${jogosComGol} de 5 partidas corresponde a ${porcentagemComGol}%.`,
        respostaCorreta: porcentagemComGol + '%',
        options: alternativas.map((valor) => valor + '%'),
        xp: 30,
      };
    } else if (indice === 3) {
      const respostaProporcao = jogosComDoisOuMais + '/5';
      const alternativas = ['0/5', '1/5', '2/5', '3/5', '4/5', '5/5']
        .filter((valor) => valor !== respostaProporcao)
        .sort(() => Math.random() - 0.5)
        .slice(0, 3);

      alternativas.push(respostaProporcao);
      alternativas.sort(() => Math.random() - 0.5);

      desafio = {
        tipo: 'multiple-choice',
        tipoDesafio: 'proporcao_jogos',
        categoria: 'Proporção',
        dificuldade: 'Médio',
        titulo: 'Proporção de partidas',
        contexto: 'Dados reais de futebol',
        historia: `O treinador observou que o Flamengo marcou dois ou mais gols em ${jogosComDoisOuMais} dos últimos 5 jogos analisados.`,
        pergunta: 'Qual proporção representa as partidas em que o time marcou dois ou mais gols?',
        dicas: [
          'Uma proporção pode representar quantas partidas atenderam à condição em relação ao total analisado.',
          `Coloque ${jogosComDoisOuMais} no numerador e 5 no denominador.`,
        ],
        explicacao: `Foram ${jogosComDoisOuMais} partidas com dois ou mais gols em um total de 5. Portanto, a proporção é ${respostaProporcao}.`,
        respostaCorreta: respostaProporcao,
        options: alternativas,
        xp: 30,
      };
    } else if (indice === 4) {
      const verdadeiro = mediaGols >= 1;

      const golsPorJogo = jogos.map((jogo: any) => jogo.gols).join(', ');

      desafio = {
        tipo: 'true-false',
        tipoDesafio: 'comparacao_media',
        categoria: 'Estatística',
        dificuldade: 'Fácil',
        titulo: 'Análise da média',
        contexto: 'Dados reais de futebol',
        historia: `Nos últimos 5 jogos analisados, o Flamengo marcou respectivamente ${golsPorJogo} gols, totalizando ${totalGols}. Um torcedor afirmou que a equipe teve média de pelo menos 1 gol por partida.`,
        pergunta: 'A afirmação do torcedor está correta?',
        dicas: [
          'Calcule primeiro a média de gols dos cinco jogos e depois compare o resultado com a afirmação do torcedor.',
          `Divida ${totalGols} gols pelas 5 partidas e verifique se o resultado é igual ou maior que 1.`,
        ],
        explicacao: `A média foi de ${mediaGols.toLocaleString('pt-BR')} gol por partida. Portanto, a afirmação é ${verdadeiro ? 'verdadeira' : 'falsa'}.`,
        respostaCorreta: verdadeiro ? 'Verdadeiro' : 'Falso',
        options: ['Verdadeiro', 'Falso'],
        xp: 20,
      };
    } else {
      const alternativas = Array.from(
        new Set([
          maiorNumeroGols,
          Math.max(0, maiorNumeroGols - 1),
          maiorNumeroGols + 1,
          maiorNumeroGols + 2,
        ]),
      );

      while (alternativas.length < 4) {
        alternativas.push(alternativas.length);
      }

      desafio = {
        tipo: 'data-interpretation',
        tipoDesafio: 'interpretacao_dados',
        categoria: 'Análise de dados',
        dificuldade: 'Médio',
        titulo: 'Leitura de resultados',
        contexto: 'Últimos 5 jogos',
        historia:
          'Um analista comparou o número de gols marcados pelo Flamengo em cada uma das últimas 5 partidas.',
        pergunta:
          'Observando a tabela, qual foi o maior número de gols marcados pelo Flamengo em uma única partida?',
        dicas: [
          'Observe os valores da coluna que mostra os gols marcados pelo Flamengo e compare-os.',
          'Procure o maior número presente na coluna de gols do Flamengo.',
        ],
        explicacao: `O maior número de gols marcado pelo Flamengo em uma dessas partidas foi ${maiorNumeroGols}.`,
        respostaCorreta: String(maiorNumeroGols),
        options: alternativas
          .slice(0, 4)
          .sort(() => Math.random() - 0.5)
          .map(String),
        tabela: {
          headers: ['Adversário', 'Gols do Flamengo', 'Gols do adversário'],
          rows: jogos.map((jogo: any) => [
            jogo.adversario,
            String(jogo.gols),
            String(jogo.golsAdversario),
          ]),
        },
        xp: 30,
      };
    }

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
      explicacao: desafio.explicacao,
      xp: desafio.xp,
      placeholder: desafio.placeholder,
      options: desafio.options,
      tabela: desafio.tabela,
    });
  } catch (error: any) {
    const session = req.session as AppSession;
    const statusCode = Number(error?.statusCode) || 500;
    console.error('Erro ao gerar desafio:', error);
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

      if (desafio?.userId && desafio.userId !== userId) {
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

        if (isNaN(numero)) {
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
