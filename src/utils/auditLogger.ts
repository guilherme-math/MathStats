import { getMongoDb } from '../config/mongodb';

export type AuditEvent =
  | 'LOGIN_SUCCESS'
  | 'LOGIN_FAILURE'
  | 'LOGIN_2FA_SUCCESS'
  | 'LOGIN_2FA_FAILURE'
  | 'LOGOUT'
  | 'SIGNUP'
  | 'SIGNUP_REJECTED'
  | 'RECOVERY_REQUESTED'
  | 'RECOVERY_VERIFIED'
  | 'RECOVERY_SUCCESS'
  | 'RECOVERY_FAILURE'
  | 'LGPD_DATA_QUERY'
  | 'LGPD_DATA_EXPORT'
  | 'LGPD_RIGHTS_REQUESTED'
  | 'LGPD_PROFILE_CORRECTED'
  | 'LGPD_ACCOUNT_DELETED'
  | 'CHALLENGE_ANSWERED'
  | 'GOOGLE_LINKED'
  | 'PASSWORD_CREATED'
  | 'PASSWORD_CHANGED';

export interface AuditLogEntry {
  event: AuditEvent;
  userId?: string;
  username?: string;
  ip?: string;
  detail?: string;
  createdAt: Date;
}

let indexReady = false;

export function getAuditRetentionSeconds(): number {
  const retentionDays = Math.max(1, Number(process.env.AUDIT_LOG_RETENTION_DAYS) || 180);
  return retentionDays * 24 * 60 * 60;
}

async function collection() {
  const db = await getMongoDb();
  const logs = db.collection<AuditLogEntry>('auditLogs');

  if (!indexReady) {
    await Promise.all([
      logs.createIndex({ userId: 1, createdAt: -1 }),
      logs.createIndex({ event: 1, createdAt: -1 }),
      logs.createIndex(
        { createdAt: 1 },
        { expireAfterSeconds: getAuditRetentionSeconds(), name: 'auditLogs_retention_ttl' },
      ),
    ]);
    indexReady = true;
  }

  return logs;
}

export async function audit(entry: Omit<AuditLogEntry, 'createdAt'>): Promise<void> {
  try {
    const logs = await collection();
    await logs.insertOne({ ...entry, createdAt: new Date() });
  } catch (error) {
    console.error('[auditLogger] Falha ao gravar log no MongoDB:', error);
    console.log(
      `[audit-fallback] ${entry.event} | userId:${entry.userId ?? '-'} | ${entry.detail ?? ''}`,
    );
  }
}

export async function getAuditLogsForUser(
  userId: string,
  limitCount = 50,
): Promise<AuditLogEntry[]> {
  const logs = await collection();
  return logs.find({ userId }).sort({ createdAt: -1 }).limit(limitCount).toArray();
}

export async function getAllAuditLogsForUser(userId: string): Promise<AuditLogEntry[]> {
  const logs = await collection();
  return logs.find({ userId }).sort({ createdAt: -1 }).toArray();
}

export async function anonymizeAuditLogsForUser(userId: string): Promise<void> {
  const logs = await collection();
  await logs.updateMany(
    { userId },
    {
      $unset: { userId: '', username: '', ip: '' },
      $set: { detail: 'Registro anonimizado após exclusão da conta' },
    },
  );
}

export async function getAllAuditLogs(limitCount = 100): Promise<AuditLogEntry[]> {
  const logs = await collection();
  return logs.find({}).sort({ createdAt: -1 }).limit(limitCount).toArray();
}