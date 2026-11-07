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

test('trilha avançada gera a décima questão, corrige a resposta e recusa a décima primeira', async () => {
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
  const old = await client.get('/api/desafio?trilha=facil&indice=1').set('Cookie', cookie);
  assert.equal(old.status, 200);
  for (const [trilha, total] of [
    ['diagnostico', 5],
    ['facil', 10],
  ]) {
    const route = '/api/desafio?trilha=' + trilha + '&indice=';
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
