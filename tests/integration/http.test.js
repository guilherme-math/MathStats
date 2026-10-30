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
      response: Array.from({ length: 5 }, (_, i) => ({
        fixture: { status: { short: 'FT' } },
        teams: { home: { id: 127, name: 'Flamengo' }, away: { id: i + 1, name: `Time ${i}` } },
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
