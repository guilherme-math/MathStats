import { db } from '../config/firebase';
import type {
  DocumentSnapshot,
  Query,
  QueryDocumentSnapshot,
  Timestamp,
} from 'firebase-admin/firestore';
import { DEFAULT_USER_ROLE, normalizeUserRole, type UserRole } from '../config/userRoles';

export interface User {
  id: string;
  displayName?: string;
  username: string;
  usernameNormalized?: string;
  email: string;
  emailNormalized?: string;
  role: UserRole;
  passwordHash: string;
  twoFactorSecret: string;
  legalAcceptedAt?: Timestamp | Date;
  lgpdAcceptedAt?: Timestamp | Date;
  termsVersion?: string;
  privacyPolicyVersion?: string;
  googleId?: string;
  recoveryToken?: string;
  recoveryTokenExpires?: Timestamp | Date;
  xpTotal?: number;
  streak?: number;
  lastStudyDate?: string | null;
  challengesAnswered?: number;
  challengesCorrect?: number;
  lastChallengeAt?: Timestamp | Date;
  createdAt: Timestamp | Date;
}

export interface ChallengeAttempt {
  id: string;
  challengeId: string;
  tipo: string;
  tipoDesafio: string;
  categoria: string;
  dificuldade: string;
  titulo: string;
  pergunta: string;
  respostaUsuario: any;
  respostaCorreta: any;
  acertou: boolean;
  usouDica: boolean;
  xpBase: number;
  xpGanho: number;
  respondidoEm: Timestamp | Date;
}

export interface PrivacyRequest {
  id: string;
  type: string;
  detail?: string | null;
  requestedAt: Timestamp | Date;
  status: 'received' | 'in_review' | 'completed' | 'rejected';
  updatedAt: Timestamp | Date;
}

const usersCollection = db.collection('users');

function docToUser(doc: DocumentSnapshot): User {
  return { id: doc.id, ...doc.data() } as User;
}

