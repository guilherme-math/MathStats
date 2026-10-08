const test = require('node:test');
const assert = require('node:assert/strict');
const { db } = require('../dist/config/firebase');
const { FirestoreRateLimitStore } = require('../dist/stores/firestoreRateLimitStore');

test('duas instâncias compartilham contagem, isolamento e vencimento no Firestore', async (t) => {
  const records = new Map();
  let queue = Promise.resolve();
  t.mock.method(db, 'runTransaction', (callback) => {
    const operation = queue.then(() =>
      callback({
        get: async (ref) => ({ exists: records.has(ref.path), data: () => records.get(ref.path) }),
        set: (ref, value) =>
          records.set(ref.path, {
            ...value,
            expiresAt: { toMillis: () => value.expiresAt.getTime() },
          }),
        update: (ref, patch) => records.set(ref.path, { ...records.get(ref.path), ...patch }),
      }),
    );
    queue = operation.catch(() => {});
    return operation;
  });
  let now = 1000;
  t.mock.method(Date, 'now', () => now);
  const first = new FirestoreRateLimitStore('login');
  const second = new FirestoreRateLimitStore('login');
  first.init({ windowMs: 5000 });
  second.init({ windowMs: 5000 });
  const results = await Promise.all(
    Array.from({ length: 20 }, (_, i) => (i % 2 ? first : second).increment('203.0.113.10')),
  );
  assert.equal(Math.max(...results.map((result) => result.totalHits)), 20);
  assert.equal(records.size, 1);
  assert.ok([...records.keys()].every((key) => !key.includes('203.0.113.10')));
  assert.equal((await first.increment('203.0.113.11')).totalHits, 1);
  const signup = new FirestoreRateLimitStore('signup');
  assert.equal((await signup.increment('203.0.113.10')).totalHits, 1);
  now = 6000;
  assert.equal((await second.increment('203.0.113.10')).totalHits, 1);
});

test('falha do armazenamento compartilhado não libera requisições', async (t) => {
  t.mock.method(db, 'runTransaction', async () => {
    throw new Error('database offline');
  });
  await assert.rejects(new FirestoreRateLimitStore('login').increment('client'), /offline/);
});
