const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const request = require('supertest');

process.env.NODE_ENV = 'test';

const {
  challengeGenerationLimiter,
  challengeAnswerLimiter,
} = require('../dist/middlewares/security');
const {
  challengeIndexSchema,
  challengeIdSchema,
  challengeAnswerSchema,
} = require('../dist/validation/challengeSchemas');
const { normalizeRecentMatches } = require('../dist/services/footballService');
const { getRecentTeamMatches } = require('../dist/services/footballService');

test('limite de geração bloqueia a vigésima primeira requisição', async () => {
  const app = express();
  app.set('trust proxy', 1);
  app.use(challengeGenerationLimiter);
  app.get('/desafio', (_req, res) => res.json({ ok: true }));

  for (let attempt = 1; attempt <= 20; attempt += 1) {
    assert.equal((await request(app).get('/desafio')).status, 200);
  }
  assert.equal((await request(app).get('/desafio')).status, 429);
});

test('limite de respostas bloqueia a trigésima primeira requisição', async () => {
  const app = express();
  app.set('trust proxy', 1);
  app.use(challengeAnswerLimiter);
  app.post('/responder', (_req, res) => res.json({ ok: true }));

  for (let attempt = 1; attempt <= 30; attempt += 1) {
    assert.equal((await request(app).post('/responder')).status, 200);
  }
  assert.equal((await request(app).post('/responder')).status, 429);
});

test('schemas aceitam o contrato esperado e rejeitam entradas fora dele', () => {
  assert.equal(challengeIndexSchema.parse(undefined), 1);
  assert.equal(challengeIndexSchema.parse('5'), 5);
  assert.equal(challengeIndexSchema.safeParse('6').success, false);
  assert.equal(challengeIndexSchema.safeParse('texto').success, false);

  assert.equal(challengeIdSchema.safeParse('AbCdEf1234567890GhIj').success, true);
  assert.equal(challengeIdSchema.safeParse('../outro-usuario').success, false);

  assert.deepEqual(challengeAnswerSchema.parse({ resposta: '40%', usouDica: true }), {
    resposta: '40%',
    usouDica: true,
  });
  assert.equal(challengeAnswerSchema.safeParse({ resposta: '' }).success, false);
  assert.equal(
    challengeAnswerSchema.safeParse({ resposta: '40%', campoInesperado: true }).success,
    false,
  );
});

test('normalização usa somente jogos finalizados e os cinco mais recentes', () => {
  const fixtures = [
    ['FT', 127, 'Time A', 1, 0],
    ['NS', 127, 'Time B', null, null],
    ['FT', 10, 'Time C', 2, 3],
    ['FT', 127, 'Time D', 2, 1],
    ['FT', 20, 'Time E', 1, 4],
    ['FT', 127, 'Time F', 0, 0],
    ['FT', 30, 'Time G', 2, 1],
  ].map(([status, homeId, opponent, homeGoals, awayGoals]) => ({
    fixture: { status: { short: status } },
    teams: {
      home: { id: homeId, name: homeId === 127 ? 'Flamengo' : opponent },
      away: { id: homeId === 127 ? 99 : 127, name: homeId === 127 ? opponent : 'Flamengo' },
    },
    goals: { home: homeGoals, away: awayGoals },
  }));

  const matches = normalizeRecentMatches(fixtures, 127);
  assert.equal(matches.length, 5);
  assert.deepEqual(matches[0], { adversario: 'Time C', gols: 3, golsAdversario: 2 });
  assert.deepEqual(matches[4], { adversario: 'Time G', gols: 1, golsAdversario: 2 });
});

test('integração repete falha temporária e usa o último cache válido', async () => {
  const axiosModule = require('axios');
  const axios = axiosModule.default || axiosModule;
  const originalGet = axios.get;
  const originalNow = Date.now;
  const originalWarn = console.warn;
  let now = 1_000;
  let calls = 0;

  const response = {
    data: {
      response: Array.from({ length: 5 }, (_, index) => ({
        fixture: { status: { short: 'FT' } },
        teams: {
          home: { id: 555, name: 'MathStats FC' },
          away: { id: index + 1, name: `Adversário ${index + 1}` },
        },
        goals: { home: index, away: 0 },
      })),
    },
  };

  try {
    Date.now = () => now;
    console.warn = () => {};
    axios.get = async () => {
      calls += 1;
      if (calls === 1) return response;
      throw Object.assign(new Error('timeout'), { isAxiosError: true });
    };

    const initial = await getRecentTeamMatches(555, 2024);
    now += 6 * 60 * 1000;
    const cached = await getRecentTeamMatches(555, 2024);

    assert.deepEqual(cached, initial);
    assert.equal(calls, 3);
  } finally {
    axios.get = originalGet;
    Date.now = originalNow;
    console.warn = originalWarn;
  }
});
