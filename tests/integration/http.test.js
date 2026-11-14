const { test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const admin = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const express = require('express');
const session = require('express-session');
const request = require('supertest');

assert.match(process.env.FIRESTORE_EMULATOR_HOST || '', /^127\.0\.0\.1:/);
assert.match(process.env.MONGODB_URI || '', /^mongodb:\/\/127\.0\.0\.1:/);
admin.initializeApp({ projectId: 'demo-mathstats-integration' });
const db = getFirestore();
const { UserModel } = require('../../dist/models/userModel');
const { FirestoreSessionStore } = require('../../dist/stores/firestoreSessionStore');
const { decryptAES } = require('../../dist/utils/crypto');
const speakeasy = require('speakeasy');
const { validateSession } = require('../../dist/middlewares/auth');
const { getMongoDb } = require('../../dist/config/mongodb');
const axios = require('axios');

let server;
let client;
let user;
let cookie;
let store;
let originalAdapter;

before(async () => {
  originalAdapter = axios.defaults.adapter;
  // Only the external transport is substituted; footballService and challengeBuilder stay real.
  axios.defaults.adapter = async (config) => ({
    status: 200,
    statusText: 'OK',
    headers: {},
    config,
    data: {
      response: config.url.endsWith('/players')
        ? [
            {
              player: { name: 'Jogador de teste' },
              statistics: [
                {
                  team: { id: config.params.team, name: 'Clube de teste' },
                  league: { id: 71 },
                  games: { appearences: 10 },
                  goals: { total: 5 },
                },
              ],
            },
          ]
        : Array.from({ length: 5 }, (_, i) => ({
            fixture: { status: { short: 'FT' } },
            teams: {
              home: { id: config.params.team, name: 'Clube de teste' },
              away: { id: i + 1, name: `Time ${i}` },
            },
            goals: { home: 2, away: 1 },
          })),
    },
  });
  store = new FirestoreSessionStore();
  const app = express();
  app.use(express.json());
  app.use(
    session({
      name: 'mathstats.sid',
      secret: process.env.SESSION_SECRET,
      resave: false,
      saveUninitialized: false,
      store,
    }),
  );
  app.use(validateSession);
  const { AuthController } = require('../../dist/controllers/authController');
  require('../../dist/utils/mailer').sendWelcomeEmail = async () => {};
  app.post('/api/signup', AuthController.signup);
  app.post('/api/login', AuthController.login);
  app.post('/api/verify-token', AuthController.verifyToken);
  app.use('/api', require('../../dist/routes/challengeRoutes').default);
  app.use('/api', require('../../dist/routes/dashboardRoutes').default);
  app.use('/api', require('../../dist/routes/classRoutes').default);
  server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  client = request(`http://127.0.0.1:${server.address().port}`);
});

beforeEach(async () => {
  const suffix = randomUUID().replaceAll('-', '').slice(0, 12);
  const username = `aluno_${suffix}`;
  const signup = await client.post('/api/signup').send({
    displayName: 'Aluno integração',
    username,
    email: `${suffix}@example.invalid`,
    password: 'Integracao@123',
    lgpdAccepted: true,
    ageConfirmed: true,
  });
  assert.equal(signup.status, 201);
  user = await UserModel.findByUsername(username);
  const login = await client.post('/api/login').send({ username, password: 'Integracao@123' });
  assert.equal(login.status, 200);
  const pending = login.headers['set-cookie'][0].split(';')[0];
  const token = speakeasy.totp({ secret: decryptAES(user.twoFactorSecret), encoding: 'base32' });
  const verified = await client.post('/api/verify-token').set('Cookie', pending).send({ token });
  assert.equal(verified.status, 200);
  cookie = verified.headers['set-cookie'][0].split(';')[0];
});

after(async () => {
  axios.defaults.adapter = originalAdapter;
  if (server) await new Promise((resolve) => server.close(resolve));
  await db.terminate();
  // MongoDB is disposable and owned by run.js. Force-closing its process ends driver sockets.
});

async function generate() {
  const response = await client.get('/api/desafio?indice=1').set('Cookie', cookie);
  assert.equal(response.status, 200);
  assert.ok(response.body.idDesafio);
  assert.equal(response.body.respostaCorreta, undefined);
  return response.body.idDesafio;
}

test('gerar_comAluno_devePersistirDesafioSemExporResposta', async () => {
  const id = await generate();
  const doc = await db.collection('challenges').doc(id).get();
  assert.equal(doc.data().userId, user.id);
  assert.equal(doc.data().respostaCorreta, 2);
});

test('gerar_semSessao_deveRetornar401ComMensagem', async () => {
  const response = await client.get('/api/desafio');
  assert.equal(response.status, 401);
  assert.match(response.body.error, /login/i);
});

test('gerar_comIndiceInvalido_deveRetornar400ComMensagem', async () => {
  const response = await client.get('/api/desafio?indice=9').set('Cookie', cookie);
  assert.equal(response.status, 400);
  assert.match(response.body.erro, /índice/i);
});

test('responder_comAcerto_devePersistirTentativaEXp', async () => {
  const id = await generate();
  const response = await client
    .post(`/api/desafio/${id}/responder`)
    .set('Cookie', cookie)
    .send({ resposta: 2 });
  assert.equal(response.status, 200);
  assert.equal(response.body.acertou, true);
  assert.equal(response.body.xpGanho, 20);
  const saved = await db.collection('users').doc(user.id).collection('attempts').doc(id).get();
  assert.equal(saved.data().acertou, true);
  assert.equal((await UserModel.findById(user.id)).xpTotal, 20);
});

test('responder_comDica_deveConcederMetadeDoXp', async () => {
  const id = await generate();
  const response = await client
    .post(`/api/desafio/${id}/responder`)
    .set('Cookie', cookie)
    .send({ resposta: 2, usouDica: true });
  assert.equal(response.status, 200);
  assert.equal(response.body.xpGanho, 10);
});

test('responder_comErro_deveRegistrarTentativaSemXp', async () => {
  const id = await generate();
  const response = await client
    .post(`/api/desafio/${id}/responder`)
    .set('Cookie', cookie)
    .send({ resposta: 9 });
  assert.equal(response.status, 200);
  assert.equal(response.body.acertou, false);
  assert.equal(response.body.xpGanho, 0);
});

test('responder_comIdInexistente_deveRetornar404', async () => {
  const response = await client
    .post('/api/desafio/AAAAAAAAAAAAAAAAAAAA/responder')
    .set('Cookie', cookie)
    .send({ resposta: 2 });
  assert.equal(response.status, 404);
  assert.match(response.body.erro, /não encontrado/i);
});

test('responder_semSessao_deveRetornar401', async () => {
  const response = await client
    .post('/api/desafio/AAAAAAAAAAAAAAAAAAAA/responder')
    .send({ resposta: 2 });
  assert.equal(response.status, 401);
  assert.match(response.body.error, /login/i);
});

test('responder_comOutraConta_deveRetornar403', async () => {
  const id = await generate();
  await db.collection('challenges').doc(id).update({ userId: 'another-account' });
  const response = await client
    .post(`/api/desafio/${id}/responder`)
    .set('Cookie', cookie)
    .send({ resposta: 2 });
  assert.equal(response.status, 403);
  assert.match(response.body.erro, /acesso/i);
});

test('responder_duasVezes_deveRetornar409SemDuplicarXp', async () => {
  const id = await generate();
  await client.post(`/api/desafio/${id}/responder`).set('Cookie', cookie).send({ resposta: 2 });
  const response = await client
    .post(`/api/desafio/${id}/responder`)
    .set('Cookie', cookie)
    .send({ resposta: 2 });
  assert.equal(response.status, 409);
  assert.match(response.body.erro, /já foi respondido/i);
  assert.equal((await UserModel.findById(user.id)).xpTotal, 20);
});

test('dashboard_comAluno_deveRetornarCorpoEHeaderJson', async () => {
  const response = await client.get('/api/dashboard').set('Cookie', cookie);
  assert.equal(response.status, 200);
  assert.match(response.headers['content-type'], /application\/json/);
  assert.equal(response.body.user.id, user.id);
  assert.equal(response.body.user.challengesAnswered, 0);
});

test('dashboard_aposResposta_deveRelacionarDesafioTentativaEPainel', async () => {
  const id = await generate();
  await client.post(`/api/desafio/${id}/responder`).set('Cookie', cookie).send({ resposta: 2 });
  const response = await client.get('/api/dashboard').set('Cookie', cookie);
  assert.equal(response.status, 200);
  assert.equal(response.body.user.xpTotal, 20);
  assert.equal(response.body.user.recentChallenges[0].challengeId, id);
  assert.equal(response.body.dashboard.attemptsLast7Days, 1);
});

test('responder_comAluno_deveRegistrarAuditoriaReal', async () => {
  const id = await generate();
  const response = await client
    .post(`/api/desafio/${id}/responder`)
    .set('Cookie', cookie)
    .send({ resposta: 2 });
  assert.equal(response.status, 200);
  const mongo = await getMongoDb();
  const log = await mongo
    .collection('auditLogs')
    .findOne({ userId: user.id, event: 'CHALLENGE_ANSWERED' });
  assert.ok(log);
  assert.match(log.detail, /acerto/);
});

test('excluirConta_removeDesafiosDoTitularSemAfetarOutraConta', async () => {
  const id = await generate();
  const challenges = db.collection('challenges');
  const other = await challenges.add({ userId: randomUUID() });

  await UserModel.deleteUser(user.id);

  assert.equal((await challenges.doc(id).get()).exists, false);
  assert.equal((await other.get()).exists, true);
  assert.equal(await UserModel.findById(user.id), null);
});

async function seedCompletedTutorial() {
  await db
    .collection('users')
    .doc(user.id)
    .update({
      'trailProgress.diagnostico': Object.fromEntries(
        [1, 2, 3, 4, 5].map((position) => [position, { correct: true, xp: 20 }]),
      ),
    });
}

test('trilha avançada gera a décima questão, corrige a resposta e recusa a décima primeira', async () => {
  await seedCompletedTutorial();
  const route = '/api/desafio?trilha=avancada&indice=';
  const question = await client.get(route + '10').set('Cookie', cookie);
  assert.equal(question.status, 200);
  assert.equal(question.body.titulo, 'Trajetória da bola');
  assert.equal(question.body.respostaCorreta, undefined);

  const result = await client
    .post('/api/desafio/' + question.body.idDesafio + '/responder')
    .set('Cookie', cookie)
    .send({ resposta: 4 });
  assert.equal(result.status, 200);
  assert.equal(result.body.acertou, true);
  assert.equal(result.body.xpGanho, 30);

  const invalid = await client.get(route + '11').set('Cookie', cookie);
  assert.equal(invalid.status, 400);
});

test('trilhas apresentam tabelas de partidas e jogadores sem expor o gabarito', async () => {
  await seedCompletedTutorial();
  const fixtures = await client.get('/api/desafio?trilha=facil&indice=1').set('Cookie', cookie);
  assert.equal(fixtures.status, 200);
  assert.equal(fixtures.body.tabela.rows.length, 5);
  assert.equal(new Set(fixtures.body.options).size, 4);
  assert.equal(fixtures.body.respostaCorreta, undefined);

  const player = await client.get('/api/desafio?trilha=avancada&indice=7').set('Cookie', cookie);
  assert.equal(player.status, 200);
  assert.deepEqual(player.body.tabela.rows[0], ['Jogador de teste', '10', '5']);
  assert.ok(player.body.options.includes('0,5'));
  assert.equal(player.body.respostaCorreta, undefined);
});

test('2FA pode ser desativado e reativado com confirmação do autenticador', async () => {
  const password = 'Integracao@123';
  const preference = '/api/account/mfa';
  const tokenFor = (encrypted) =>
    speakeasy.totp({ secret: decryptAES(encrypted), encoding: 'base32' });
  const wrong = await client
    .post(preference)
    .set('Cookie', cookie)
    .send({ action: 'disable', password: 'senha errada', token: tokenFor(user.twoFactorSecret) });
  assert.equal(wrong.status, 401);
  const disabled = await client
    .post(preference)
    .set('Cookie', cookie)
    .send({ action: 'disable', password, token: tokenFor(user.twoFactorSecret) });
  assert.equal(disabled.status, 200);
  assert.equal(disabled.body.mfaEnabled, false);
  assert.equal((await client.get('/api/dashboard').set('Cookie', cookie)).status, 401);

  const login = await client.post('/api/login').send({ username: user.username, password });
  assert.equal(login.body.authenticated, true);
  const newCookie = login.headers['set-cookie'][0].split(';')[0];
  const setup = await client
    .post(preference)
    .set('Cookie', newCookie)
    .send({ action: 'setup', password });
  assert.equal(setup.status, 200);
  assert.match(setup.body.qrCodeUrl, /^data:image\/png;base64,/);
  const sid = decodeURIComponent(newCookie.split('=')[1]).slice(2).split('.')[0];
  const storedSession = (await db.collection('sessions').doc(sid).get()).data();
  const { mfaSetup } = JSON.parse(storedSession.data);
  const enabled = await client
    .post(preference)
    .set('Cookie', newCookie)
    .send({ action: 'enable', password, token: tokenFor(mfaSetup.secret) });
  assert.equal(enabled.status, 200);
  assert.equal(enabled.body.mfaEnabled, true);
  const nextLogin = await client.post('/api/login').send({ username: user.username, password });
  assert.equal(nextLogin.body.require2FA, true);
});

test('resposta numérica rejeita texto e aceita vírgula decimal', async () => {
  await seedCompletedTutorial();
  const question = await client.get('/api/desafio?trilha=avancada&indice=6').set('Cookie', cookie);
  assert.equal(question.status, 200);
  const url = '/api/desafio/' + question.body.idDesafio + '/responder';
  const invalid = await client.post(url).set('Cookie', cookie).send({ resposta: '1 gol' });
  assert.equal(invalid.status, 400);
  const valid = await client.post(url).set('Cookie', cookie).send({ resposta: '1,4' });
  assert.equal(valid.status, 200);
  assert.equal(valid.body.acertou, true);
});

test('desativação por e-mail exige código próprio da sessão e consome o código ao confirmar', async (t) => {
  await require('../../dist/middlewares/security').passwordChangeLimiter.resetKey('127.0.0.1');
  const password = 'Integracao@123';
  const url = '/api/account/mfa';
  let sent;
  t.mock.method(
    require('../../dist/utils/mailer'),
    'sendMfaDisableEmail',
    async (email, _name, code) => {
      assert.equal(email, user.email);
      sent = code;
    },
  );
  const send = await client
    .post(url)
    .set('Cookie', cookie)
    .send({ action: 'send-disable-email', password });
  assert.equal(send.status, 200);
  assert.match(sent, /^\d{6}$/);

  const login = await client.post('/api/login').send({ username: user.username, password });
  const pending = login.headers['set-cookie'][0].split(';')[0];
  const token = speakeasy.totp({ secret: decryptAES(user.twoFactorSecret), encoding: 'base32' });
  const verified = await client.post('/api/verify-token').set('Cookie', pending).send({ token });
  const otherCookie = verified.headers['set-cookie'][0].split(';')[0];
  const other = await client
    .post(url)
    .set('Cookie', otherCookie)
    .send({ action: 'disable-by-email', password, token: sent });
  assert.equal(other.status, 400);

  const wrong = await client
    .post(url)
    .set('Cookie', cookie)
    .send({ action: 'disable-by-email', password, token: sent === '000000' ? '000001' : '000000' });
  assert.equal(wrong.status, 400);
  const result = await client
    .post(url)
    .set('Cookie', cookie)
    .send({ action: 'disable-by-email', password, token: sent });
  assert.equal(result.status, 200);
  assert.equal(result.body.mfaEnabled, false);
  const replay = await client
    .post(url)
    .set('Cookie', cookie)
    .send({ action: 'disable-by-email', password, token: sent });
  assert.equal(replay.status, 401);
});

test('tutorial e trilhas registram posições únicas e bloqueiam a reabertura após concluir', async () => {
  let old;
  const beforeTutorial = await client
    .get('/api/desafio?trilha=avancada&indice=1')
    .set('Cookie', cookie);
  assert.equal(beforeTutorial.status, 403);
  for (const [trilha, total] of [
    ['diagnostico', 5],
    ['facil', 10],
  ]) {
    const route = '/api/desafio?trilha=' + trilha + '&indice=';
    if (trilha === 'facil') {
      old = await client.get(route + '1').set('Cookie', cookie);
      assert.equal(old.status, 200);
    }
    for (let index = 1; index <= total; index++) {
      const question = await client.get(route + index).set('Cookie', cookie);
      assert.equal(question.status, 200);
      const answer = await client
        .post('/api/desafio/' + question.body.idDesafio + '/responder')
        .set('Cookie', cookie)
        .send({ resposta: 0 });
      assert.equal(answer.status, 200);
      assert.equal(answer.body.progresso.answered.length, index);
      assert.equal(answer.body.progresso.completed, index === total);
      assert.equal(answer.body.progresso.next, index === total ? null : index + 1);
      if (trilha === 'diagnostico' && index === total - 1) {
        const locked = await client.get('/api/desafio?trilha=facil&indice=1').set('Cookie', cookie);
        assert.equal(locked.status, 403);
      }
    }
    const retry = await client.get(route + '1').set('Cookie', cookie);
    assert.equal(retry.status, 409);
    assert.equal(retry.body.progresso.completed, true);
  }
  const dashboard = await client.get('/api/dashboard').set('Cookie', cookie);
  assert.equal(dashboard.body.user.trilhas.diagnostico.completed, true);
  assert.equal(dashboard.body.user.trilhas.facil.completed, true);
  assert.equal(dashboard.body.user.trilhas.media.completed, false);

  const tutorial = await client.post('/api/trilhas/diagnostico/repetir').set('Cookie', cookie);
  assert.equal(tutorial.status, 400);
  const repeat = await client.post('/api/trilhas/facil/repetir').set('Cookie', cookie);
  assert.equal(repeat.status, 200);
  const stale = await client
    .post('/api/desafio/' + old.body.idDesafio + '/responder')
    .set('Cookie', cookie)
    .send({ resposta: 0 });
  assert.equal(stale.status, 409);
  const fresh = await client.get('/api/desafio?trilha=facil&indice=1').set('Cookie', cookie);
  assert.equal(fresh.status, 200);
  const current = await client.get('/api/dashboard').set('Cookie', cookie);
  assert.equal(current.body.user.trilhas.facil.next, 1);
  assert.equal(current.body.user.xpTotal, dashboard.body.user.xpTotal);
  assert.equal(current.body.user.challengesAnswered, dashboard.body.user.challengesAnswered);
});

async function classroomAccount(role) {
  const suffix = randomUUID().replaceAll('-', '').slice(0, 12);
  const username = `turma_${suffix}`;
  const signup = await client.post('/api/signup').send({
    displayName: 'Conta turma',
    username,
    email: `${suffix}@example.invalid`,
    password: 'Integracao@123',
    lgpdAccepted: true,
    ageConfirmed: true,
    enableMfa: false,
    role,
  });
  assert.equal(signup.status, 201);
  const account = await UserModel.findByUsername(username);
  assert.equal(account.role, role);
  const login = await client.post('/api/login').send({ username, password: 'Integracao@123' });
  assert.equal(login.status, 200);
  return { account, cookie: login.headers['set-cookie'][0].split(';')[0] };
}

test('turmas: criação, convite, publicação, correção e isolamento entre contas', async () => {
  const teacher = await classroomAccount('professor');
  const other = await classroomAccount('professor');
  const student = await classroomAccount('aluno');
  const created = await client
    .post('/api/classes')
    .set('Cookie', teacher.cookie)
    .send({ name: 'Matemática em campo' });
  assert.equal(created.status, 201);
  const base = '/api/classes/' + created.body.id;
  const classroom = await client.get(base).set('Cookie', teacher.cookie);
  assert.match(classroom.body.inviteCode, /^[a-f0-9]{32}$/);
  assert.equal((await client.get(base).set('Cookie', other.cookie)).status, 403);
  assert.equal((await client.get(base).set('Cookie', student.cookie)).status, 403);
  assert.equal(
    (
      await client
        .post('/api/classes')
        .set('Cookie', student.cookie)
        .send({ name: 'Não permitido' })
    ).status,
    403,
  );
  const join = () =>
    client
      .post('/api/classes/join')
      .set('Cookie', student.cookie)
      .send({ code: classroom.body.inviteCode });
  assert.equal((await join()).status, 200);
  assert.equal((await join()).status, 200);
  assert.equal((await join()).body.pending, true);
  assert.equal((await client.get(base).set('Cookie', student.cookie)).status, 403);
  const requests = await client.get(base).set('Cookie', teacher.cookie);
  assert.equal(requests.body.requests.length, 1);
  assert.equal(requests.body.requests[0].username, student.account.username);
  assert.equal(requests.body.requests[0].email, student.account.email);
  const decision = base + '/memberships/' + student.account.id;
  assert.equal(
    (await client.post(decision).set('Cookie', other.cookie).send({ approve: true })).status,
    403,
  );
  assert.equal(
    (await client.post(decision).set('Cookie', teacher.cookie).send({ approve: false })).status,
    200,
  );
  assert.equal((await client.get(base).set('Cookie', student.cookie)).status, 403);
  assert.equal((await join()).body.pending, true);
  assert.equal(
    (await client.post(decision).set('Cookie', teacher.cookie).send({ approve: true })).status,
    200,
  );
  assert.equal((await join()).body.pending, false);
  const joined = await client.get(base).set('Cookie', student.cookie);
  assert.equal(joined.body.students, 1);
  assert.equal(joined.body.inviteCode, undefined);
  const questions = [
    {
      type: 'numeric',
      prompt: 'Média de 3 gols em 2 jogos?',
      answer: 1.5,
      explanation: '3 dividido por 2.',
    },
    {
      type: 'choice',
      prompt: 'Soma de 2 e 3?',
      options: ['4', '5'],
      answer: 1,
      explanation: '2 + 3 = 5.',
    },
  ];
  const activity = await client
    .post(base + '/activities')
    .set('Cookie', teacher.cookie)
    .send({ title: 'Médias e operações', questions });
  assert.equal(activity.status, 201);
  const path = base + '/activities/' + activity.body.id;
  assert.equal((await client.get(path).set('Cookie', student.cookie)).status, 404);
  assert.equal(
    (
      await client
        .post(path + '/publish')
        .set('Cookie', other.cookie)
        .send({})
    ).status,
    403,
  );
  assert.equal(
    (
      await client
        .post(path + '/publish')
        .set('Cookie', teacher.cookie)
        .send({})
    ).status,
    200,
  );
  const progressPath = base + '/progress';
  const beforeDelivery = await client.get(progressPath).set('Cookie', teacher.cookie);
  assert.equal(beforeDelivery.status, 200);
  assert.equal(beforeDelivery.body.activities[0].pending, 1);
  assert.equal(beforeDelivery.body.activities[0].submitted, 0);
  assert.deepEqual(beforeDelivery.body.activities[0].startedIds, []);
  assert.equal(beforeDelivery.body.students.length, 1);
  assert.equal((await client.post(path + '/start').set('Cookie', student.cookie)).status, 204);
  assert.equal((await client.post(path + '/start').set('Cookie', student.cookie)).status, 204);
  const started = await client.get(progressPath).set('Cookie', teacher.cookie);
  assert.deepEqual(started.body.activities[0].startedIds, [started.body.students[0].id]);
  assert.deepEqual(started.body.activities[0].results, []);
  assert.equal((await client.get(progressPath).set('Cookie', other.cookie)).status, 403);
  const visible = await client.get(path).set('Cookie', student.cookie);
  assert.equal(visible.body.questions[0].answer, undefined);
  assert.equal(visible.body.questions[0].explanation, undefined);
  assert.equal(
    (
      await client
        .post(path + '/submit')
        .set('Cookie', student.cookie)
        .send({ answers: ['1gol', 1] })
    ).status,
    400,
  );
  const deliveries = await Promise.all(
    [1, 2].map(() =>
      client
        .post(path + '/submit')
        .set('Cookie', student.cookie)
        .send({ answers: ['1,5', 1] }),
    ),
  );
  assert.deepEqual(deliveries.map((r) => r.status).sort(), [201, 409]);
  assert.equal(deliveries.find((r) => r.status === 201).body.correct, 2);
  const result = await client.get(path + '/results').set('Cookie', teacher.cookie);
  assert.equal(result.body.students.length, 1);
  assert.equal(result.body.students[0].submission.correct, 2);
  assert.equal((await client.get(path + '/results').set('Cookie', student.cookie)).status, 403);
  assert.equal((await client.get(path + '/results').set('Cookie', other.cookie)).status, 403);
  const { exportClassData } = require('../../dist/services/classPrivacy');
  const exported = await exportClassData(student.account.id);
  const afterDelivery = await client.get(progressPath).set('Cookie', teacher.cookie);
  const [progress] = afterDelivery.body.activities;
  assert.equal(progress.submitted, 1);
  assert.equal(progress.pending, 0);
  assert.deepEqual(
    progress.questions.map((question) => question.correct),
    [1, 1],
  );
  assert.equal(exported[0].activities[0].submission.correct, 2);
  await UserModel.deleteUser(student.account.id);
  assert.equal(
    (await db.collection('classes').doc(created.body.id).get()).data().studentIds.length,
    0,
  );
  assert.equal(
    (
      await db
        .collection('classes')
        .doc(created.body.id)
        .collection('activities')
        .doc(activity.body.id)
        .collection('submissions')
        .doc(student.account.id)
        .get()
    ).exists,
    false,
  );
  await UserModel.deleteUser(teacher.account.id);
  assert.equal((await db.collection('classes').doc(created.body.id).get()).exists, false);
  assert.equal(
    (await db.collection('classInvites').doc(classroom.body.inviteCode).get()).exists,
    false,
  );
});

test('professor monta modelo com API, edita gabarito e salva os dados sem expor token ao aluno', async () => {
  const teacher = await classroomAccount('professor');
  const other = await classroomAccount('professor');
  assert.equal(
    (await client.get('/api/teacher/football/catalog').set('Cookie', cookie)).status,
    403,
  );
  const data = await client
    .get('/api/teacher/football/data?teamId=127&context=team&count=5')
    .set('Cookie', teacher.cookie);
  assert.equal(data.status, 200);
  assert.equal(data.body.datasets[0].data.matches.length, 5);
  const token = data.body.datasets[0].token;
  const template = await client
    .post('/api/teacher/football/question')
    .set('Cookie', teacher.cookie)
    .send({ token, model: 'mean', format: 'numeric' });
  assert.equal(template.status, 200);
  assert.equal(template.body.question.answer, 2);
  assert.equal(
    (
      await client
        .post('/api/teacher/football/question')
        .set('Cookie', other.cookie)
        .send({ token, model: 'mean', format: 'numeric' })
    ).status,
    400,
  );
  const created = await client
    .post('/api/classes')
    .set('Cookie', teacher.cookie)
    .send({ name: 'Turma com futebol' });
  const base = '/api/classes/' + created.body.id;
  const turma = await client.get(base).set('Cookie', teacher.cookie);
  await client
    .post('/api/classes/join')
    .set('Cookie', cookie)
    .send({ code: turma.body.inviteCode });
  assert.equal(
    (
      await client
        .post(base + '/memberships/' + user.id)
        .set('Cookie', teacher.cookie)
        .send({ approve: true })
    ).status,
    200,
  );
  const question = {
    ...template.body.question,
    prompt: 'Quanto é a soma de gols marcados nas cinco partidas?',
    answer: 10,
    explanation: 'Some 2 + 2 + 2 + 2 + 2.',
  };
  const activity = await client
    .post(base + '/activities')
    .set('Cookie', teacher.cookie)
    .send({ title: 'Questão revisada pelo professor', questions: [question] });
  assert.equal(activity.status, 201);
  const path = base + '/activities/' + activity.body.id;
  assert.equal(
    (
      await client
        .post(path + '/publish')
        .set('Cookie', teacher.cookie)
        .send({})
    ).status,
    200,
  );
  const visible = await client.get(path).set('Cookie', cookie);
  assert.equal(visible.body.questions[0].footballToken, undefined);
  assert.equal(visible.body.questions[0].answer, undefined);
  assert.equal(visible.body.questions[0].sportsData.matches.length, 5);
  assert.equal(visible.body.questions[0].sportsData.source, 'API-Football');
  const result = await client
    .post(path + '/submit')
    .set('Cookie', cookie)
    .send({ answers: ['10'] });
  assert.equal(result.body.correct, 1);
});

test('professor escolhe uma turma para copiar atividade ou questão como rascunho', async () => {
  const teacher = await classroomAccount('professor');
  const other = await classroomAccount('professor');
  const create = (account, name) =>
    client.post('/api/classes').set('Cookie', account.cookie).send({ name });
  const source = await create(teacher, 'Turma origem');
  const target = await create(teacher, 'Turma destino');
  const foreign = await create(other, 'Turma externa');
  for (const response of [source, target, foreign]) assert.equal(response.status, 201);
  const root = '/api/classes/' + source.body.id + '/activities';
  const activity = await client
    .post(root)
    .set('Cookie', teacher.cookie)
    .send({
      title: 'Atividade de soma',
      questions: [
        {
          type: 'choice',
          prompt: 'Quanto é 2 + 3?',
          options: ['4', '5', '6'],
          answer: 1,
          explanation: 'Some 2 e 3.',
        },
      ],
    });
  assert.equal(activity.status, 201);
  const copy = root + '/' + activity.body.id + '/copy';
  const ownCopy = { targetClassId: target.body.id };
  assert.equal((await client.post(copy).set('Cookie', teacher.cookie).send({})).status, 400);
  assert.equal((await client.post(copy).set('Cookie', other.cookie).send(ownCopy)).status, 403);
  assert.equal(
    (await client.post(copy).set('Cookie', teacher.cookie).send({ targetClassId: foreign.body.id }))
      .status,
    403,
  );
  const first = await client.post(copy).set('Cookie', teacher.cookie).send(ownCopy);
  assert.equal(first.status, 200);
  assert.equal(first.body.copied, true);
  assert.equal(
    (await client.post(copy).set('Cookie', teacher.cookie).send(ownCopy)).body.copied,
    false,
  );
  const targetClass = await client
    .get('/api/classes/' + target.body.id)
    .set('Cookie', teacher.cookie);
  const [draft] = targetClass.body.activities;
  assert.equal(draft.published, false);
  const detail = await client
    .get('/api/classes/' + target.body.id + '/activities/' + draft.id)
    .set('Cookie', teacher.cookie);
  assert.equal(detail.body.questions[0].answer, 1);
  const foreignClass = await client
    .get('/api/classes/' + foreign.body.id)
    .set('Cookie', other.cookie);
  assert.deepEqual(foreignClass.body.activities, []);
  const questionCopy = await client.post(copy).set('Cookie', teacher.cookie).send({
    targetClassId: source.body.id,
    questionIndex: 0,
  });
  assert.equal(questionCopy.body.copied, true);
  const library = await client.get('/api/classes/questions').set('Cookie', teacher.cookie);
  assert.equal(library.status, 200);
  assert.equal(library.body.questions.length, 1);
  assert.equal(library.body.questions[0].prompt, 'Quanto é 2 + 3?');
  assert.equal((await client.get('/api/classes/questions').set('Cookie', cookie)).status, 403);
  const overview = await client.get('/api/classes/overview').set('Cookie', teacher.cookie);
  assert.deepEqual(overview.body, { classes: 2, students: 0, published: 0, drafts: 3 });
  const editPath = root + '/' + activity.body.id + '/library/0';
  const edited = {
    type: 'numeric',
    prompt: 'Quanto é 4 + 3?',
    answer: 7,
    explanation: 'Some 4 e 3.',
  };
  assert.equal(
    (await client.patch(editPath).set('Cookie', other.cookie).send({ question: edited })).status,
    403,
  );
  assert.equal(
    (await client.patch(editPath).set('Cookie', teacher.cookie).send({ question: edited })).status,
    200,
  );
  const revised = await client.get('/api/classes/questions').set('Cookie', teacher.cookie);
  assert.equal(revised.body.questions[0].prompt, edited.prompt);
  assert.equal(
    (await client.patch(editPath).set('Cookie', teacher.cookie).send({ question: null })).status,
    200,
  );
  const libraryAfterDelete = await client
    .get('/api/classes/questions')
    .set('Cookie', teacher.cookie);
  assert.deepEqual(libraryAfterDelete.body.questions, []);
  const original = await client.get(root + '/' + activity.body.id).set('Cookie', teacher.cookie);
  assert.equal(original.body.questions[0].prompt, 'Quanto é 2 + 3?');
});

test('trilhas por assunto usam placares reais e respeitam o total de questões', async () => {
  const { challengeGenerationLimiter } = require('../../dist/middlewares/security');
  await challengeGenerationLimiter.resetKey('127.0.0.1');
  await seedCompletedTutorial();
  for (const [trail, total] of [
    ['soma', 10],
    ['multiplicacao', 10],
    ['medias', 5],
    ['fracoes', 5],
  ]) {
    const url = '/api/desafio?trilha=' + trail + '&indice=';
    const response = await client.get(url + total).set('Cookie', cookie);
    assert.equal(response.status, 200);
    assert.equal(response.body.contexto, 'Dados reais da API-Football');
    assert.equal(response.body.tabela.rows.length, 5);
    assert.equal(response.body.respostaCorreta, undefined);
    assert.equal((await client.get(url + (total + 1)).set('Cookie', cookie)).status, 400);
  }
});

test('agendamento e limite por aluno são aplicados no servidor', async () => {
  const teacher = await classroomAccount('professor');
  const created = await client
    .post('/api/classes')
    .set('Cookie', teacher.cookie)
    .send({ name: 'Turma com horário' });
  assert.equal(created.status, 201);
  const base = '/api/classes/' + created.body.id;
  const turma = await client.get(base).set('Cookie', teacher.cookie);
  assert.equal(
    (
      await client
        .post('/api/classes/join')
        .set('Cookie', cookie)
        .send({ code: turma.body.inviteCode })
    ).status,
    200,
  );
  assert.equal(
    (
      await client
        .post(base + '/memberships/' + user.id)
        .set('Cookie', teacher.cookie)
        .send({ approve: true })
    ).status,
    200,
  );
  const draft = await client
    .post(base + '/activities')
    .set('Cookie', teacher.cookie)
    .send({
      title: 'Atividade com horário',
      questions: [
        { type: 'numeric', prompt: 'Quanto é 1 + 1?', answer: 2, explanation: 'Some 1 e 1.' },
      ],
    });
  assert.equal(draft.status, 201);
  const route = base + '/activities/' + draft.body.id;
  const publish = await client
    .post(route + '/publish')
    .set('Cookie', teacher.cookie)
    .send({
      opensAt: new Date(Date.now() + 3_600_000).toISOString(),
      durationMinutes: 10,
    });
  assert.equal(publish.status, 200);
  assert.equal((await client.get(route).set('Cookie', cookie)).status, 409);
  assert.equal((await client.post(route + '/start').set('Cookie', cookie)).status, 409);
  const submit = () =>
    client
      .post(route + '/submit')
      .set('Cookie', cookie)
      .send({ answers: ['2'] });
  assert.equal((await submit()).status, 409);
  const ref = db
    .collection('classes')
    .doc(created.body.id)
    .collection('activities')
    .doc(draft.body.id);
  await ref.update({ opensAt: new Date(Date.now() - 60_000) });
  assert.deepEqual((await client.get(route).set('Cookie', cookie)).body.questions, []);
  assert.equal((await submit()).status, 409);
  assert.equal((await client.post(route + '/start').set('Cookie', cookie)).status, 204);
  const first = await client.get(route).set('Cookie', cookie);
  assert.equal(first.body.questions.length, 1);
  assert.ok(first.body.deadlineAt > Date.now());
  assert.equal((await client.post(route + '/start').set('Cookie', cookie)).status, 204);
  assert.equal(
    (await client.get(route).set('Cookie', cookie)).body.deadlineAt,
    first.body.deadlineAt,
  );
  await ref
    .collection('starts')
    .doc(user.id)
    .update({ startedAt: new Date(Date.now() - 11 * 60_000) });
  assert.equal((await submit()).status, 409);
  const progress = await client.get(base + '/progress').set('Cookie', teacher.cookie);
  assert.deepEqual(progress.body.activities[0].expiredIds, [user.id]);
});
