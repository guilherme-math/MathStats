const test = require('node:test');
const assert = require('node:assert/strict');
const { isTrailId, summarizeTrail } = require('../dist/services/trailProgress');

test('progresso vazio começa na primeira questão', () => {
  assert.deepEqual(summarizeTrail(undefined, 'soma'), {
    answered: [],
    correct: 0,
    xp: 0,
    completed: false,
    next: 1,
  });
});

test('resumo retoma na primeira lacuna e ignora posições fora da trilha', () => {
  const answers = {
    0: { correct: true, xp: 100 },
    1: { correct: false, xp: 0 },
    3: { correct: true, xp: 20 },
    6: { correct: true, xp: 100 },
  };
  assert.deepEqual(summarizeTrail({ fracoes: answers }, 'fracoes'), {
    answered: [1, 3],
    correct: 1,
    xp: 20,
    completed: false,
    next: 2,
  });
});

test('uma trilha fica concluída ao responder todas as posições, mesmo com erros', () => {
  const answers = Object.fromEntries(
    [1, 2, 3, 4, 5].map((position) => [position, { correct: false, xp: 0 }]),
  );
  assert.deepEqual(summarizeTrail({ medias: answers }, 'medias'), {
    answered: [1, 2, 3, 4, 5],
    correct: 0,
    xp: 0,
    completed: true,
    next: null,
  });
  assert.equal(isTrailId('medias'), true);
  for (const value of [undefined, 3, 'toString', 'inexistente']) {
    assert.equal(isTrailId(value), false);
  }
});
