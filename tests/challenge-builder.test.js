const test = require('node:test');
const assert = require('node:assert/strict');
const { buildChallenge } = require('../dist/services/challengeBuilder');

test('trilha calcula média, porcentagem, proporção, comparação e máximo dos mesmos jogos', () => {
  const games = [0, 1, 2, 3, 4].map((gols, index) => ({
    adversario: `Time ${index}`,
    gols,
    golsAdversario: 1,
  }));
  const expected = [2, '80%', '3/5', 'Verdadeiro', '4'];
  for (let index = 1; index <= 5; index += 1) {
    const challenge = buildChallenge(games, index);
    assert.equal(challenge.respostaCorreta, expected[index - 1]);
    if (challenge.options) {
      assert.ok(challenge.options.includes(challenge.respostaCorreta));
      assert.equal(new Set(challenge.options).size, challenge.options.length);
    }
  }
  assert.throws(() => buildChallenge(games.slice(1), 1));
  assert.throws(() => buildChallenge(games, 6));
});

test('partidas sem gols mantêm alternativas únicas e cálculo zero', () => {
  const games = Array.from({ length: 5 }, () => ({
    adversario: 'Time',
    gols: 0,
    golsAdversario: 0,
  }));
  assert.equal(buildChallenge(games, 1).respostaCorreta, 0);
  assert.equal(buildChallenge(games, 4).respostaCorreta, 'Falso');
  assert.equal(new Set(buildChallenge(games, 5).options).size, 4);
});
