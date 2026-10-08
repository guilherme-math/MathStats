import session from 'express-session';
import { db } from '../config/firebase';

const DEFAULT_TTL_MS = 15 * 60 * 1000;

function expirationDate(sessionData: session.SessionData): Date {
  const expires = sessionData.cookie.expires;
  return expires ? new Date(expires) : new Date(Date.now() + DEFAULT_TTL_MS);
}

export class FirestoreSessionStore extends session.Store {
  private readonly sessions = db.collection('sessions');

  get(
    sessionId: string,
    callback: (error: unknown, session?: session.SessionData | null) => void,
  ): void {
    void this.sessions
      .doc(sessionId)
      .get()
      .then(async (snapshot) => {
        if (!snapshot.exists) {
          callback(null, null);
          return;
        }

        const stored = snapshot.data();
        const expiresAt = stored?.expiresAt?.toDate?.() as Date | undefined;
        if (!stored?.data || !expiresAt || expiresAt.getTime() <= Date.now()) {
          await snapshot.ref.delete();
          callback(null, null);
          return;
        }

        callback(null, JSON.parse(stored.data) as session.SessionData);
      })
      .catch((error) => callback(error));
  }

  set(
    sessionId: string,
    sessionData: session.SessionData,
    callback?: (error?: unknown) => void,
  ): void {
    void this.sessions
      .doc(sessionId)
      .set({
        data: JSON.stringify(sessionData),
        expiresAt: expirationDate(sessionData),
        updatedAt: new Date(),
      })
      .then(() => callback?.())
      .catch((error) => callback?.(error));
  }

  destroy(sessionId: string, callback?: (error?: unknown) => void): void {
    void this.sessions
      .doc(sessionId)
      .delete()
      .then(() => callback?.())
      .catch((error) => callback?.(error));
  }

  touch(
    sessionId: string,
    sessionData: session.SessionData,
    callback?: (error?: unknown) => void,
  ): void {
    void this.sessions
      .doc(sessionId)
      .update({
        expiresAt: expirationDate(sessionData),
        updatedAt: new Date(),
      })
      .then(() => callback?.())
      .catch((error) => callback?.(error));
  }
}