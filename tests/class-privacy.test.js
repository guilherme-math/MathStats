const test = require('node:test');
const assert = require('node:assert/strict');
const { db } = require('../dist/config/firebase');
const { exportClassData } = require('../dist/services/classPrivacy');

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
