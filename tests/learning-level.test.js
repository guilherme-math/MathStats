const test = require('node:test');
const assert = require('node:assert/strict');

const { getLearningLevel } = require('../dist/utils/learningLevel');

test('nível de aprendizagem evolui conforme o XP acumulado', () => {
  assert.deepEqual(getLearningLevel(0), {
    number: 1,
    name: 'Iniciante',
    currentXp: 0,
    nextLevelXp: 100,
    progress: 0,
  });
  assert.equal(getLearningLevel(100).name, 'Aprendiz');
  assert.equal(getLearningLevel(300).name, 'Analista');
  assert.equal(getLearningLevel(700).name, 'Estrategista');
  assert.deepEqual(getLearningLevel(1500), {
    number: 5,
    name: 'Especialista',
    currentXp: 1500,
    nextLevelXp: null,
    progress: 100,
  });
});

test('nível ignora valores inválidos e não produz progresso fora do intervalo', () => {
  assert.equal(getLearningLevel(-20).currentXp, 0);
  assert.equal(getLearningLevel('invalido').progress, 0);
  assert.equal(getLearningLevel(299).progress, 100);
});
