const test = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');

process.env.NODE_ENV = 'test';
const app = require('../dist/server').default;

test('páginas privadas redirecionam visitante para o login', async () => {
  for (const route of ['/dashboard', '/conta', '/desafio']) {
    const response = await request(app).get(route);
    assert.equal(response.status, 302, route);
    assert.equal(response.headers.location, '/login');
  }
});

test('APIs privadas recusam requisição sem sessão', async () => {
  for (const route of [
    '/api/dashboard',
    '/api/lgpd/data',
    '/api/lgpd/export',
    '/api/lgpd/requests',
  ]) {
    const response = await request(app).get(route);
    assert.equal(response.status, 401, route);
  }
});

test('documentos legais continuam públicos', async () => {
  const response = await request(app).get('/politica-de-privacidade');
  assert.equal(response.status, 200);
  assert.match(response.text, /180 dias/);
});

test('páginas públicas usam endereços sem extensão HTML', async () => {
  for (const route of [
    '/login',
    '/register',
    '/recover',
    '/mfa',
    '/politica-de-privacidade',
    '/termos-de-uso',
  ]) {
    const response = await request(app).get(route);
    assert.equal(response.status, 200, route);
  }
});