const test = require('node:test');
const assert = require('node:assert/strict');

process.env.SESSION_SECRET = 'session-secret-for-trusted-device-tests';

const {
  createTrustedDeviceToken,
  rememberTrustedDevice,
  validateTrustedDeviceToken,
} = require('../dist/utils/trustedDevice');

test('dispositivo confiável é aceito somente para a mesma conta, senha e navegador', () => {
  const expiresAt = Date.now() + 60_000;
  const token = createTrustedDeviceToken('user-1', 'password-hash-1', 'Browser A', expiresAt);

  assert.equal(validateTrustedDeviceToken(token, 'user-1', 'password-hash-1', 'Browser A'), true);
  assert.equal(validateTrustedDeviceToken(token, 'user-2', 'password-hash-1', 'Browser A'), false);
  assert.equal(
    validateTrustedDeviceToken(token, 'user-1', 'new-password-hash', 'Browser A'),
    false,
  );
  assert.equal(validateTrustedDeviceToken(token, 'user-1', 'password-hash-1', 'Browser B'), false);
});

test('dispositivo confiável rejeita token expirado ou adulterado', () => {
  const token = createTrustedDeviceToken('user-1', 'password-hash-1', 'Browser A', Date.now() - 1);

  assert.equal(validateTrustedDeviceToken(token, 'user-1', 'password-hash-1', 'Browser A'), false);
  assert.equal(
    validateTrustedDeviceToken(`${token}x`, 'user-1', 'password-hash-1', 'Browser A'),
    false,
  );
});

test('cookie do dispositivo confiável aplica as proteções e a validade de 30 dias', () => {
  let cookie;
  const request = {
    get(name) {
      return name === 'user-agent' ? 'Browser A' : undefined;
    },
  };
  const response = {
    cookie(name, value, options) {
      cookie = { name, value, options };
    },
  };

  rememberTrustedDevice(request, response, 'user-1', 'password-hash-1');

  assert.equal(cookie.name, 'mathstats.trusted_device');
  assert.ok(cookie.value);
  assert.equal(cookie.options.httpOnly, true);
  assert.equal(cookie.options.secure, true);
  assert.equal(cookie.options.sameSite, 'strict');
  assert.equal(cookie.options.maxAge, 30 * 24 * 60 * 60 * 1000);
});