const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const session = require('express-session');
const request = require('supertest');

process.env.NODE_ENV = 'test';
process.env.SESSION_SECRET = 'session-regression-test-secret';
process.env.ENCRYPTION_KEY = '0'.repeat(64);
process.env.GOOGLE_CLIENT_ID = 'test-google-client';

const { UserModel } = require('../dist/models/userModel');
const { AuthController } = require('../dist/controllers/authController');
const { RecoveryController } = require('../dist/controllers/recoveryController');
const { validateSession, requireRole } = require('../dist/middlewares/auth');
const { validateBody, loginSchema, signupSchema } = require('../dist/validation/authSchemas');
const { signupLimiter } = require('../dist/middlewares/security');
const mailer = require('../dist/utils/mailer');
const audit = require('../dist/utils/auditLogger');
const argon2 = require('argon2');

function application() {
  const app = express();
  app.use(express.json());
  app.use(session({ secret: process.env.SESSION_SECRET, resave: false, saveUninitialized: false }));
  app.use(validateSession);
  app.post('/api/login', validateBody(loginSchema), AuthController.login);
  app.post('/api/send', AuthController.sendMfaEmail);
  app.post('/api/verify', AuthController.verifyToken);
  app.post('/api/password', requireRole('aluno'), AuthController.setPassword);
  app.post('/api/recover/start', RecoveryController.start);
  app.post('/api/recover/verify', RecoveryController.verify);
  app.post('/api/recover/reset', RecoveryController.reset);
  app.get('/api/private', requireRole('aluno'), (_req, res) => res.json({ ok: true }));
  return app;
}

test('MFA não aceita código de outra conta; senha nova revoga sessões e MFA pendente', async (t) => {
  const users = new Map(
    ['ana', 'bia'].map((name) => [
      name,
      {
        id: name,
        username: name,
        email: `${name}@example.com`,
        role: 'aluno',
        passwordHash: 'hash:Senha@123',
        twoFactorSecret: '',
      },
    ]),
  );
  const sent = new Map();
  t.mock.method(UserModel, 'findByUsername', async (name) => users.get(name));
  t.mock.method(UserModel, 'findById', async (id) => users.get(id));
  t.mock.method(UserModel, 'updatePassword', async (id, hash) => {
    users.get(id).passwordHash = hash;
  });
  t.mock.method(argon2, 'verify', async (hash, password) => hash === `hash:${password}`);
  t.mock.method(argon2, 'hash', async (password) => `hash:${password}`);
  t.mock.method(audit, 'audit', async () => {});
  t.mock.method(mailer, 'sendMfaCodeEmail', async (email, _name, code) => {
    sent.set(email, code);
  });

  const app = application();
  const attacker = request.agent(app);
  await attacker.post('/api/login').send({ username: 'ana', password: 'Senha@123' }).expect(200);
  await attacker.post('/api/send').send({}).expect(200);
  const oldCode = sent.get('ana@example.com');
  await attacker.post('/api/login').send({ username: 'bia', password: 'Senha@123' }).expect(200);
  await attacker.post('/api/verify').send({ token: oldCode, method: 'email' }).expect(400);
  await attacker.get('/api/private').expect(401);

  async function login(agent) {
    const response = await agent
      .post('/api/login')
      .send({ username: 'bia', password: 'Senha@123' })
      .expect(200);
    const pendingCookie = response.headers['set-cookie'][0].split(';')[0];
    await agent.post('/api/send').send({}).expect(200);
    const verified = await agent
      .post('/api/verify')
      .send({ token: sent.get('bia@example.com'), method: 'email' })
      .expect(200);
    assert.notEqual(verified.headers['set-cookie'][0].split(';')[0], pendingCookie);
    await request(app).get('/api/private').set('Cookie', pendingCookie).expect(401);
  }
  const owner = request.agent(app);
  const oldDevice = request.agent(app);
  await login(owner);
  await login(oldDevice);
  const pendingDevice = request.agent(app);
  await pendingDevice
    .post('/api/login')
    .send({ username: 'bia', password: 'Senha@123' })
    .expect(200);
  await pendingDevice.post('/api/send').send({}).expect(200);
  const pendingCode = sent.get('bia@example.com');
  await owner
    .post('/api/password')
    .send({ currentPassword: 'Senha@123', password: 'Nova@456' })
    .expect(200);
  await owner.get('/api/private').expect(200);
  await oldDevice.get('/api/private').expect(401);
  await pendingDevice.post('/api/verify').send({ token: pendingCode, method: 'email' }).expect(401);
  users.delete('bia');
  await owner.get('/api/private').expect(401);
});

