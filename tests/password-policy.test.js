const test = require('node:test');
const assert = require('node:assert/strict');
const {
  getPasswordRequirements,
  isPasswordValid,
  PASSWORD_POLICY_MESSAGE,
} = require('../dist/utils/passwordPolicy');

test('aceita senha que cumpre todos os requisitos', () => {
  assert.equal(isPasswordValid('Math@2026'), true);
});

test('recusa senha curta ou sem maiúscula, minúscula, número ou caractere especial', () => {
  for (const password of ['Mat@26', 'math@2026', 'MATH@2026', 'MathStats!', 'Math2026']) {
    assert.equal(isPasswordValid(password), false, password);
  }
});

test('limita a senha a 128 caracteres e expõe requisitos para a interface', () => {
  assert.equal(isPasswordValid(`A1!${'a'.repeat(126)}`), false);
  assert.deepEqual(getPasswordRequirements('Math@2026'), {
    minimumLength: true,
    uppercase: true,
    lowercase: true,
    number: true,
    specialCharacter: true,
  });
  assert.match(PASSWORD_POLICY_MESSAGE, /8 caracteres/);
});