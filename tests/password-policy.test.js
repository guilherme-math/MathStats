const test = require('node:test');
const assert = require('node:assert/strict');
const {
  getPasswordRequirements,
  isPasswordValid,
  PASSWORD_POLICY_MESSAGE,
} = require('../dist/utils/passwordPolicy');

test('aceita senha que cumpre todos os requisitos', () => {
  // Arrange
  const password = 'Math@2026';

  // Act
  const valid = isPasswordValid(password);

  // Assert
  assert.equal(valid, true);
  assert.deepEqual(getPasswordRequirements(password), {
    minimumLength: true,
    uppercase: true,
    lowercase: true,
    number: true,
    specialCharacter: true,
  });
});

test('recusa senhas que violam requisitos individuais (parametrizado)', () => {
  // Arrange
  const invalidPasswords = [
    { password: 'Mat@26', rule: 'comprimento mínimo' },
    { password: 'math@2026', rule: 'letra maiúscula' },
    { password: 'MATH@2026', rule: 'letra minúscula' },
    { password: 'MathStats!', rule: 'número' },
    { password: 'Math2026', rule: 'caractere especial' },
  ];

  for (const { password, rule } of invalidPasswords) {
    // Act
    const valid = isPasswordValid(password);

    // Assert
    assert.equal(valid, false, rule);
  }
  assert.match(PASSWORD_POLICY_MESSAGE, /8 caracteres/);
});

test('aceita os limites exatos de 8 e 128 caracteres e rejeita 129', () => {
  // Arrange
  const minimum = 'Aa1!aaaa';
  const maximum = `Aa1!${'a'.repeat(124)}`;
  const aboveMaximum = `${maximum}a`;

  // Act
  const results = [
    isPasswordValid(minimum),
    isPasswordValid(maximum),
    isPasswordValid(aboveMaximum),
  ];

  // Assert
  assert.deepEqual(results, [true, true, false]);
});
