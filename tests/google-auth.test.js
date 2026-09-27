const test = require('node:test');
const assert = require('node:assert/strict');

process.env.NODE_ENV = 'test';
process.env.SESSION_SECRET = 'test-session-secret';
process.env.GOOGLE_CLIENT_ID = 'google-client-test';
process.env.ENCRYPTION_KEY = '0'.repeat(64);

function responseMock() {
  return {
    statusCode: 200,
    body: undefined,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(value) {
      this.body = value;
      return this;
    },
  };
}

test('login com Google verificado conclui a sessão sem exigir 2FA adicional', async () => {
  const { OAuth2Client } = require('google-auth-library');
  OAuth2Client.prototype.verifyIdToken = async () => ({
    getPayload: () => ({
      email: 'aluno@example.com',
      email_verified: true,
      sub: 'google-user-1',
    }),
  });

  const auditModule = require('../dist/utils/auditLogger');
  auditModule.audit = async () => {};

  const { UserModel } = require('../dist/models/userModel');
  const user = {
    id: 'user-1',
    displayName: 'Aluno',
    username: 'aluno',
    email: 'aluno@example.com',
    googleId: 'google-user-1',
  };
  UserModel.findByGoogleId = async () => user;
  UserModel.findByEmail = async () => user;

  const { AuthController } = require('../dist/controllers/authController');
  const request = {
    body: { credential: 'valid-google-token', mode: 'login' },
    session: { pending2faUserId: 'old-pending-user' },
    ip: '127.0.0.1',
    socket: {},
  };
  request.session.regenerate = (done) => {
    request.session = {};
    done();
  };
  const response = responseMock();

  await AuthController.googleAuth(request, response);

  assert.equal(response.statusCode, 200);
  assert.equal(response.body.authenticated, true);
  assert.equal(response.body.require2FA, undefined);
  assert.equal(request.session.userId, user.id);
  assert.equal(request.session.username, user.username);
  assert.equal(request.session.pending2faUserId, undefined);
});
