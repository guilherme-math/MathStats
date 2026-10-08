const test = require('node:test');
const assert = require('node:assert/strict');

const { DEFAULT_USER_ROLE, normalizeUserRole } = require('../dist/config/userRoles');

test('perfil padrão de toda conta é aluno', () => {
  assert.equal(DEFAULT_USER_ROLE, 'aluno');
  assert.equal(normalizeUserRole(undefined), 'aluno');
  assert.equal(normalizeUserRole('professor'), 'aluno');
  assert.equal(normalizeUserRole('aluno'), 'aluno');
});