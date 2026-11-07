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
