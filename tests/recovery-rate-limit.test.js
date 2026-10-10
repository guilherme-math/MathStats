const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const request = require('supertest');

process.env.NODE_ENV = 'test';

const {
  recoveryStartLimiter,
  recoveryVerifyLimiter,
  recoveryResetLimiter,
} = require('../dist/middlewares/security');

function recoveryApplication() {
  const app = express();
  app.use(express.json());
  app.post('/recover/start', recoveryStartLimiter, (_req, res) => res.json({ ok: true }));
  app.post('/recover/verify', recoveryVerifyLimiter, (_req, res) => res.json({ ok: true }));
  app.post('/recover/reset', recoveryResetLimiter, (_req, res) => res.json({ ok: true }));
  return app;
}

test('etapas da recuperação possuem contadores independentes', async () => {
  const app = recoveryApplication();

  for (let attempt = 1; attempt <= 3; attempt += 1) {
    await request(app).post('/recover/start').expect(200);
  }
  await request(app).post('/recover/start').expect(429);

  for (let attempt = 1; attempt <= 5; attempt += 1) {
    await request(app).post('/recover/verify').expect(200);
  }
  await request(app).post('/recover/verify').expect(429);

  for (let attempt = 1; attempt <= 3; attempt += 1) {
    await request(app).post('/recover/reset').expect(200);
  }
  const blocked = await request(app).post('/recover/reset').expect(429);

  assert.match(blocked.body.error, /nova senha/i);
});
