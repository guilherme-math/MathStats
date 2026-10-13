const test = require('node:test');
const assert = require('node:assert/strict');
const { LEGAL_DOCUMENTS } = require('../dist/config/legalDocuments');
const { getAuditRetentionSeconds } = require('../dist/utils/auditLogger');

test('documentos legais possuem versões explícitas', () => {
  assert.match(LEGAL_DOCUMENTS.termsVersion, /^\d{4}-\d{2}-\d{2}-v\d+$/);
  assert.match(LEGAL_DOCUMENTS.privacyPolicyVersion, /^\d{4}-\d{2}-\d{2}-v\d+$/);
});

test('retenção padrão de auditoria é 180 dias', () => {
  const previous = process.env.AUDIT_LOG_RETENTION_DAYS;
  delete process.env.AUDIT_LOG_RETENTION_DAYS;
  assert.equal(getAuditRetentionSeconds(), 180 * 24 * 60 * 60);
  if (previous === undefined) delete process.env.AUDIT_LOG_RETENTION_DAYS;
  else process.env.AUDIT_LOG_RETENTION_DAYS = previous;
});
