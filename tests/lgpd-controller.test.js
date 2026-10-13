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

test('exportação não apresenta arquivo incompleto quando a auditoria está indisponível', async (t) => {
  const auditModule = require('../dist/utils/auditLogger');
  t.mock.method(auditModule, 'getAllAuditLogsForUser', async () => {
    throw new Error('offline');
  });
  t.mock.method(console, 'error', () => {});
  const { LgpdController } = require('../dist/controllers/lgpdController');
  const response = responseMock();
  await LgpdController.exportData(requestMock(), response);
  assert.equal(response.statusCode, 500);
  assert.ok(response.body.error);
});

test('solicitação de privacidade cria novo protocolo para o usuário da sessão', async (t) => {
  const auditModule = require('../dist/utils/auditLogger');
  const mailerModule = require('../dist/utils/mailer');
  const { UserModel } = require('../dist/models/userModel');
  const { LgpdController } = require('../dist/controllers/lgpdController');
  let savedRequest;

  t.mock.method(auditModule, 'audit', async () => {});
  t.mock.method(mailerModule, 'sendPrivacyRequestNotification', async () => {});
  t.mock.method(UserModel, 'findById', async (id) => ({
    id,
    username: 'aluno',
    email: 'aluno@example.com',
  }));
  t.mock.method(UserModel, 'createPrivacyRequest', async (userId, type, detail) => {
    savedRequest = { userId, type, detail };
    return 'request-2';
  });

  const request = requestMock('user-a');
  request.body = {
    type: 'oposicao',
    detail: '  Quero entender este tratamento.  ',
    userId: 'user-b',
  };
  const response = responseMock();
  await LgpdController.requestDataRight(request, response);

  assert.equal(response.statusCode, 201);
  assert.deepEqual(savedRequest, {
    userId: 'user-a',
    type: 'oposicao',
    detail: 'Quero entender este tratamento.',
  });
  assert.deepEqual(response.body, {
    message: 'Solicitação registrada e enviada ao e-mail do projeto para análise.',
    requestId: 'request-2',
    status: 'received',
  });
});

test('solicitação de privacidade recusa tipo e descrição fora dos limites', async (t) => {
  const { UserModel } = require('../dist/models/userModel');
  const { LgpdController } = require('../dist/controllers/lgpdController');
  const createMock = t.mock.method(UserModel, 'createPrivacyRequest', async () => 'request');

  const invalidType = requestMock();
  invalidType.body = { type: 'exclusao-imediata', detail: '' };
  const invalidTypeResponse = responseMock();
  await LgpdController.requestDataRight(invalidType, invalidTypeResponse);

  const oversized = requestMock();
  oversized.body = { type: 'oposicao', detail: 'a'.repeat(501) };
  const oversizedResponse = responseMock();
  await LgpdController.requestDataRight(oversized, oversizedResponse);

  assert.equal(invalidTypeResponse.statusCode, 400);
  assert.match(invalidTypeResponse.body.error, /tipo de solicitação inválido/i);
  assert.equal(oversizedResponse.statusCode, 400);
  assert.match(oversizedResponse.body.error, /no máximo 500 caracteres/i);
  assert.equal(createMock.mock.callCount(), 0);
});

test('acompanhamento apresenta o estado atualizado das solicitações do aluno', async (t) => {
  const { UserModel } = require('../dist/models/userModel');
  const { LgpdController } = require('../dist/controllers/lgpdController');
  t.mock.method(UserModel, 'getPrivacyRequests', async (userId) => {
    assert.equal(userId, 'user-a');
    return [
      {
        id: 'request-3',
        type: 'bloqueio-ou-anonimizacao',
        detail: 'Revisar estes dados.',
        status: 'in_review',
        requestedAt: new Date('2026-10-01T10:00:00.000Z'),
        updatedAt: new Date('2026-10-02T10:00:00.000Z'),
      },
    ];
  });

  const response = responseMock();
  await LgpdController.getPrivacyRequests(requestMock(), response);

  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.body.requests[0], {
    id: 'request-3',
    type: 'bloqueio-ou-anonimizacao',
    detail: 'Revisar estes dados.',
    status: 'in_review',
    requestedAt: '2026-10-01T10:00:00.000Z',
    updatedAt: '2026-10-02T10:00:00.000Z',
  });
});
