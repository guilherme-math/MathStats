const test = require('node:test');
const assert = require('node:assert/strict');
const { validatePublicIdentity } = require('../dist/utils/contentFilter');

test('permite nomes legítimos e evita falsos positivos simples', () => {
  for (const value of ['Guilherme Rodrigues', 'computador', 'Scunthorpe', 'usuario_normal']) {
    assert.equal(validatePublicIdentity(value, 'campo').allowed, true, value);
  }
});

test('bloqueia termos incompatíveis com o ambiente educacional', () => {
  for (const value of ['caralho', 'joao_babaca', 'usuariofdp']) {
    assert.equal(validatePublicIdentity(value, 'campo').allowed, false, value);
  }
});

test('bloqueia tentativas comuns de burla', () => {
  for (const value of ['c4r4lh0', 'p.u.t.a', 'arrrrombado', 'b-a-b-a-c-a']) {
    assert.equal(validatePublicIdentity(value, 'campo').allowed, false, value);
  }
});