const test = require('node:test');
const assert = require('node:assert/strict');

process.env.NODE_ENV = 'test';

const { requireRole } = require('../dist/middlewares/auth');

function execute(session) {
  const request = { session };
  const response = {
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
  let continued = false;
  requireRole('aluno')(request, response, () => {
    continued = true;
  });
  return { response, continued };
}

test('controle por perfil permite aluno autenticado', () => {
  const result = execute({ userId: 'user-1', role: 'aluno' });
  assert.equal(result.continued, true);
  assert.equal(result.response.statusCode, 200);
});

test('controle por perfil bloqueia sessão sem perfil autorizado', () => {
  const missingRole = execute({ userId: 'user-1' });
  assert.equal(missingRole.continued, false);
  assert.equal(missingRole.response.statusCode, 403);

  const visitor = execute({});
  assert.equal(visitor.response.statusCode, 401);
});