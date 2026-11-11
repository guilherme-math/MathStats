import { FieldValue } from 'firebase-admin/firestore';
import { db } from '../config/firebase';

export async function exportClassData(userId: string) {
  const [owned, joined] = await Promise.all([
    db.collection('classes').where('teacherId', '==', userId).get(),
    db.collection('classes').where('studentIds', 'array-contains', userId).get(),
  ]);
  const result = [];
  for (const c of [...owned.docs, ...joined.docs]) {
    const isTeacher = c.data().teacherId === userId;
    const activities = await c.ref.collection('activities').get();
    const rows = [];
    for (const a of activities.docs) {
      if (isTeacher) {
        rows.push({
          id: a.id,
          title: a.data().title,
          questions: a.data().questions,
          sportsData: a.data().sportsData || [],
          published: a.data().published,
        });
      } else {
        const submission = await a.ref.collection('submissions').doc(userId).get();
        if (submission.exists)
          rows.push({ id: a.id, title: a.data().title, submission: submission.data() });
      }
    }
    result.push({
      id: c.id,
      name: c.data().name,
      relationship: isTeacher ? 'professor' : 'aluno',
      activities: rows,
    });
  }
  return result;
}

export async function deleteClassData(userId: string) {
  const owned = await db.collection('classes').where('teacherId', '==', userId).get();
  for (const c of owned.docs) {
    // Mark before deletion so concurrent publication or submission cannot recreate children.
    await c.ref.update({ deleting: true });
    await db.collection('classInvites').doc(c.data().inviteCode).delete();
    await db.recursiveDelete(c.ref);
  }
  const joined = await db.collection('classes').where('studentIds', 'array-contains', userId).get();
  for (const c of joined.docs) {
    // Revoke access before removing personal deliveries.
    await c.ref.update({ studentIds: FieldValue.arrayRemove(userId) });
    const activities = await c.ref.collection('activities').get();
    for (const a of activities.docs) await a.ref.collection('submissions').doc(userId).delete();
  }
}
