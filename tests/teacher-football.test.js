const test = require('node:test');
const assert = require('node:assert/strict');
process.env.SESSION_SECRET = 'teacher-football-test-secret';
const {
  footballQuestion,
  signFootballSnapshot,
  readFootballSnapshot,
} = require('../dist/services/teacherFootball');
const data = {
  source: 'API-Football',
  context: 'team',
  team: 'Flamengo',
  season: 2024,
  collectedAt: new Date().toISOString(),
  matches: [
    { adversario: 'A', gols: 2, golsAdversario: 0 },
    { adversario: 'B', gols: 0, golsAdversario: 2 },
    { adversario: 'C', gols: 3, golsAdversario: 1 },
  ],
};
test('modelos usam o mesmo conjunto de dados e arredondamento explícito', () => {
  for (const [model, answer] of [
    ['mean', 1.67],
    ['sum', 5],
    ['balance', 2],
    ['percentage', 66.67],
  ]) {
    assert.equal(footballQuestion(data, model, 'numeric').answer, answer);
    for (let i = 0; i < 12; i++) {
      const q = footballQuestion(data, model, 'choice');
      assert.equal(q.options[q.answer], answer.toLocaleString('pt-BR'));
      assert.equal(new Set(q.options).size, 4);
    }
  }
});
test('snapshot é vinculado ao professor e rejeita alteração de dados', () => {
  const token = signFootballSnapshot('prof-a', data);
  assert.deepEqual(readFootballSnapshot(token, 'prof-a'), data);
  assert.throws(() => readFootballSnapshot(token, 'prof-b'));
  const [payload, signature] = token.split('.');
  const changed = JSON.parse(Buffer.from(payload, 'base64url').toString());
  changed.data.matches[0].gols = 500;
  assert.throws(() =>
    readFootballSnapshot(
      Buffer.from(JSON.stringify(changed)).toString('base64url') + '.' + signature,
      'prof-a',
    ),
  );
});
test('jogador admite média e total; não usa partidas inexistentes para saldo ou porcentagem', () => {
  const player = {
    ...data,
    context: 'player',
    matches: undefined,
    player: { name: 'Atleta', games: 30, goals: 20 },
  };
  assert.equal(footballQuestion(player, 'mean', 'numeric').answer, 0.67);
  assert.throws(() => footballQuestion(player, 'balance', 'numeric'));
});
