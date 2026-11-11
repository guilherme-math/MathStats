import { z } from 'zod';

const text = (max: number) => z.string().trim().min(1).max(max);
const question = z.discriminatedUnion('type', [
  z
    .object({
      type: z.literal('numeric'),
      footballToken: z.string().max(12000).optional(),
      prompt: text(800),
      explanation: text(800),
      answer: z.number().finite(),
    })
    .strict(),
  z
    .object({
      type: z.literal('choice'),
      footballToken: z.string().max(12000).optional(),
      prompt: text(800),
      explanation: text(800),
      options: z.array(text(180)).min(2).max(5),
      answer: z.number().int().min(0).max(4),
    })
    .strict()
    .refine((q) => q.answer < q.options.length && new Set(q.options).size === q.options.length),
]);

export const activitySchema = z
  .object({ title: text(100), questions: z.array(question).min(1).max(10) })
  .strict();
export type ActivityContent = z.infer<typeof activitySchema>;

export function publicQuestions(questions: ActivityContent['questions']) {
  return questions.map((q) =>
    q.type === 'choice'
      ? { type: q.type, prompt: q.prompt, options: q.options }
      : { type: q.type, prompt: q.prompt },
  );
}

export function gradeActivity(questions: ActivityContent['questions'], answers: unknown) {
  if (!Array.isArray(answers) || answers.length !== questions.length) return null;
  const result = [];
  for (let i = 0; i < questions.length; i++) {
    const q = questions[i];
    const raw = answers[i];
    let value: number;
    if (q.type === 'numeric') {
      if (typeof raw !== 'string' || !/^-?\d+(?:[.,]\d+)?$/.test(raw.trim())) return null;
      value = Number(raw.trim().replace(',', '.'));
    } else {
      if (typeof raw !== 'number' || !Number.isInteger(raw) || raw < 0 || raw >= q.options.length)
        return null;
      value = raw;
    }
    if (!Number.isFinite(value)) return null;
    const correct =
      q.type === 'numeric'
        ? Math.abs(value - q.answer) <= 1e-9 * Math.max(1, Math.abs(q.answer))
        : value === q.answer;
    result.push({ value, correct, answer: q.answer, explanation: q.explanation });
  }
  return {
    answers: result,
    correct: result.filter((r) => r.correct).length,
    total: questions.length,
  };
}
