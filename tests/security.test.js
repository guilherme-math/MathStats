const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const express = require('express');
const request = require('supertest');

process.env.NODE_ENV = 'test';
process.env.SESSION_SECRET = crypto.randomBytes(32).toString('hex');
const { applySecurityMiddlewares, loginLimiter } = require('../dist/middlewares/security');

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

test('limite de login bloqueia a sexta tentativa na mesma janela', async () => {
  const app = express();
  app.set('trust proxy', 1);
  app.use(loginLimiter);
  app.post('/login', (_req, res) => res.json({ ok: true }));
  for (let attempt = 1; attempt <= 5; attempt += 1) {
    assert.equal((await request(app).post('/login')).status, 200);
  }
  assert.equal((await request(app).post('/login')).status, 429);
});
