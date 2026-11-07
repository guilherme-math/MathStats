export const trailLengths = { diagnostico: 5, facil: 10, media: 10, avancada: 10 } as const;
export type TrailId = keyof typeof trailLengths;
export type TrailProgress = Partial<
  Record<TrailId, Record<string, { correct: boolean; xp: number }>>
>;

export function isTrailId(value: unknown): value is TrailId {
  return typeof value === 'string' && Object.hasOwn(trailLengths, value);
}

export function summarizeTrail(progress: TrailProgress | undefined, trail: TrailId) {
  const positions = Array.from({ length: trailLengths[trail] }, (_, index) => index + 1);
  const answers = progress?.[trail] ?? {};
  const answered = positions.filter((position) => Object.hasOwn(answers, position));
  return {
    answered,
    correct: answered.filter((position) => answers[position].correct).length,
    xp: answered.reduce((sum, position) => sum + answers[position].xp, 0),
    completed: answered.length === positions.length,
    next: positions.find((position) => !answered.includes(position)) ?? null,
  };
}
