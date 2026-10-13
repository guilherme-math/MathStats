const VALID_STATUSES = new Set(['received', 'in_review', 'completed', 'rejected']);

async function main() {
  const [, , userId, requestId, status] = process.argv;

  if (!userId || !requestId || !VALID_STATUSES.has(status)) {
    console.error(
      'Uso: npm run privacy:status -- <userId> <requestId> <received|in_review|completed|rejected>',
    );
    process.exitCode = 1;
    return;
  }

  const { UserModel } = require('../dist/models/userModel');
  const { audit } = require('../dist/utils/auditLogger');
  const user = await UserModel.findById(userId);
  if (!user) throw new Error('Usuário não encontrado.');

  await UserModel.updatePrivacyRequestStatus(userId, requestId, status);
  await audit({
    event: 'LGPD_REQUEST_STATUS_UPDATED',
    userId,
    username: user.username,
    ip: 'operacao-local',
    detail: `Solicitação ${requestId} atualizada para ${status}`,
  });
  console.log(`Solicitação ${requestId} atualizada para ${status}.`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : 'Falha ao atualizar a solicitação.');
  process.exitCode = 1;
});
