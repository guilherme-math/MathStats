const test = require('node:test');
const assert = require('node:assert/strict');

const { UserModel } = require('../dist/models/userModel');
const { DashboardController } = require('../dist/controllers/dashboardController');
const { getStudyDateKey } = require('../dist/utils/streak');

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

test('dashboard apresenta o estado inicial para aluno sem tentativas', async (t) => {
  const requestedIds = [];
  t.mock.method(UserModel, 'findById', async (userId) => {
    requestedIds.push(userId);
    return {
      id: userId,
      displayName: 'Ana Silva',
      username: 'ana.silva',
      email: 'ana@example.com',
      xpTotal: 0,
      streak: 0,
      challengesAnswered: 0,
      challengesCorrect: 0,
      passwordHash: 'hash',
    };
  });
  t.mock.method(UserModel, 'getChallengeHistory', async (userId, limit) => {
    requestedIds.push(userId);
    assert.equal(limit, 500);
    return [];
  });

  const response = responseRecorder();
  await DashboardController.dashboard({ session: { userId: 'student-1' } }, response);

  assert.equal(response.statusCode, 200);
  assert.deepEqual(requestedIds, ['student-1', 'student-1']);
  assert.equal(response.body.user.challengesAnswered, 0);
  assert.equal(response.body.user.accuracy, 0);
  assert.equal(response.body.dashboard.attemptsLast7Days, 0);
  assert.equal(response.body.dashboard.activity7Days.length, 7);
  assert.deepEqual(response.body.dashboard.categoryPerformance, []);
});

test('dashboard calcula big numbers, atividade semanal e desempenho por categoria', async (t) => {
  const today = getStudyDateKey();
  const todayAtNoon = new Date(`${today}T12:00:00.000Z`);
  const oldAttempt = new Date('2020-01-01T12:00:00.000Z');

  t.mock.method(UserModel, 'findById', async () => ({
    id: 'student-1',
    displayName: 'Ana Silva',
    username: 'ana.silva',
    email: 'ana@example.com',
    xpTotal: 75,
    streak: 2,
    lastStudyDate: today,
    challengesAnswered: 3,
    challengesCorrect: 2,
    passwordHash: 'hash',
    googleId: 'google-1',
  }));
  t.mock.method(UserModel, 'getChallengeHistory', async () => [
    {
      id: 'attempt-1',
      challengeId: 'challenge-1',
      categoria: 'Estatística',
      acertou: true,
      xpGanho: 30,
      respondidoEm: todayAtNoon,
    },
    {
      id: 'attempt-2',
      challengeId: 'challenge-2',
      categoria: 'Estatística',
      acertou: false,
      xpGanho: 5,
      respondidoEm: todayAtNoon,
    },
    {
      id: 'attempt-3',
      challengeId: 'challenge-3',
      categoria: 'Porcentagem',
      acertou: true,
      xpGanho: 40,
      respondidoEm: oldAttempt,
    },
  ]);

  const response = responseRecorder();
  await DashboardController.dashboard({ session: { userId: 'student-1' } }, response);

  assert.equal(response.statusCode, 200);
  assert.equal(response.body.user.xpTotal, 75);
  assert.equal(response.body.user.challengesIncorrect, 1);
  assert.equal(response.body.user.accuracy, 67);
  assert.equal(response.body.dashboard.attemptsLast7Days, 2);
  assert.equal(response.body.dashboard.correctLast7Days, 1);
  assert.equal(response.body.dashboard.accuracyLast7Days, 50);
  assert.equal(response.body.dashboard.xpLast7Days, 35);
  assert.deepEqual(response.body.dashboard.categoryPerformance, [
    { name: 'Estatística', answered: 2, correct: 1, xp: 35, accuracy: 50 },
    { name: 'Porcentagem', answered: 1, correct: 1, xp: 40, accuracy: 100 },
  ]);
});

test('dashboard informa ausência quando a conta da sessão não existe', async (t) => {
  t.mock.method(UserModel, 'findById', async () => null);
  t.mock.method(UserModel, 'getChallengeHistory', async () => {
    assert.fail('o histórico não deve ser consultado sem uma conta válida');
  });

  const response = responseRecorder();
  await DashboardController.dashboard({ session: { userId: 'missing-user' } }, response);

  assert.equal(response.statusCode, 404);
  assert.deepEqual(response.body, { error: 'Usuário não encontrado.' });
});