test('Google não herda senha e TOTP de cadastro local com e-mail não verificado', async (t) => {
  const { OAuth2Client } = require('google-auth-library');
  t.mock.method(OAuth2Client.prototype, 'verifyIdToken', async () => ({
    getPayload: () => ({ email: 'vitima@example.com', email_verified: true, sub: 'google-victim' }),
  }));
  t.mock.method(UserModel, 'findByGoogleId', async () => null);
  t.mock.method(UserModel, 'findByEmail', async () => ({
    id: 'pre-created',
    passwordHash: 'attacker-password',
    twoFactorSecret: 'attacker-totp',
  }));
  const link = t.mock.method(UserModel, 'linkGoogleId', async () => {});
  const app = application();
  app.post('/api/google', AuthController.googleAuth);
  const client = request.agent(app);
  await client
    .post('/api/google')
    .send({ credential: 'verified-token', mode: 'login' })
    .expect(409);
  assert.equal(link.mock.callCount(), 0);
  await client.get('/api/private').expect(401);
});

test('recuperação consome o código uma vez e revoga a sessão anterior', async (t) => {
  const user = {
    id: 'ana',
    username: 'ana',
    email: 'ana@example.com',
    role: 'aluno',
    passwordHash: 'hash:Senha@123',
    twoFactorSecret: '',
  };
  let code;
  t.mock.method(UserModel, 'findByUsername', async (name) => (name === 'ana' ? user : null));
  t.mock.method(UserModel, 'findById', async () => user);
  t.mock.method(UserModel, 'updateRecoveryToken', async (_id, hash, expiry) => {
    user.recoveryToken = hash;
    user.recoveryTokenExpires = expiry;
  });
  t.mock.method(UserModel, 'consumeRecoveryToken', async (_id, hash) => {
    if (user.recoveryToken !== hash) return false;
    user.recoveryToken = null;
    user.recoveryTokenExpires = null;
    return true;
  });
  t.mock.method(UserModel, 'updatePassword', async (_id, hash) => {
    user.passwordHash = hash;
  });
  t.mock.method(argon2, 'verify', async (hash, password) => hash === `hash:${password}`);
  t.mock.method(argon2, 'hash', async (password) => `hash:${password}`);
  t.mock.method(audit, 'audit', async () => {});
  t.mock.method(mailer, 'sendMfaCodeEmail', async (_email, _name, value) => {
    code = value;
  });
  t.mock.method(mailer, 'sendRecoveryCodeEmail', async (_email, _name, value) => {
    code = value;
  });
  const app = application();
  const previous = request.agent(app);
  await previous.post('/api/login').send({ username: 'ana', password: 'Senha@123' }).expect(200);
  await previous.post('/api/send').send({}).expect(200);
  await previous.post('/api/verify').send({ token: code, method: 'email' }).expect(200);
  const owner = request.agent(app);
  await owner.post('/api/recover/start').send({ username: 'ana' }).expect(200);
  await owner.post('/api/recover/verify').send({ token: code }).expect(200);
  await owner.post('/api/recover/verify').send({ token: code }).expect(401);
  await owner.post('/api/recover/reset').send({ password: 'Nova@789' }).expect(200);
  await previous.get('/api/private').expect(401);
  await owner.post('/api/recover/reset').send({ password: 'Outra@789' }).expect(401);
  await owner.post('/api/recover/start').send({ username: 'ana' }).expect(200);
  await owner.post('/api/recover/verify').send({ token: code }).expect(200);
  await owner.post('/api/recover/start').send({ username: 'inexistente' }).expect(200);
  await owner.post('/api/recover/reset').send({ password: 'Outra@789' }).expect(401);
});

test('cadastro limita requisições antes de criar contas e rejeita tipos inválidos', async () => {
  const app = express();
  app.use(express.json());
  let created = 0;
  app.post('/signup', signupLimiter, validateBody(signupSchema), (_req, res) => {
    created += 1;
    res.sendStatus(201);
  });
  await request(app).post('/signup').send({ username: {} }).expect(400);
  await request(app)
    .post('/signup')
    .send({ email: ['invalid'] })
    .expect(400);
  await request(app).post('/signup').send({ lgpdAccepted: 'true' }).expect(400);
  await request(app).post('/signup').send({}).expect(429);
  assert.equal(created, 0);
});
