const test = require('node:test');
const assert = require('node:assert/strict');
const { db } = require('../dist/config/firebase');
const { FieldValue } = require('firebase-admin/firestore');
const { deleteClassData, exportClassData } = require('../dist/services/classPrivacy');

test('exportação de turmas inclui solicitação pendente e somente registros do titular', async (t) => {
  const userId = 'student-a';
  const startedAt = new Date('2026-11-14T12:00:00Z');
  const submission = { correct: 2, total: 3 };
  const reads = [];
  const activity = (id, entries) => ({
    id,
    data: () => ({ title: id }),
    ref: {
      collection: (kind) => ({
        doc: (target) => ({
          get: async () => {
            reads.push([id, kind, target]);
            const value = entries[kind]?.[target];
            return { exists: value !== undefined, data: () => value };
          },
        }),
      }),
    },
  });
  const classes = {
    teacherId: [],
    studentIds: [
      {
        id: 'joined',
        data: () => ({ name: 'Turma aprovada', teacherId: 'teacher' }),
        ref: {
          collection: (name) => {
            assert.equal(name, 'activities');
            return {
              get: async () => ({
                docs: [
                  activity('respondida', { submissions: { [userId]: submission } }),
                  activity('iniciada', { starts: { [userId]: { startedAt } } }),
                  activity('outra-conta', { submissions: { 'student-b': { correct: 3 } } }),
                ],
              }),
            };
          },
        },
      },
    ],
    pendingStudentIds: [
      {
        id: 'pending',
        data: () => ({ name: 'Turma pendente' }),
      },
    ],
  };

  t.mock.method(db, 'collection', (name) => {
    assert.equal(name, 'classes');
    return {
      where: (field, operator, target) => {
        assert.equal(target, userId);
        assert.equal(operator, field === 'teacherId' ? '==' : 'array-contains');
        return { get: async () => ({ docs: classes[field] }) };
      },
    };
  });

  const rows = await exportClassData(userId);
  assert.deepEqual(rows, [
    { id: 'pending', name: 'Turma pendente', relationship: 'solicitacao_pendente', activities: [] },
    {
      id: 'joined',
      name: 'Turma aprovada',
      relationship: 'aluno',
      activities: [
        { id: 'respondida', title: 'respondida', submission, startedAt: null },
        { id: 'iniciada', title: 'iniciada', submission: null, startedAt },
      ],
    },
  ]);
  assert.equal(reads.length, 6);
  assert.ok(reads.every(([, , target]) => target === userId));
});

test('exclusão de vínculo apaga início e entrega do aluno sem acessar registros de colegas', async (t) => {
  const userId = 'student-a';
  const actions = [];
  const entries = {
    starts: new Set([userId, 'student-b']),
    submissions: new Set([userId, 'student-b']),
  };
  const activityRef = {
    collection: (kind) => ({
      doc: (id) => ({
        delete: async () => {
          actions.push(kind);
          entries[kind].delete(id);
        },
      }),
    }),
  };
  const classRef = {
    update: async ({ studentIds }) => {
      assert.ok(studentIds.isEqual(FieldValue.arrayRemove(userId)));
      actions.push('membership');
    },
    collection: (name) => {
      assert.equal(name, 'activities');
      return { get: async () => ({ docs: [{ ref: activityRef }] }) };
    },
  };
  t.mock.method(db, 'collection', (name) => {
    assert.equal(name, 'classes');
    return {
      where: (field, operator, target) => {
        assert.equal(target, userId);
        assert.equal(operator, field === 'teacherId' ? '==' : 'array-contains');
        return { get: async () => ({ docs: field === 'studentIds' ? [{ ref: classRef }] : [] }) };
      },
    };
  });

  await deleteClassData(userId);
  assert.equal(actions[0], 'membership');
  assert.deepEqual(actions.slice(1).sort(), ['starts', 'submissions']);
  assert.deepEqual([...entries.starts], ['student-b']);
  assert.deepEqual([...entries.submissions], ['student-b']);
});
