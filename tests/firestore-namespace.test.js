const test = require('node:test');
const assert = require('node:assert/strict');
const { withCollectionPrefix } = require('../dist/config/firestoreNamespace');
test('prévia separa coleções e preserva contexto dos métodos e referências', () => {
  const raw = {
    collection(path) {
      return { path, owner: this };
    },
    runTransaction() {
      return this;
    },
  };
  const preview = withCollectionPrefix(raw, 'preview_professor_');
  assert.equal(preview.collection('users').path, 'preview_professor_users');
  assert.equal(preview.collection('classes').owner, raw);
  assert.equal(preview.runTransaction(), raw);
  assert.equal(withCollectionPrefix(raw), raw);
  assert.throws(() => withCollectionPrefix(raw, '../users'));
  assert.throws(() => preview.doc('users/id'));
  assert.throws(() => preview.collectionGroup('submissions'));
});
