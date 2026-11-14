import { Router, type Request, type Response } from 'express';
import { randomBytes, randomInt } from 'node:crypto';
import { FieldValue } from 'firebase-admin/firestore';
import { z } from 'zod';
import { db } from '../config/firebase';
import { requireRole } from '../middlewares/auth';
import { classJoinLimiter, classLimiter, teacherFootballLimiter } from '../middlewares/security';
import { type AppSession } from '../types/session';
import {
  activitySchema,
  publicQuestions,
  gradeActivity,
  type ActivityContent,
} from '../services/classActivities';
import { audit } from '../utils/auditLogger';
import {
  teacherTeams,
  footballQuery,
  footballDatasets,
  footballModelSchema,
  footballQuestion,
  readFootballSnapshot,
} from '../services/teacherFootball';

const router = Router();
const classes = db.collection('classes');
const idSchema = z.string().regex(/^[A-Za-z0-9_-]{1,80}$/);
const publishOptions = z
  .object({
    opensAt: z.iso.datetime().optional(),
    durationMinutes: z.number().int().min(1).max(1440).optional(),
  })
  .strict();

function deadline(startedAt: number | undefined, duration: number | undefined) {
  return startedAt && duration ? startedAt + duration * 60_000 : null;
}
const nameSchema = z.object({ name: z.string().trim().min(2).max(80) }).strict();
const session = (req: Request) => req.session as AppSession;
const fail = (status: number, message: string) => Object.assign(new Error(message), { status });
const safe =
  (fn: (req: Request, res: Response) => Promise<unknown>) =>
  async (req: Request, res: Response) => {
    try {
      await fn(req, res);
    } catch (error) {
      const e = error as Error & { status?: number };
      if (!e.status) console.error('[classes] Falha na operação.');
      res.status(e.status || 503).json({
        error: e.status ? e.message : 'Não foi possível concluir a operação. Tente novamente.',
      });
    }
  };
const classRef = (req: Request) => {
  const parsed = idSchema.safeParse(req.params.classId);
  if (!parsed.success) throw fail(400, 'Turma inválida.');
  return classes.doc(parsed.data);
};
const activityRef = (req: Request) => {
  const parsed = idSchema.safeParse(req.params.activityId);
  if (!parsed.success) throw fail(400, 'Atividade inválida.');
  return classRef(req).collection('activities').doc(parsed.data);
};
function authorize(
  data: FirebaseFirestore.DocumentData | undefined,
  req: Request,
  teacherOnly = false,
) {
  if (!data) throw fail(404, 'Turma não encontrada.');
  const s = session(req);
  if (s.role === 'professor' && data.teacherId === s.userId) return;
  if (!teacherOnly && s.role === 'aluno' && data.studentIds.includes(s.userId)) return;
  throw fail(403, 'Você não possui acesso a esta turma.');
}
async function log(
  req: Request,
  event:
    | 'CLASS_CREATED'
    | 'CLASS_JOINED'
    | 'ACTIVITY_CREATED'
    | 'ACTIVITY_PUBLISHED'
    | 'ACTIVITY_SUBMITTED',
) {
  await audit({
    event,
    userId: session(req).userId,
    username: session(req).username,
    ip: req.ip,
    detail: String(req.params.classId || ''),
  });
}
router.use('/classes', requireRole('aluno', 'professor'), classLimiter);
router.use('/teacher/football', requireRole('professor'), teacherFootballLimiter);
router.get(
  '/teacher/football/catalog',
  safe(async (_req, res) => {
    res.json({ teams: teacherTeams, season: 2024 });
  }),
);
router.get(
  '/teacher/football/data',
  safe(async (req, res) => {
    const parsed = footballQuery.safeParse(req.query);
    if (!parsed.success) throw fail(400, 'Escolha um time, contexto e conjunto de dados válidos.');
    const datasets = await footballDatasets(parsed.data, session(req).userId!);
    if (!datasets.length)
      throw fail(
        503,
        'A API não disponibilizou estatísticas utilizáveis para esse jogador/time. Escolha outro contexto ou use uma questão personalizada.',
      );
    res.json({ datasets });
  }),
);
router.post(
  '/teacher/football/question',
  safe(async (req, res) => {
    const parsed = footballModelSchema.safeParse(req.body);
    if (!parsed.success) throw fail(400, 'Modelo inválido.');
    try {
      res.json({
        question: {
          ...footballQuestion(
            readFootballSnapshot(parsed.data.token, session(req).userId!),
            parsed.data.model,
            parsed.data.format,
          ),
          footballToken: parsed.data.token,
        },
      });
    } catch {
      throw fail(400, 'Dados expirados ou modelo incompatível. Consulte os dados novamente.');
    }
  }),
);

