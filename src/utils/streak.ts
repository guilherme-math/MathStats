const DEFAULT_TIME_ZONE = process.env.APP_TIMEZONE || 'America/Sao_Paulo';

export function getStudyDateKey(date = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: DEFAULT_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);

  const values: Record<string, string> = {};
  for (const part of parts) values[part.type] = part.value;

  return `${values.year}-${values.month}-${values.day}`;
}

export function previousStudyDateKey(dateKey: string): string {
  const [year, month, day] = dateKey.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() - 1);
  return date.toISOString().slice(0, 10);
}

export function getEffectiveStreak(streak: number, lastStudyDate?: string | null): number {
  const current = Math.max(0, Number(streak) || 0);
  if (!lastStudyDate) return 0;

  const today = getStudyDateKey();
  const yesterday = previousStudyDateKey(today);

  return lastStudyDate === today || lastStudyDate === yesterday ? current : 0;
}

export function registerStudyDay(streak: number, lastStudyDate?: string | null) {
  const today = getStudyDateKey();
  const yesterday = previousStudyDateKey(today);
  const current = Math.max(0, Number(streak) || 0);

  if (lastStudyDate === today) {
    return { streak: Math.max(current, 1), lastStudyDate: today, changed: false };
  }

  if (lastStudyDate === yesterday) {
    return { streak: current + 1, lastStudyDate: today, changed: true };
  }

  return { streak: 1, lastStudyDate: today, changed: true };
}