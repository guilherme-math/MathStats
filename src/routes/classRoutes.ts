import { Router, type Request, type Response } from 'express';
import { randomBytes } from 'node:crypto';
import { FieldValue } from 'firebase-admin/firestore';
import { z } from 'zod';
import { db } from '../config/firebase';
import { requireRole } from '../middlewares/auth';
import { classLimiter, teacherFootballLimiter } from '../middlewares/security';
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
      classes: snap.docs.map((d) => ({
        id: d.id,
        name: d.data().name,
        students: d.data().studentIds.length,
      })),
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
  '/classes/join',
  requireRole('aluno'),
  safe(async (req, res) => {
    const parsed = z
      .object({ code: z.string().regex(/^[a-f0-9]{32}$/) })
      .strict()
      .safeParse(req.body);
    if (!parsed.success) throw fail(400, 'Informe um código de convite válido.');
    const classId = await db.runTransaction(async (tx) => {
      const invite = await tx.get(db.collection('classInvites').doc(parsed.data.code));
      if (!invite.exists) throw fail(404, 'Convite não encontrado.');
      const ref = classes.doc(invite.data()!.classId);
      const doc = await tx.get(ref);
      const user = await tx.get(db.collection('users').doc(session(req).userId!));
      if (!doc.exists || doc.data()!.deleting || !user.exists || user.data()?.deleting)
        throw fail(404, 'Turma indisponível.');
      if (
        doc.data()!.studentIds.length >= 300 &&
        !doc.data()!.studentIds.includes(session(req).userId)
      )
        throw fail(409, 'Esta turma atingiu o limite de participantes.');
      tx.update(ref, { studentIds: FieldValue.arrayUnion(session(req).userId) });
      return ref.id;
    });
    await log(req, 'CLASS_JOINED');
    res.json({ id: classId });
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
        total: a.questions.length,
        submitted: own?.exists || false,
      });
    }
    res.json({
      id: doc.id,
      name: data!.name,
      students: data!.studentIds.length,
      ...(teacher ? { inviteCode: data!.inviteCode } : {}),
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
router.post(
  '/classes/:classId/activities/:activityId/publish',
  requireRole('professor'),
  safe(async (req, res) => {
    const ref = classRef(req),
      activity = activityRef(req);
    await db.runTransaction(async (tx) => {
      const doc = await tx.get(ref),
        a = await tx.get(activity);
      authorize(doc.data(), req, true);
      if (
        !a.exists ||
        !activitySchema.safeParse({ title: a.data()!.title, questions: a.data()!.questions })
          .success
      )
        throw fail(400, 'Atividade inválida.');
      if (doc.data()!.deleting) throw fail(409, 'Turma indisponível.');
      tx.update(activity, { published: true });
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
    const own = teacher
      ? null
      : await ref.collection('submissions').doc(session(req).userId!).get();
    res.json({
      id: a.id,
      title: data.title,
      published: data.published,
      questions: (teacher ? data.questions : publicQuestions(data.questions)).map(
        (q: object, i: number) => ({ ...q, sportsData: data.sportsData?.[i] || null }),
      ),
      submission: own?.data() || null,
    });
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
