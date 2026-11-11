import type { Firestore } from 'firebase-admin/firestore';

// Separate top-level collections for a preview while retaining normal document references.
export function withCollectionPrefix(firestore: Firestore, prefix = ''): Firestore {
  if (!prefix) return firestore;
  if (!/^[a-z][a-z0-9_]{0,48}_$/.test(prefix)) {
    throw new Error('FIRESTORE_COLLECTION_PREFIX inválido.');
  }
  return new Proxy(firestore, {
    get(target, property) {
      if (property === 'collection') {
        return (path: string) => target.collection(prefix + path);
      }
      if (property === 'doc' || property === 'collectionGroup' || property === 'listCollections') {
        throw new Error('Operação global indisponível no ambiente isolado de prévia.');
      }
      const value = Reflect.get(target, property, target);
      return typeof value === 'function' ? value.bind(target) : value;
    },
  });
}
