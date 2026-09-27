const test = require('node:test');
const assert = require('node:assert/strict');
process.env.NODE_ENV = 'test';
process.env.SESSION_SECRET = 'test-session-secret';
process.env.ENCRYPTION_KEY = '0'.repeat(64);
const argon2 = require('argon2');
const { UserModel } = require('../dist/models/userModel');
const auditLogger = require('../dist/utils/auditLogger');

argon2.hash = async (password) => `hash:${password}`;
argon2.verify = async (hash, password) => hash === `hash:${password}`;
auditLogger.audit = async () => {};

const { AuthController } = require('../dist/controllers/authController');

function responseRecorder() {
  return {
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
}

test('titular troca a própria senha ao confirmar a senha atual', async () => {
  const originalFindById = UserModel.findById;
  const originalUpdatePassword = UserModel.updatePassword;
  let savedHash = '';
  UserModel.findById = async () => ({
    id: 'user-1',
    username: 'ana.silva',
    passwordHash: 'hash:Senha@2025',
  });
  UserModel.updatePassword = async (_id, hash) => {
    savedHash = hash;
  };

  try {
    const response = responseRecorder();
    await AuthController.setPassword(
      {
        session: {
          userId: 'user-1',
          regenerate(done) {
            for (const key of Object.keys(this)) if (key !== 'regenerate') delete this[key];
            done();
          },
        },
        body: { currentPassword: 'Senha@2025', password: 'Nova@2026' },
        ip: '127.0.0.1',
        socket: {},
      },
      response,
    );

    assert.equal(response.statusCode, 200);
    assert.equal(savedHash, 'hash:Nova@2026');
    assert.match(response.body.message, /alterada com sucesso/i);
  } finally {
    UserModel.findById = originalFindById;
    UserModel.updatePassword = originalUpdatePassword;
  }
});

test('troca de senha recusa a senha atual incorreta', async () => {
  const originalFindById = UserModel.findById;
  const originalUpdatePassword = UserModel.updatePassword;
  let updated = false;
  UserModel.findById = async () => ({
    id: 'user-1',
    username: 'ana.silva',
    passwordHash: 'hash:Senha@2025',
  });
  UserModel.updatePassword = async () => {
    updated = true;
  };

  try {
    const response = responseRecorder();
    await AuthController.setPassword(
      {
        session: {
          userId: 'user-1',
          regenerate(done) {
            for (const key of Object.keys(this)) if (key !== 'regenerate') delete this[key];
            done();
          },
        },
        body: { currentPassword: 'Errada@2025', password: 'Nova@2026' },
        ip: '127.0.0.1',
        socket: {},
      },
      response,
    );

    assert.equal(response.statusCode, 401);
    assert.equal(updated, false);
    assert.match(response.body.error, /senha atual está incorreta/i);
  } finally {
    UserModel.findById = originalFindById;
    UserModel.updatePassword = originalUpdatePassword;
  }
});