router.get(
  '/classes',
  safe(async (req, res) => {
    const s = session(req);
    const snap = await classes
      .where(
        s.role === 'professor' ? 'teacherId' : 'studentIds',
        s.role === 'professor' ? '==' : 'array-contains',
        s.userId,
      )
      .limit(100)
      .get();
    res.json({
      ...(s.role === 'aluno'
        ? {
            pending: (
              await classes.where('pendingStudentIds', 'array-contains', s.userId).limit(100).get()
            ).docs
              .filter((doc) => !doc.data().deleting)
              .map((doc) => ({ name: doc.data().name })),
          }
        : {}),
      classes: snap.docs.map((d) => ({
        id: d.id,
        name: d.data().name,
        students: d.data().studentIds.length,
      })),
    });
  }),
);
router.get(
  '/classes/overview',
  requireRole('professor'),
  safe(async (req, res) => {
    const owned = await classes.where('teacherId', '==', session(req).userId!).get();
    const active = owned.docs.filter((doc) => !doc.data().deleting);
    const published = await Promise.all(
      active.map((doc) =>
        doc.ref.collection('activities').where('published', '==', true).count().get(),
      ),
    );
    const drafts = await Promise.all(
      active.map((doc) =>
        doc.ref.collection('activities').where('published', '==', false).count().get(),
      ),
    );
    res.json({
      classes: active.length,
      students: new Set(active.flatMap((doc) => doc.data().studentIds)).size,
      published: published.reduce((total, snapshot) => total + snapshot.data().count, 0),
      drafts: drafts.reduce((total, snapshot) => total + snapshot.data().count, 0),
    });
  }),
);
router.post(
  '/classes',
  requireRole('professor'),
  safe(async (req, res) => {
    const parsed = nameSchema.safeParse(req.body);
    if (!parsed.success) throw fail(400, 'Informe um nome de turma entre 2 e 80 caracteres.');
    const code = randomBytes(16).toString('hex');
    const ref = classes.doc();
    await db.runTransaction(async (tx) => {
      const user = await tx.get(db.collection('users').doc(session(req).userId!));
      if (!user.exists || user.data()?.deleting || user.data()?.role !== 'professor')
        throw fail(403, 'Conta sem autorização.');
      tx.create(ref, {
        name: parsed.data.name,
        teacherId: session(req).userId,
        studentIds: [],
        inviteCode: code,
        createdAt: new Date(),
      });
      tx.create(db.collection('classInvites').doc(code), { classId: ref.id });
    });
    await log(req, 'CLASS_CREATED');
    res.status(201).json({ id: ref.id });
  }),
);
router.post(
  '/classes/:classId/invite-code',
  requireRole('professor'),
  safe(async (req, res) => {
    const ref = classRef(req);
    const invites = db.collection('classInvites');
    const result = await db.runTransaction(async (tx) => {
      const turma = (await tx.get(ref)).data();
      authorize(turma, req, true);
      if (turma!.deleting) throw fail(409, 'Turma indisponível.');
      const now = Date.now();
      if (turma!.shortInviteExpiresAt?.toMillis() > now) return { code: turma!.shortInviteCode };
      for (let attempt = 0; attempt < 10; attempt++) {
        const code = String(randomInt(1_000_000)).padStart(6, '0');
        const invite = invites.doc(code);
        const existing = (await tx.get(invite)).data();
        if (existing && existing.expiresAt?.toMillis() > now) continue;
        const expiresAt = new Date(now + 15 * 60 * 1000);
        tx.set(invite, { classId: ref.id, expiresAt });
        tx.update(ref, { shortInviteCode: code, shortInviteExpiresAt: expiresAt });
        return { code };
      }
      throw fail(503, 'Não foi possível gerar um código agora. Tente novamente.');
    });
    res.json(result);
  }),
);
router.post(
  '/classes/join',
  requireRole('aluno'),
  classJoinLimiter,
  safe(async (req, res) => {
    const parsed = z
      .object({ code: z.string().regex(/^(?:[0-9]{6}|[a-f0-9]{32})$/) })
      .strict()
      .safeParse(req.body);
    if (!parsed.success) throw fail(400, 'Informe um código de convite válido.');
    const request = await db.runTransaction(async (tx) => {
      const invite = await tx.get(db.collection('classInvites').doc(parsed.data.code));
      if (
        !invite.exists ||
        (parsed.data.code.length === 6 && !(invite.data()!.expiresAt?.toMillis() > Date.now()))
      )
        throw fail(404, 'Convite inválido ou expirado.');
      const ref = classes.doc(invite.data()!.classId);
      const doc = await tx.get(ref);
      const user = await tx.get(db.collection('users').doc(session(req).userId!));
      if (!doc.exists || doc.data()!.deleting || !user.exists || user.data()?.deleting)
        throw fail(404, 'Turma indisponível.');
      const data = doc.data()!;
      const id = user.id;
      if (data.studentIds.includes(id)) return { id: ref.id, pending: false };
      const pending: string[] = data.pendingStudentIds || [];
      if (!pending.includes(id)) {
        if (pending.length >= 300) throw fail(409, 'Esta turma atingiu o limite de solicitações.');
        tx.update(ref, { pendingStudentIds: FieldValue.arrayUnion(id) });
      }
      return { id: ref.id, pending: true };
    });
    res.json(request);
  }),
);
router.post(
  '/classes/:classId/memberships/:studentId',
  requireRole('professor'),
  safe(async (req, res) => {
    const student = idSchema.safeParse(req.params.studentId);
    const decision = z.object({ approve: z.boolean() }).strict().safeParse(req.body);
    if (!student.success || !decision.success) throw fail(400, 'Solicitação inválida.');
    const ref = classRef(req);
    await db.runTransaction(async (tx) => {
      const turma = (await tx.get(ref)).data();
      authorize(turma, req, true);
      if (turma!.deleting || !turma!.pendingStudentIds?.includes(student.data))
        throw fail(404, 'Solicitação indisponível.');
      if (decision.data.approve) {
        const account = (await tx.get(db.collection('users').doc(student.data))).data();
        if (!account || account.deleting || account.role !== 'aluno')
          throw fail(409, 'Conta de aluno indisponível.');
        if (turma!.studentIds.length >= 300)
          throw fail(409, 'Esta turma atingiu o limite de participantes.');
      }
      tx.update(ref, {
        pendingStudentIds: FieldValue.arrayRemove(student.data),
        ...(decision.data.approve ? { studentIds: FieldValue.arrayUnion(student.data) } : {}),
      });
    });
    if (decision.data.approve) await log(req, 'CLASS_JOINED');
    res.json({ approved: decision.data.approve });
  }),
);
router.get(
  '/classes/questions',
  requireRole('professor'),
  safe(async (req, res) => {
    const owned = await classes.where('teacherId', '==', session(req).userId!).get();
    const active = owned.docs.filter((doc) => !doc.data().deleting);
    const collections = await Promise.all(
      active.map((doc) => doc.ref.collection('activities').get()),
    );
    const questions = collections.flatMap((snapshot, position) =>
      snapshot.docs.flatMap((doc) => {
        const data = doc.data();
        if (data.copiedFrom || doc.id.startsWith('copy_')) return [];
        return (data.questions as ActivityContent['questions'])
          .map((question, index) => ({
            classId: active[position].id,
            className: active[position].data().name,
            activityId: doc.id,
            activityTitle: data.title,
            index,
            prompt: (data.libraryQuestions?.[index] || question).prompt,
            type: (data.libraryQuestions?.[index] || question).type,
          }))
          .filter((question) => data.libraryQuestions?.[question.index] !== null);
      }),
    );
    res.json({ questions });
  }),
);
router.get(
  '/classes/:classId/progress',
  requireRole('professor'),
  safe(async (req, res) => {
    const ref = classRef(req);
    const turma = (await ref.get()).data();
    authorize(turma, req, true);
    if (turma!.deleting) throw fail(404, 'Turma indisponível.');
    const ids: string[] = turma!.studentIds;
    const users = ids.length
      ? await db.getAll(...ids.map((id) => db.collection('users').doc(id)))
      : [];
    const students = users
      .filter((doc) => doc.exists && !doc.data()?.deleting)
      .map((doc) => ({
        id: doc.id,
        name: doc.data()!.displayName || doc.data()!.username,
      }));
    const roster = new Set(students.map((student) => student.id));
    const day = new Intl.DateTimeFormat('sv-SE', { timeZone: 'America/Sao_Paulo' });
    const recentDays = Array.from({ length: 7 }, (_, i) =>
      day.format(new Date(Date.now() - (6 - i) * 86_400_000)),
    );
    const published = await ref.collection('activities').where('published', '==', true).get();
    const activities = [];
    for (const activity of published.docs) {
      const data = activity.data();
      if (data.opensAt?.toMillis() > Date.now()) continue;
      const submissions = await activity.ref
        .collection('submissions')
        .select('answers', 'submittedAt', 'correct', 'total')
        .get();
      const starts = await activity.ref.collection('starts').select('startedAt').get();
      const deliveries = submissions.docs.filter((doc) => roster.has(doc.id));
      const answers = deliveries.map((doc) => doc.data().answers);
      const daily = Object.fromEntries(recentDays.map((date) => [date, 0]));
      for (const delivery of deliveries) {
        const time = delivery.data().submittedAt?.toDate?.();
        if (!time) continue;
        const date = day.format(time);
        if (Object.hasOwn(daily, date)) daily[date]++;
      }
      activities.push({
        id: activity.id,
        title: data.title,
        submitted: answers.length,
        daily,
        pending: roster.size - answers.length,
        startedIds: starts.docs.map((doc) => doc.id).filter((id) => roster.has(id)),
        expiredIds: starts.docs
          .filter((doc) => {
            const ends = deadline(doc.data().startedAt?.toMillis(), data.durationMinutes);
            return roster.has(doc.id) && ends !== null && ends <= Date.now();
          })
          .map((doc) => doc.id),
        results: deliveries.map((doc) => ({
          id: doc.id,
          correct: doc.data().correct,
          total: doc.data().total,
          outcomes: (doc.data().answers || []).map(
            (answer: { correct: boolean }) => answer.correct,
          ),
        })),
        questions: (data.questions as ActivityContent['questions']).map((question, index) => ({
          prompt: question.prompt,
          correct: answers.filter((submission) => submission?.[index]?.correct === true).length,
        })),
      });
    }
    const drafts = await ref.collection('activities').where('published', '==', false).count().get();
    res.json({ activities, students, drafts: drafts.data().count });
  }),
);
router.get(
  '/classes/:classId',
  safe(async (req, res) => {
    const ref = classRef(req);
    const doc = await ref.get();
    const data = doc.data();
    authorize(data, req);
    const teacher = session(req).role === 'professor';
    const activities = await (
      teacher
        ? ref.collection('activities')
        : ref.collection('activities').where('published', '==', true)
    )
      .limit(100)
      .get();
    const rows = [];
    for (const activity of activities.docs) {
      const a = activity.data();
      const own = teacher
        ? null
        : await activity.ref.collection('submissions').doc(session(req).userId!).get();
      rows.push({
        id: activity.id,
        title: a.title,
        published: a.published,
        opensAt: a.opensAt?.toMillis() ?? null,
        durationMinutes: a.durationMinutes ?? null,
        total: a.questions.length,
        submitted: own?.exists || false,
      });
    }
    const pendingIds: string[] = teacher ? data!.pendingStudentIds || [] : [];
    const requests = pendingIds.length
      ? await db.getAll(...pendingIds.map((id) => db.collection('users').doc(id)))
      : [];
    res.json({
      id: doc.id,
      name: data!.name,
      students: data!.studentIds.length,
      ...(teacher
        ? {
            inviteCode: data!.inviteCode,
            requests: requests
              .filter((user) => user.exists && !user.data()?.deleting)
              .map((user) => ({
                id: user.id,
                name: user.data()!.displayName || user.data()!.username,
                username: user.data()!.username,
                email: user.data()!.email,
              })),
          }
        : {}),
      activities: rows,
    });
  }),
);
router.post(
  '/classes/:classId/activities',
  requireRole('professor'),
  safe(async (req, res) => {
    const parsed = activitySchema.safeParse(req.body);
    if (!parsed.success)
      throw fail(
        400,
        'Confira o título, enunciados, alternativas, gabaritos e explicações. São permitidas até 10 questões.',
      );
    const ref = classRef(req);
    const activity = ref.collection('activities').doc();
    let sportsData;
    try {
      sportsData = parsed.data.questions.map((q) =>
        q.footballToken ? readFootballSnapshot(q.footballToken, session(req).userId!) : null,
      );
    } catch {
      throw fail(
        400,
        'Os dados de futebol expiraram ou não pertencem à sua conta. Consulte-os novamente.',
      );
    }
    const questions = parsed.data.questions.map(({ footballToken, ...q }) => q);
    await db.runTransaction(async (tx) => {
      const doc = await tx.get(ref);
      authorize(doc.data(), req, true);
      if (doc.data()!.deleting) throw fail(409, 'Turma indisponível.');
      tx.create(activity, {
        title: parsed.data.title,
        questions,
        sportsData,
        published: false,
        createdAt: new Date(),
      });
    });
    await log(req, 'ACTIVITY_CREATED');
    res.status(201).json({ id: activity.id });
  }),
);
router.patch(
  '/classes/:classId/activities/:activityId/library/:index',
  requireRole('professor'),
  safe(async (req, res) => {
    const index = Number(req.params.index);
    const parsed = z
      .union([z.null(), activitySchema.shape.questions.element])
      .safeParse(req.body?.question);
    if (!Number.isInteger(index) || index < 0 || index > 9 || !parsed.success)
      throw fail(400, 'Confira os dados da questão.');
    const ref = classRef(req);
    const activity = activityRef(req);
    await db.runTransaction(async (tx) => {
      const turma = await tx.get(ref);
      authorize(turma.data(), req, true);
      if (turma.data()!.deleting) throw fail(409, 'Turma indisponível.');
      const data = (await tx.get(activity)).data();
      if (!data?.questions[index] || data.libraryQuestions?.[index] === null)
        throw fail(404, 'Questão indisponível.');
      const updated = parsed.data;
      if (updated?.footballToken) throw fail(400, 'Dados da questão inválidos.');
      tx.update(activity, { ['libraryQuestions.' + index]: updated });
    });
    res.json({ saved: true });
  }),
);
router.post(
  '/classes/:classId/activities/:activityId/copy',
  requireRole('professor'),
  safe(async (req, res) => {
    const parsed = z
      .object({
        targetClassId: idSchema,
        questionIndex: z.number().int().min(0).max(9).optional(),
      })
      .strict()
      .safeParse(req.body);
    if (!parsed.success) throw fail(400, 'Selecione uma turma de destino.');
    const { targetClassId, questionIndex } = parsed.data;
    const sourceClass = classRef(req);
    const sourceActivity = activityRef(req);
    const targetClass = classes.doc(targetClassId);
    if (questionIndex === undefined && sourceClass.id === targetClass.id)
      throw fail(400, 'Selecione outra turma para copiar a atividade.');
    const copied = await db.runTransaction(async (tx) => {
      const source = await tx.get(sourceClass);
      const destination = await tx.get(targetClass);
      authorize(source.data(), req, true);
      authorize(destination.data(), req, true);
      if (source.data()!.deleting || destination.data()!.deleting)
        throw fail(409, 'Turma indisponível.');
      const activity = (await tx.get(sourceActivity)).data();
      if (!activity) throw fail(404, 'Atividade indisponível.');
      const question =
        questionIndex === undefined
          ? undefined
          : activity.libraryQuestions?.[questionIndex] === null
            ? null
            : (activity.libraryQuestions?.[questionIndex] ?? activity.questions[questionIndex]);
      if (questionIndex !== undefined && !question) throw fail(404, 'Questão indisponível.');
      const key =
        'copy_' +
        source.id +
        '_' +
        sourceActivity.id +
        (questionIndex === undefined ? '' : '_q' + questionIndex);
      const target = targetClass.collection('activities').doc(key);
      if ((await tx.get(target)).exists) return false;
      tx.create(target, {
        title:
          questionIndex === undefined
            ? activity.title
            : (activity.title + ' · Questão ' + (questionIndex + 1)).slice(0, 100),
        questions: questionIndex === undefined ? activity.questions : [question],
        sportsData:
          questionIndex === undefined
            ? activity.sportsData || []
            : [activity.sportsData?.[questionIndex] ?? null],
        copiedFrom: {
          classId: source.id,
          activityId: sourceActivity.id,
          questionIndex: questionIndex ?? null,
        },
        published: false,
        createdAt: new Date(),
      });
      return true;
    });
    if (copied) await log(req, 'ACTIVITY_CREATED');
    res.json({ copied });
  }),
);
router.post(
  '/classes/:classId/activities/:activityId/publish',
  requireRole('professor'),
  safe(async (req, res) => {
    const options = publishOptions.safeParse(req.body ?? {});
    if (!options.success) throw fail(400, 'Confira a data e o limite em minutos.');
    const opensAt = options.data.opensAt ? new Date(options.data.opensAt) : null;
    if (opensAt && !(opensAt.getTime() > Date.now()))
      throw fail(400, 'Agende para uma data e hora futuras.');
    const ref = classRef(req),
      activity = activityRef(req);
    await db.runTransaction(async (tx) => {
      const doc = await tx.get(ref),
        a = await tx.get(activity);
      authorize(doc.data(), req, true);
      if (a.data()?.published) throw fail(409, 'A atividade já foi publicada ou agendada.');
      if (
        !a.exists ||
        !activitySchema.safeParse({ title: a.data()!.title, questions: a.data()!.questions })
          .success
      )
        throw fail(400, 'Atividade inválida.');
      if (doc.data()!.deleting) throw fail(409, 'Turma indisponível.');
      tx.update(activity, {
        published: true,
        opensAt,
        durationMinutes: options.data.durationMinutes ?? null,
      });
    });
    await log(req, 'ACTIVITY_PUBLISHED');
    res.json({ published: true });
  }),
);
router.get(
  '/classes/:classId/activities/:activityId',
  safe(async (req, res) => {
    const doc = await classRef(req).get();
    authorize(doc.data(), req);
    const ref = activityRef(req),
      a = await ref.get();
    if (!a.exists || (session(req).role === 'aluno' && !a.data()!.published))
      throw fail(404, 'Atividade indisponível.');
    const data = a.data()!;
    const teacher = session(req).role === 'professor';
    if (!teacher && data.opensAt?.toMillis() > Date.now())
      throw fail(409, 'A atividade ainda não está aberta.');
    const own = teacher
      ? null
      : await ref.collection('submissions').doc(session(req).userId!).get();
    const start =
      !teacher && data.durationMinutes && !own?.exists
        ? await ref.collection('starts').doc(session(req).userId!).get()
        : null;
    const deadlineAt = deadline(start?.data()?.startedAt?.toMillis(), data.durationMinutes);
    const locked = Boolean(start && (!deadlineAt || deadlineAt <= Date.now()));
    res.json({
      id: a.id,
      title: data.title,
      published: data.published,
      durationMinutes: data.durationMinutes ?? null,
      deadlineAt,
      locked,
      ...(teacher ? { libraryQuestions: data.libraryQuestions || {} } : {}),
      questions: (locked ? [] : teacher ? data.questions : publicQuestions(data.questions)).map(
        (q: object, i: number) => ({ ...q, sportsData: data.sportsData?.[i] || null }),
      ),
      submission: own?.data() || null,
    });
  }),
);
router.post(
  '/classes/:classId/activities/:activityId/start',
  requireRole('aluno'),
  safe(async (req, res) => {
    const turma = classRef(req);
    const activity = activityRef(req);
    const start = activity.collection('starts').doc(session(req).userId!);
    await db.runTransaction(async (tx) => {
      const [classDoc, activityDoc, existing] = await tx.getAll(turma, activity, start);
      authorize(classDoc.data(), req);
      if (classDoc.data()!.deleting || !activityDoc.data()?.published)
        throw fail(404, 'Atividade indisponível.');
      const data = activityDoc.data()!;
      if (data.opensAt?.toMillis() > Date.now())
        throw fail(409, 'A atividade ainda não está aberta.');
      const ends = deadline(existing.data()?.startedAt?.toMillis(), data.durationMinutes);
      if (ends && ends <= Date.now()) throw fail(409, 'O tempo desta atividade acabou.');
      if (!existing.exists) tx.create(start, { startedAt: new Date() });
    });
    res.sendStatus(204);
  }),
);
router.post(
  '/classes/:classId/activities/:activityId/submit',
  requireRole('aluno'),
  safe(async (req, res) => {
    const parsed = z
      .object({ answers: z.array(z.union([z.string().max(100), z.number().finite()])).max(10) })
      .strict()
      .safeParse(req.body);
    if (!parsed.success) throw fail(400, 'Respostas inválidas.');
    const ref = activityRef(req),
      delivery = ref.collection('submissions').doc(session(req).userId!);
    const result = await db.runTransaction(async (tx) => {
      const turma = await tx.get(classRef(req)),
        a = await tx.get(ref),
        previous = await tx.get(delivery);
      authorize(turma.data(), req);
      if (turma.data()!.deleting || !a.exists || !a.data()!.published)
        throw fail(404, 'Atividade indisponível.');
      if (previous.exists) throw fail(409, 'Você já enviou esta atividade.');
      const data = a.data()!;
      if (data.opensAt?.toMillis() > Date.now())
        throw fail(409, 'A atividade ainda não está aberta.');
      if (data.durationMinutes) {
        const start = await tx.get(ref.collection('starts').doc(session(req).userId!));
        const ends = deadline(start.data()?.startedAt?.toMillis(), data.durationMinutes);
        if (!ends || ends <= Date.now())
          throw fail(409, 'A atividade precisa ser iniciada e entregue dentro do tempo.');
      }
      const result = gradeActivity(
        a.data()!.questions as ActivityContent['questions'],
        parsed.data.answers,
      );
      if (!result) throw fail(400, 'Responda todas as questões com o formato solicitado.');
      tx.create(delivery, { ...result, studentId: session(req).userId, submittedAt: new Date() });
      return result;
    });
    await log(req, 'ACTIVITY_SUBMITTED');
    res.status(201).json(result);
  }),
);
router.get(
  '/classes/:classId/activities/:activityId/results',
  requireRole('professor'),
  safe(async (req, res) => {
    const turma = await classRef(req).get();
    authorize(turma.data(), req, true);
    const a = await activityRef(req).get();
    if (!a.exists) throw fail(404, 'Atividade não encontrada.');
    const rows = [];
    for (const id of turma.data()!.studentIds as string[]) {
      const user = await db.collection('users').doc(id).get();
      if (!user.exists) continue;
      const submission = await a.ref.collection('submissions').doc(id).get();
      rows.push({
        studentId: id,
        name: user.data()!.displayName || user.data()!.username,
        submission: submission.data() || null,
      });
    }
    res.json({
      title: a.data()!.title,
      total: a.data()!.questions.length,
      questions: a.data()!.questions,
      students: rows,
    });
  }),
);
export default router;
