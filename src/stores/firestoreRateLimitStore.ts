import { createHash } from 'node:crypto';
import type { Options, Store } from 'express-rate-limit';
import { db } from '../config/firebase';

export class FirestoreRateLimitStore implements Store {
  private windowMs = 15 * 60 * 1000;
  readonly localKeys = false;

  constructor(readonly prefix: string) {}

  init(options: Options) {
    this.windowMs = options.windowMs;
  }

  private reference(key: string) {
    const digest = createHash('sha256').update(key).digest('hex');
    return db.collection('rateLimits').doc(`${this.prefix}-${digest}`);
  }

  async increment(key: string) {
    const reference = this.reference(key);
    return db.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(reference);
      const data = snapshot.data();
      const previousReset = data?.expiresAt?.toMillis() ?? 0;
      const now = Date.now();
      const active = previousReset > now;
      const totalHits = active ? Number(data?.totalHits ?? 0) + 1 : 1;
      const resetTime = new Date(active ? previousReset : now + this.windowMs);
      transaction.set(reference, { totalHits, expiresAt: resetTime });
      return { totalHits, resetTime };
    });
  }

  async decrement(key: string) {
    const reference = this.reference(key);
    await db.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(reference);
      if (snapshot.exists)
        transaction.update(reference, { totalHits: Math.max(0, snapshot.data()!.totalHits - 1) });
    });
  }

  async resetKey(key: string) {
    await this.reference(key).delete();
  }
}
