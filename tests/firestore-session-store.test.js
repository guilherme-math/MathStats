const test = require('node:test');
const assert = require('node:assert/strict');

process.env.NODE_ENV = 'test';

function createCollection() {
  const documents = new Map();

  return {
    documents,
    doc(id) {
      return {
        async get() {
          const value = documents.get(id);
          return {
            exists: Boolean(value),
            data: () => value,
            ref: { delete: async () => documents.delete(id) },
          };
        },
        async set(value) {
          documents.set(id, {
            ...value,
            expiresAt: { toDate: () => value.expiresAt },
          });
        },
        async update(value) {
          const current = documents.get(id);
          documents.set(id, {
            ...current,
            ...value,
            expiresAt: { toDate: () => value.expiresAt },
          });
        },
        async delete() {
          documents.delete(id);
        },
      };
    },
  };
}

function callStore(store, method, ...args) {
  return new Promise((resolve, reject) => {
    store[method](...args, (error, value) => {
      if (error) reject(error);
      else resolve(value);
    });
  });
}

test('sessão no Firestore suporta gravação, leitura, renovação e exclusão', async () => {
  const { FirestoreSessionStore } = require('../dist/stores/firestoreSessionStore');
  const store = new FirestoreSessionStore();
  const collection = createCollection();
  store.sessions = collection;

  const sessionData = {
    cookie: { expires: new Date(Date.now() + 15 * 60 * 1000) },
    pending2faUserId: 'user-1',
  };

  await callStore(store, 'set', 'session-1', sessionData);
  assert.equal((await callStore(store, 'get', 'session-1')).pending2faUserId, 'user-1');

  const previousExpiration = collection.documents.get('session-1').expiresAt.toDate().getTime();
  sessionData.cookie.expires = new Date(previousExpiration + 60_000);
  await callStore(store, 'touch', 'session-1', sessionData);
  assert.ok(
    collection.documents.get('session-1').expiresAt.toDate().getTime() > previousExpiration,
  );

  await callStore(store, 'destroy', 'session-1');
  assert.equal(await callStore(store, 'get', 'session-1'), null);
});