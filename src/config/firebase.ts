import fs from 'fs';
import path from 'path';
import { cert, getApps, initializeApp, type ServiceAccount } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';

function loadCredential(): ServiceAccount {
  const base64Json = process.env.FIREBASE_SERVICE_ACCOUNT_BASE64;
  if (base64Json) {
    return JSON.parse(Buffer.from(base64Json, 'base64').toString('utf8')) as ServiceAccount;
  }

  const inlineJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (inlineJson) return JSON.parse(inlineJson) as ServiceAccount;

  const keyPath = path.resolve(process.cwd(), process.env.FIREBASE_KEY_PATH || 'firebase-key.json');
  if (!fs.existsSync(keyPath)) {
    throw new Error(
      `Credencial do Firebase não encontrada em ${keyPath}. Defina FIREBASE_KEY_PATH, FIREBASE_SERVICE_ACCOUNT_JSON ou FIREBASE_SERVICE_ACCOUNT_BASE64.`,
    );
  }

  return JSON.parse(fs.readFileSync(keyPath, 'utf8')) as ServiceAccount;
}

if (!getApps().length) {
  initializeApp({
    credential: cert(loadCredential()),
  });
}

export const db = getFirestore();
export const auth = getAuth();