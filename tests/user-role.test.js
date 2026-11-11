const test = require('node:test');
const assert = require('node:assert/strict');

const { DEFAULT_USER_ROLE, normalizeUserRole } = require('../dist/config/userRoles');

test('perfil padrão é aluno e somente os dois perfis públicos são reconhecidos', () => {
  assert.equal(DEFAULT_USER_ROLE, 'aluno');
  assert.equal(normalizeUserRole(undefined), 'aluno');
  assert.equal(normalizeUserRole('professor'), 'professor');
  assert.equal(normalizeUserRole('admin'), 'aluno');
  assert.equal(normalizeUserRole('aluno'), 'aluno');
});
