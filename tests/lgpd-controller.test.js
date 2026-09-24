const test = require('node:test');
const assert = require('node:assert/strict');

process.env.NODE_ENV = 'test';

function responseMock() {
  return {
    statusCode: 200,
    headers: {},
    body: undefined,
    status(code) {
      this.statusCode = code;
      return this;
    },
    setHeader(name, value) {
      this.headers[name] = value;
    },
    json(value) {
      this.body = value;
      return this;
    },
    send(value) {
      this.body = value;
      return this;
    },
    clearCookie() {
      return this;
    },
  };
}

function requestMock(userId = 'user-a') {
  return {
    session: {
      userId,
      destroy(callback) {
        callback();
      },
    },
    body: {},
    ip: '127.0.0.1',
    socket: {},
  };
}

test('exportação inclui todo o histórico e todas as solicitações do próprio usuário', async () => {
  const auditModule = require('../dist/utils/auditLogger');
  auditModule.audit = async () => {};
  auditModule.getAllAuditLogsForUser = async (userId) => {
    assert.equal(userId, 'user-a');
    return Array.from({ length: 101 }, (_, index) => ({
      event: 'EVENT',
      userId,
      createdAt: new Date(),
      detail: String(index),
    }));
  };
  const { UserModel } = require('../dist/models/userModel');
  UserModel.findById = async (id) => ({
    id,
    displayName: 'Aluno',
    username: 'aluno',
    email: 'aluno@example.com',
    createdAt: new Date(),
    legalAcceptedAt: new Date(),
    termsVersion: 'v1',
    privacyPolicyVersion: 'v1',
  });
  UserModel.getAllChallengeHistory = async (id) => {
    assert.equal(id, 'user-a');
    return Array.from({ length: 501 }, (_, index) => ({
      challengeId: String(index),
      respondidoEm: new Date(),
    }));
  };
  UserModel.getPrivacyRequests = async (id) => {
    assert.equal(id, 'user-a');
    return [
      {
        id: 'request-1',
        type: 'oposicao',
        status: 'received',
        requestedAt: new Date(),
        updatedAt: new Date(),
      },
    ];
  };
  const { LgpdController } = require('../dist/controllers/lgpdController');
  const response = responseMock();
  await LgpdController.exportData(requestMock(), response);
  assert.equal(response.statusCode, 200);
  const payload = JSON.parse(response.body);
  assert.equal(payload.historicoDesafios.length, 501);
  assert.equal(payload.historicoAuditoria.length, 101);
  assert.equal(payload.solicitacoesPrivacidade.length, 1);
  assert.equal(payload.titular.versaoTermosAceita, 'v1');
});

test('exclusão usa exclusivamente o userId autenticado na sessão', async () => {
  const auditModule = require('../dist/utils/auditLogger');
  auditModule.audit = async () => {};
  let anonymizedId = null;
  auditModule.anonymizeAuditLogsForUser = async (id) => {
    anonymizedId = id;
  };
  const { UserModel } = require('../dist/models/userModel');
  let deletedId = null;
  UserModel.findById = async (id) => ({
    id,
    username: 'aluno',
    email: 'aluno@example.com',
    createdAt: new Date(),
  });
  UserModel.deleteUser = async (id) => {
    deletedId = id;
  };
  const { LgpdController } = require('../dist/controllers/lgpdController');
  const request = requestMock('user-a');
  request.params = { userId: 'user-b' };
  request.body = { userId: 'user-b' };
  const response = responseMock();
  await LgpdController.deleteAccount(request, response);
  assert.equal(response.statusCode, 200);
  assert.equal(deletedId, 'user-a');
  assert.equal(anonymizedId, 'user-a');
});