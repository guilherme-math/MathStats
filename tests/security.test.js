const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const express = require('express');
const request = require('supertest');

process.env.NODE_ENV = 'test';
process.env.SESSION_SECRET = crypto.randomBytes(32).toString('hex');
process.env.ENCRYPTION_KEY = '0'.repeat(64);
const { applySecurityMiddlewares, loginLimiter } = require('../dist/middlewares/security');
const { AuthController } = require('../dist/controllers/authController');
const { UserModel } = require('../dist/models/userModel');
const auditLogger = require('../dist/utils/auditLogger');
const { authenticateSession } = require('../dist/utils/authSession');

test('cookie de sessão usa Secure, HttpOnly, SameSite=Strict e expiração', async () => {
  const app = express();
  app.set('trust proxy', 1);
  applySecurityMiddlewares(app);
  app.get('/criar-sessao', (req, res) => {
    req.session.userId = 'test-user';
    res.json({ ok: true });
  });
  const response = await request(app).get('/criar-sessao').set('X-Forwarded-Proto', 'https');
  const cookie = response.headers['set-cookie']?.[0] || '';
  assert.match(cookie, /HttpOnly/i);
  assert.match(cookie, /Secure/i);
  assert.match(cookie, /SameSite=Strict/i);
  const expiresMatch = cookie.match(/Expires=([^;]+)/i);
  assert.ok(expiresMatch, 'cookie deve informar expiração');
  const remainingMs = new Date(expiresMatch[1]).getTime() - Date.now();
  assert.ok(
    remainingMs >= 14 * 60 * 1000 && remainingMs <= 16 * 60 * 1000,
    'cookie deve expirar em aproximadamente 15 minutos',
  );
});

test('login avisa a partir do terceiro erro e bloqueia após cinco erros', async (t) => {
  t.mock.method(UserModel, 'findByUsername', async () => null);
  t.mock.method(auditLogger, 'audit', async () => {});
  const app = express();
  app.set('trust proxy', 1);
  app.use(express.json());
  app.use(loginLimiter);
  app.post('/login', AuthController.login);
  app.post('/valid-login', (_req, res) => res.sendStatus(200));
  assert.equal((await request(app).post('/valid-login')).status, 200);
  for (let attempt = 1; attempt <= 5; attempt += 1) {
    const response = await request(app)
      .post('/login')
      .send({ username: 'aluno', password: 'errada' });
    assert.equal(response.status, 401);
    assert.equal(Number(response.headers['ratelimit-remaining']), 5 - attempt);
    assert.equal(response.body.remainingAttempts, attempt >= 3 ? 5 - attempt : undefined);
  }
  assert.equal((await request(app).post('/login')).status, 429);
});

test('sessão autenticada usa cookie de 30 dias e sair revoga a sessão', async (t) => {
  const user = { id: 'test-aluno', username: 'aluno', role: 'aluno' };
  t.mock.method(UserModel, 'findById', async () => user);
  t.mock.method(auditLogger, 'audit', async () => {});
  const app = express();
  app.set('trust proxy', 1);
  applySecurityMiddlewares(app);
  app.post('/api/test-login', async (req, res) => {
    await authenticateSession(req, user);
    res.sendStatus(204);
  });
  app.get('/api/test-session', (req, res) => res.sendStatus(req.session.userId ? 200 : 401));
  app.post('/api/logout', AuthController.logout);

  const login = await request(app).post('/api/test-login').set('X-Forwarded-Proto', 'https');
  assert.equal(login.status, 204);
  const cookie = login.headers['set-cookie'][0];
  const expires = Date.parse(cookie.match(/Expires=([^;]+)/i)[1]);
  const ttl = expires - Date.now();
  assert.ok(Math.abs(ttl - 30 * 24 * 60 * 60 * 1000) < 5000);
  const token = cookie.split(';')[0];
  assert.equal((await request(app).get('/api/test-session').set('Cookie', token)).status, 200);
  assert.equal((await request(app).post('/api/logout').set('Cookie', token)).status, 200);
  assert.equal((await request(app).get('/api/test-session').set('Cookie', token)).status, 401);
});
