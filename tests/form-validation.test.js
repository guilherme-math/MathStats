const test = require('node:test');
const assert = require('node:assert/strict');

const {
  signupSchema,
  loginSchema,
  mfaSchema,
  googleSchema,
  recoveryStartSchema,
  recoveryVerifySchema,
  recoveryResetSchema,
  passwordChangeSchema,
} = require('../dist/validation/authSchemas');

test('cadastro aceita o contrato completo e remove espaços das informações públicas', () => {
  const result = signupSchema.safeParse({
    displayName: '  Ana Silva  ',
    username: '  ana.silva  ',
    email: 'ana@example.com',
    password: 'Senha@123',
    lgpdAccepted: true,
  });

  assert.equal(result.success, true);
  assert.equal(result.data.displayName, 'Ana Silva');
  assert.equal(result.data.username, 'ana.silva');
});

test('cadastro recusa campos extras, usuário inválido e aceite com tipo incorreto', () => {
  const base = {
    displayName: 'Ana Silva',
    username: 'ana.silva',
    email: 'ana@example.com',
    password: 'Senha@123',
    lgpdAccepted: true,
  };

  assert.equal(signupSchema.safeParse({ ...base, role: 'admin' }).success, false);
  assert.equal(signupSchema.safeParse({ ...base, username: 'ana silva' }).success, false);
  assert.equal(signupSchema.safeParse({ ...base, lgpdAccepted: 'true' }).success, false);
});

test('login exige usuário ou e-mail e limita o tamanho da senha recebida', () => {
  assert.equal(loginSchema.safeParse({ username: 'ana.silva', password: 'senha' }).success, true);
  assert.equal(
    loginSchema.safeParse({ email: 'ana@example.com', password: 'senha' }).success,
    true,
  );
  assert.equal(loginSchema.safeParse({ password: 'senha' }).success, false);
  assert.equal(
    loginSchema.safeParse({ username: 'ana.silva', password: 'a'.repeat(129) }).success,
    false,
  );
});

test('MFA e recuperação aceitam somente códigos formados por seis dígitos', () => {
  for (const schema of [mfaSchema, recoveryVerifySchema]) {
    const field = schema === mfaSchema ? { token: '052360', method: 'email' } : { token: '052360' };
    assert.equal(schema.safeParse(field).success, true);
    assert.equal(schema.safeParse({ ...field, token: '52360' }).success, false);
    assert.equal(schema.safeParse({ ...field, token: '05236A' }).success, false);
  }
});

test('Google, recuperação e troca de senha recusam contratos fora do formato', () => {
  assert.equal(googleSchema.safeParse({ credential: 'token', mode: 'login' }).success, true);
  assert.equal(googleSchema.safeParse({ credential: 'token', mode: 'signin' }).success, false);
  assert.equal(recoveryStartSchema.safeParse({ username: 'ana.silva' }).success, true);
  assert.equal(recoveryStartSchema.safeParse({ username: 'an' }).success, false);
  assert.equal(recoveryResetSchema.safeParse({ password: '' }).success, false);
  assert.equal(passwordChangeSchema.safeParse({ password: 'a'.repeat(129) }).success, false);
});
