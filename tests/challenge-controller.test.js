const test = require('node:test');
const assert = require('node:assert/strict');

process.env.NODE_ENV = 'test';

function responseRecorder() {
  return {
    statusCode: 200,
    body: undefined,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    },
  };
}

function challengeRequest(overrides = {}) {
  return {
    query: { indice: '1' },
    params: { id: 'AbCdEf1234567890GhIj' },
    body: { resposta: 2, usouDica: false },
    session: { userId: 'student-1', username: 'ana' },
    ip: '127.0.0.1',
    socket: {},
    ...overrides,
  };
}

test('controller gera desafio vinculado ao aluno autenticado', async (t) => {
  const football = require('../dist/services/footballService');
  const firebase = require('../dist/config/firebase');
  const auditLogger = require('../dist/utils/auditLogger');
  const { gerarDesafio } = require('../dist/controllers/challengeController');
  let savedChallenge;
  let auditEntry;

  t.mock.method(football, 'getRecentTeamMatches', async () =>
    Array.from({ length: 5 }, (_, index) => ({
      adversario: `Time ${index + 1}`,
      gols: index,
      golsAdversario: 0,
    })),
  );
  t.mock.method(firebase.db, 'collection', () => ({
    add: async (challenge) => {
      savedChallenge = challenge;
      return { id: 'challenge-created' };
    },
  }));
  t.mock.method(auditLogger, 'audit', async (entry) => {
    auditEntry = entry;
  });

  const response = responseRecorder();
  await gerarDesafio(challengeRequest(), response);

  assert.equal(response.statusCode, 200);
  assert.equal(response.body.idDesafio, 'challenge-created');
  assert.equal(savedChallenge.userId, 'student-1');
  assert.equal(savedChallenge.tipo, 'numeric');
  assert.equal(auditEntry.event, 'CHALLENGE_CREATED');
  assert.equal(auditEntry.userId, 'student-1');
});

test('controller recusa índice inválido antes de consultar dados esportivos', async (t) => {
  const football = require('../dist/services/footballService');
  const { gerarDesafio } = require('../dist/controllers/challengeController');
  const getMatches = t.mock.method(football, 'getRecentTeamMatches', async () => []);
  const response = responseRecorder();

  await gerarDesafio(challengeRequest({ query: { indice: '9' } }), response);

  assert.equal(response.statusCode, 400);
  assert.match(response.body.erro, /índice/i);
  assert.equal(getMatches.mock.callCount(), 0);
});

test('controller registra resposta correta e atualiza progresso em uma transação', async (t) => {
  const firebase = require('../dist/config/firebase');
  const auditLogger = require('../dist/utils/auditLogger');
  const { responderDesafio } = require('../dist/controllers/challengeController');
  const writes = [];
  let auditEntry;

  const challengeRef = { kind: 'challenge' };
  const userRef = {
    kind: 'user',
    collection: () => ({ doc: () => ({ kind: 'attempt' }) }),
  };

  t.mock.method(firebase.db, 'collection', (name) => ({
    doc: () => (name === 'challenges' ? challengeRef : userRef),
  }));
  t.mock.method(firebase.db, 'runTransaction', async (callback) =>
    callback({
      get: async (reference) =>
        reference.kind === 'challenge'
          ? {
              exists: true,
              data: () => ({
                userId: 'student-1',
                tipo: 'numeric',
                tipoDesafio: 'media-gols',
                categoria: 'Estatística',
                dificuldade: 'Fácil',
                titulo: 'Média de gols',
                pergunta: 'Qual é a média?',
                respostaCorreta: 2,
                explicacao: 'A média é 2.',
                xp: 20,
              }),
            }
          : {
              exists: true,
              data: () => ({
                xpTotal: 80,
                streak: 0,
                challengesAnswered: 0,
                challengesCorrect: 0,
              }),
            },
      update: (reference, value) => writes.push({ action: 'update', reference, value }),
      set: (reference, value) => writes.push({ action: 'set', reference, value }),
    }),
  );
  t.mock.method(auditLogger, 'audit', async (entry) => {
    auditEntry = entry;
  });

  const response = responseRecorder();
  await responderDesafio(challengeRequest(), response);

  assert.equal(response.statusCode, 200);
  assert.equal(response.body.acertou, true);
  assert.equal(response.body.xpGanho, 20);
  assert.equal(response.body.xpTotal, 100);
  assert.equal(response.body.challengesAnswered, 1);
  assert.equal(response.body.challengesCorrect, 1);
  assert.equal(writes.length, 3);
  assert.equal(auditEntry.event, 'CHALLENGE_ANSWERED');
});

test('controller impede que um aluno responda desafio pertencente a outra conta', async (t) => {
  const firebase = require('../dist/config/firebase');
  const { responderDesafio } = require('../dist/controllers/challengeController');
  const challengeRef = { kind: 'challenge' };
  const userRef = {
    kind: 'user',
    collection: () => ({ doc: () => ({ kind: 'attempt' }) }),
  };

  t.mock.method(firebase.db, 'collection', (name) => ({
    doc: () => (name === 'challenges' ? challengeRef : userRef),
  }));
  t.mock.method(firebase.db, 'runTransaction', async (callback) =>
    callback({
      get: async (reference) =>
        reference.kind === 'challenge'
          ? { exists: true, data: () => ({ userId: 'another-student' }) }
          : { exists: true, data: () => ({}) },
    }),
  );

  const response = responseRecorder();
  await responderDesafio(challengeRequest(), response);

  assert.equal(response.statusCode, 403);
  assert.match(response.body.erro, /não possui acesso/i);
});
