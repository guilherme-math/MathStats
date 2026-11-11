const test = require('node:test');
const assert = require('node:assert/strict');
const {
  activitySchema,
  gradeActivity,
  publicQuestions,
} = require('../dist/services/classActivities');
const questions = [
  {
    type: 'numeric',
    prompt: 'Média de 3 gols em 2 jogos?',
    answer: 1.5,
    explanation: 'Divida 3 por 2.',
  },
  {
    type: 'choice',
    prompt: 'Quanto é 2 + 3?',
    options: ['4', '5'],
    answer: 1,
    explanation: 'São 5.',
  },
];
test('gabarito e explicação não integram as questões de resolução', () => {
  const visible = publicQuestions(questions);
  assert.equal(visible[0].answer, undefined);
  assert.equal(visible[0].explanation, undefined);
  assert.deepEqual(visible[1].options, ['4', '5']);
});
test('correção aceita vírgula decimal e distingue índice de alternativa', () => {
  const result = gradeActivity(questions, ['1,5', 1]);
  assert.equal(result.correct, 2);
  assert.equal(gradeActivity(questions, ['1.5', 0]).correct, 1);
});
test('entradas incompletas, letras, infinitos e alternativas externas são recusados', () => {
  for (const answers of [[], ['1gol', 1], ['Infinity', 1], ['1.5', 2], ['1.5', '1'], ['1.5', null]])
    assert.equal(gradeActivity(questions, answers), null);
});
test('atividade exige conteúdo completo e alternativa correta existente e única', () => {
  assert.equal(activitySchema.safeParse({ title: 'Teste', questions }).success, true);
  for (const changes of [{ options: ['4', '4'] }, { answer: 4 }, { explanation: '' }]) {
    assert.equal(
      activitySchema.safeParse({ title: 'Teste', questions: [{ ...questions[1], ...changes }] })
        .success,
      false,
    );
  }
  assert.equal(activitySchema.safeParse({ title: 'Teste', questions: [] }).success, false);
});
