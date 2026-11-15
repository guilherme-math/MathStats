const { test } = require('node:test');
const assert = require('node:assert/strict');
const football = require('../dist/services/footballService');
const { buildSportsPractice } = require('../dist/services/practiceTrails');
const { buildChallenge } = require('../dist/services/challengeBuilder');

test('todas as questões com alternativas incluem o gabarito uma vez, com dados reais ou simulados', async (t) => {
  const games = [
    [1, 2],
    [2, 3],
    [2, 2],
    [1, 0],
    [0, 2],
  ].map(([gols, golsAdversario], index) => ({
    adversario: 'Clube ' + index,
    gols,
    golsAdversario,
  }));
  const fixtures = t.mock.method(football, 'getRecentTeamMatches', async () => games);
  const players = t.mock.method(football, 'getTeamPlayers', async () => [
    { name: 'Jogador A', team: 'Clube', games: 10, goals: 5 },
    { name: 'Jogador B', team: 'Clube', games: 8, goals: 1 },
  ]);
  function check(question) {
    assert.ok(question.pergunta);
    if (question.tipo === 'numeric') assert.ok(Number.isFinite(question.respostaCorreta));
    else {
      assert.equal(new Set(question.options).size, question.options.length);
      assert.equal(
        question.options.filter((value) => value === question.respostaCorreta).length,
        1,
      );
    }
  }
  for (let i = 1; i <= 5; i++) check(buildChallenge(games, i));
  for (const trail of ['facil', 'media', 'avancada']) {
    for (let i = 1; i <= 10; i++) check(await buildSportsPractice(trail, i));
  }
  const points = await buildSportsPractice('avancada', 3);
  assert.equal(points.respostaCorreta, '27');
  assert.match(points.explicacao, /27%/);
  fixtures.mock.mockImplementation(async () => []);
  players.mock.mockImplementation(async () => []);
  for (const trail of ['facil', 'media', 'avancada']) {
    for (let i = 1; i <= 10; i++) check(await buildSportsPractice(trail, i));
  }
});

const topicGames = [
  [3, 1],
  [0, 2],
  [2, 2],
  [4, 0],
  [1, 3],
  [99, 0],
].map(([gols, golsAdversario], index) => ({
  adversario: 'Clube ' + index,
  gols,
  golsAdversario,
}));

test('trilhas por assunto calculam as respostas a partir dos cinco jogos exibidos', async (t) => {
  t.mock.method(football, 'getRecentTeamMatches', async () => topicGames);
  const cases = [
    ['soma', 5, 18],
    ['soma', 6, 2],
    ['multiplicacao', 5, 6],
    ['multiplicacao', 6, 1.4],
    ['medias', 5, 2],
    ['fracoes', 5, '4/5'],
  ];
  for (const [trail, position, answer] of cases) {
    const question = await buildSportsPractice(trail, position);
    assert.equal(question.respostaCorreta, answer, `${trail} ${position}`);
    assert.equal(question.contexto, 'Dados reais da API-Football');
    assert.deepEqual(
      question.tabela.rows.map(([, opponent]) => opponent),
      topicGames.slice(0, 5).map((game) => game.adversario),
    );
    if (trail === 'fracoes') {
      assert.equal(question.tipo, 'multiple-choice');
      assert.equal(question.options.filter((option) => option === answer).length, 1);
    } else {
      assert.equal(question.tipo, 'numeric');
    }
  }
});

test('trilha por assunto sinaliza indisponibilidade quando faltam partidas', async (t) => {
  t.mock.method(football, 'getRecentTeamMatches', async () => topicGames.slice(0, 4));
  await assert.rejects(buildSportsPractice('soma', 1), {
    message: 'Partidas insuficientes para montar a questão.',
    statusCode: 503,
  });
});

test('trilha de dificuldade usa exercício simulado se a consulta de jogos falhar', async (t) => {
  t.mock.method(football, 'getRecentTeamMatches', async () => {
    throw new Error('Indisponibilidade simulada');
  });
  const question = await buildSportsPractice('media', 1);
  assert.ok(question.pergunta);
  assert.equal(question.tabela, undefined);
  assert.notEqual(question.contexto, 'Dados reais da API-Football');
});
