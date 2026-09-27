const test = require('node:test');
const assert = require('node:assert/strict');
const { db } = require('../dist/config/firebase');
const { UserModel } = require('../dist/models/userModel');

test('código de recuperação no banco só pode ser consumido uma vez', async (t) => {
  let user = {
    recoveryToken: 'code-hash',
    recoveryTokenExpires: { toMillis: () => Date.now() + 10000 },
  };
  t.mock.method(db, 'runTransaction', async (callback) =>
    callback({
      get: async () => ({ exists: true, data: () => user }),
      update: (_ref, patch) => {
        user = { ...user, ...patch };
      },
    }),
  );
  assert.equal(await UserModel.consumeRecoveryToken('ana', 'wrong-code'), false);
  assert.equal(await UserModel.consumeRecoveryToken('ana', 'code-hash'), true);
  assert.equal(await UserModel.consumeRecoveryToken('ana', 'code-hash'), false);
  user = { recoveryToken: 'expired', recoveryTokenExpires: { toMillis: () => Date.now() - 1 } };
  assert.equal(await UserModel.consumeRecoveryToken('ana', 'expired'), false);
});

test('troca de senha recusa credenciais alteradas durante a operação', async (t) => {
  let user = { passwordHash: 'old', recoveryToken: 'pending' };
  t.mock.method(db, 'runTransaction', async (callback) =>
    callback({
      get: async () => ({ exists: true, data: () => user }),
      update: (_ref, patch) => {
        user = { ...user, ...patch };
      },
    }),
  );
  await UserModel.updatePassword('ana', 'new', 'old');
  assert.equal(user.passwordHash, 'new');
  assert.equal(user.recoveryToken, null);
  await assert.rejects(UserModel.updatePassword('ana', 'stale', 'old'), /credenciais/);
  assert.equal(user.passwordHash, 'new');
});
