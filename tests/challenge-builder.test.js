const test = require('node:test');
const assert = require('node:assert/strict');
const { buildChallenge } = require('../dist/services/challengeBuilder');

function createGames(goals = [0, 1, 2, 3, 4]) {
  return goals.map((gols, index) => ({
    adversario: `Time ${index + 1}`,
    gols,
    golsAdversario: 1,
  }));
}

test('cria o desafio de média com a resposta e os dados esperados', () => {
  // Arrange
  const games = createGames();

  // Act
  const challenge = buildChallenge(games, 1);

  // Assert
  assert.equal(challenge.tipoDesafio, 'media_de_gols');
  assert.equal(challenge.respostaCorreta, 2);
  assert.equal(challenge.xp, 20);
});

test('rejeita uma trilha com menos de cinco partidas informando tipo e mensagem', () => {
  // Arrange
  const games = createGames().slice(0, 4);

  // Act
  assert.throws(
    () => buildChallenge(games, 1),
    (error) => {
      // Assert
      assert.equal(error.constructor, Error);
      assert.equal(error.message, 'A trilha exige cinco partidas e um índice entre 1 e 5.');
      return true;
    },
  );
});

test('mantém quatro alternativas únicas no limite de cinco partidas sem gols', () => {
  // Arrange
  const games = createGames([0, 0, 0, 0, 0]);

  // Act
  const challenge = buildChallenge(games, 5);

  // Assert
  assert.equal(challenge.respostaCorreta, '0');
  assert.equal(challenge.options.length, 4);
  assert.equal(new Set(challenge.options).size, 4);
});

test('calcula cada tipo de desafio a partir do mesmo conjunto de partidas (parametrizado)', () => {
  // Arrange
  const games = createGames();
  const scenarios = [
    { index: 1, expected: 2 },
    { index: 2, expected: '80%' },
    { index: 3, expected: '3/5' },
    { index: 4, expected: 'Verdadeiro' },
    { index: 5, expected: '4' },
  ];

  for (const { index, expected } of scenarios) {
    // Act
    const challenge = buildChallenge(games, index);

    // Assert
    assert.equal(challenge.respostaCorreta, expected, `índice ${index}`);
    if (challenge.options) {
      assert.ok(challenge.options.includes(challenge.respostaCorreta), `índice ${index}`);
    }
  }
});