function normalizeUsername(username: string): string {
  return username.trim().normalize('NFKC').toLocaleLowerCase('pt-BR');
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

async function normalizeStoredUser(doc: DocumentSnapshot): Promise<User> {
  const data = doc.data() as any;
  const patch: Record<string, any> = {};

  if (data.username) {
    const normalizedUsername = normalizeUsername(String(data.username));
    if (data.username !== normalizedUsername) patch.username = normalizedUsername;
    if (data.usernameNormalized !== normalizedUsername)
      patch.usernameNormalized = normalizedUsername;
    if (!data.displayName) patch.displayName = String(data.username).trim();
  }

  if (data.email) {
    const normalizedEmail = normalizeEmail(String(data.email));
    if (data.email !== normalizedEmail) patch.email = normalizedEmail;
    if (data.emailNormalized !== normalizedEmail) patch.emailNormalized = normalizedEmail;
  }

  if (typeof data.xpTotal !== 'number') patch.xpTotal = 0;
  if (typeof data.streak !== 'number') patch.streak = 0;
  if (typeof data.challengesAnswered !== 'number') patch.challengesAnswered = 0;
  if (typeof data.challengesCorrect !== 'number') patch.challengesCorrect = 0;
  if (data.role !== normalizeUserRole(data.role)) patch.role = DEFAULT_USER_ROLE;

  if (Object.keys(patch).length) {
    await doc.ref.set(patch, { merge: true }).catch(() => {});
    return { id: doc.id, ...data, ...patch } as User;
  }

  return docToUser(doc);
}

async function legacyFind(field: 'username' | 'email', value: string): Promise<User | null> {
  const snapshot = await usersCollection.where(field, '==', value.trim()).limit(1).get();
  return snapshot.empty ? null : normalizeStoredUser(snapshot.docs[0]);
}

export const UserModel = {
  findByUsername: async (username: string): Promise<User | null> => {
    const normalized = normalizeUsername(username);
    const snap = await usersCollection.where('usernameNormalized', '==', normalized).limit(1).get();
    if (!snap.empty) return normalizeStoredUser(snap.docs[0]);
    return legacyFind('username', username);
  },

  findByEmail: async (email: string): Promise<User | null> => {
    const normalized = normalizeEmail(email);

    let snap = await usersCollection.where('emailNormalized', '==', normalized).limit(1).get();
    if (!snap.empty) return normalizeStoredUser(snap.docs[0]);

    snap = await usersCollection.where('email', '==', normalized).limit(1).get();
    if (!snap.empty) return normalizeStoredUser(snap.docs[0]);

    return legacyFind('email', email);
  },

  findById: async (id: string): Promise<User | null> => {
    const doc = await usersCollection.doc(id).get();
    return doc.exists ? normalizeStoredUser(doc) : null;
  },

  findByGoogleId: async (googleId: string): Promise<User | null> => {
    const snap = await usersCollection.where('googleId', '==', googleId).limit(1).get();
    return snap.empty ? null : normalizeStoredUser(snap.docs[0]);
  },

  findByRecoveryToken: async (hashToken: string): Promise<User | null> => {
    const snap = await usersCollection.where('recoveryToken', '==', hashToken).limit(1).get();
    return snap.empty ? null : normalizeStoredUser(snap.docs[0]);
  },

  create: async (data: {
    displayName: string;
    username: string;
    email: string;
    passwordHash: string;
    twoFactorSecret: string;
    legalAcceptedAt: Date;
    termsVersion: string;
    privacyPolicyVersion: string;
    googleId?: string;
  }): Promise<User> => {
    const displayName = data.displayName.trim();
    const username = normalizeUsername(data.username);
    const email = normalizeEmail(data.email);
    const createdAt = new Date();

    const ref = await usersCollection.add({
      ...data,
      displayName,
      username,
      usernameNormalized: username,
      email,
      emailNormalized: email,
      role: DEFAULT_USER_ROLE,
      xpTotal: 0,
      streak: 0,
      lastStudyDate: null,
      challengesAnswered: 0,
      challengesCorrect: 0,
      createdAt,
    });

    return {
      id: ref.id,
      ...data,
      displayName,
      username,
      usernameNormalized: username,
      email,
      emailNormalized: email,
      role: DEFAULT_USER_ROLE,
      xpTotal: 0,
      streak: 0,
      lastStudyDate: null,
      challengesAnswered: 0,
      challengesCorrect: 0,
      createdAt,
    } as User;
  },

  linkGoogleId: async (id: string, googleId: string): Promise<void> => {
    await usersCollection.doc(id).update({ googleId });
  },

  updateRecoveryToken: async (
    id: string,
    recoveryToken: string,
    recoveryTokenExpires: Date,
  ): Promise<void> => {
    await usersCollection.doc(id).update({ recoveryToken, recoveryTokenExpires });
  },

  consumeRecoveryToken: async (id: string, tokenHash: string): Promise<boolean> => {
    const reference = usersCollection.doc(id);
    return db.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(reference);
      const user = snapshot.data();
      if (
        !user ||
        user.recoveryToken !== tokenHash ||
        !user.recoveryTokenExpires ||
        user.recoveryTokenExpires.toMillis() <= Date.now()
      )
        return false;
      transaction.update(reference, { recoveryToken: null, recoveryTokenExpires: null });
      return true;
    });
  },

  updatePassword: async (
    id: string,
    passwordHash: string,
    previousHash?: string,
  ): Promise<void> => {
    const reference = usersCollection.doc(id);
    await db.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(reference);
      if (
        !snapshot.exists ||
        (previousHash !== undefined && snapshot.data()?.passwordHash !== previousHash)
      )
        throw new Error('As credenciais foram alteradas. Reinicie a operação.');
      transaction.update(reference, {
        passwordHash,
        recoveryToken: null,
        recoveryTokenExpires: null,
      });
    });
  },

  updateDisplayName: async (id: string, displayName: string): Promise<void> => {
    await usersCollection.doc(id).update({ displayName: displayName.trim() });
  },

  createPrivacyRequest: async (id: string, type: string, detail?: string): Promise<string> => {
    const now = new Date();
    const ref = await usersCollection
      .doc(id)
      .collection('privacyRequests')
      .add({
        type,
        detail: detail || null,
        requestedAt: now,
        updatedAt: now,
        status: 'received',
      });
    return ref.id;
  },

  getPrivacyRequests: async (id: string): Promise<PrivacyRequest[]> => {
    const snapshot = await usersCollection
      .doc(id)
      .collection('privacyRequests')
      .orderBy('requestedAt', 'desc')
      .get();
    return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }) as PrivacyRequest);
  },

  getChallengeHistory: async (id: string, limitCount = 10): Promise<ChallengeAttempt[]> => {
    const safeLimit = Math.min(Math.max(Number(limitCount) || 10, 1), 500);
    const snapshot = await usersCollection
      .doc(id)
      .collection('attempts')
      .orderBy('respondidoEm', 'desc')
      .limit(safeLimit)
      .get();

    return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }) as ChallengeAttempt);
  },

  getAllChallengeHistory: async (id: string): Promise<ChallengeAttempt[]> => {
    const attempts = usersCollection.doc(id).collection('attempts');
    const result: ChallengeAttempt[] = [];
    let lastDoc: QueryDocumentSnapshot | undefined;

    while (true) {
      let query: Query = attempts.orderBy('respondidoEm', 'desc').limit(400);
      if (lastDoc) query = query.startAfter(lastDoc);
      const snapshot = await query.get();
      snapshot.docs.forEach((doc) =>
        result.push({ id: doc.id, ...doc.data() } as ChallengeAttempt),
      );
      if (snapshot.size < 400) break;
      lastDoc = snapshot.docs[snapshot.docs.length - 1];
    }
    return result;
  },

  deleteUser: async (id: string): Promise<void> => {
    const userRef = usersCollection.doc(id);
    for (const collectionName of ['attempts', 'privacyRequests']) {
      const childCollection = userRef.collection(collectionName);
      while (true) {
        const snapshot = await childCollection.limit(400).get();
        if (snapshot.empty) break;
        const batch = db.batch();
        snapshot.docs.forEach((doc) => batch.delete(doc.ref));
        await batch.commit();
        if (snapshot.size < 400) break;
      }
    }

    await userRef.delete();
  },
};
