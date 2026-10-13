export interface LearningLevel {
  number: number;
  name: string;
  currentXp: number;
  nextLevelXp: number | null;
  progress: number;
}

const LEVELS = [
  { name: 'Iniciante', minimumXp: 0 },
  { name: 'Aprendiz', minimumXp: 100 },
  { name: 'Analista', minimumXp: 300 },
  { name: 'Estrategista', minimumXp: 700 },
  { name: 'Especialista', minimumXp: 1500 },
] as const;

export function getLearningLevel(value: unknown): LearningLevel {
  const currentXp = Math.max(0, Number(value) || 0);
  let index = 0;

  for (let candidate = 1; candidate < LEVELS.length; candidate += 1) {
    if (currentXp < LEVELS[candidate].minimumXp) break;
    index = candidate;
  }

  const current = LEVELS[index];
  const next = LEVELS[index + 1];
  const progress = next
    ? Math.round(((currentXp - current.minimumXp) / (next.minimumXp - current.minimumXp)) * 100)
    : 100;

  return {
    number: index + 1,
    name: current.name,
    currentXp,
    nextLevelXp: next?.minimumXp ?? null,
    progress: Math.min(100, Math.max(0, progress)),
  };
}
