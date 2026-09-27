import type { Request, Response } from 'express';
import { UserModel } from '../models/userModel';
import type { AppSession } from '../types/session';
import { getEffectiveStreak, getStudyDateKey, previousStudyDateKey } from '../utils/streak';

function serializeDate(value: any): string | null {
  if (!value) return null;
  if (typeof value.toDate === 'function') return value.toDate().toISOString();
  if (value instanceof Date) return value.toISOString();
  return String(value);
}

function toJsDate(value: any): Date | null {
  if (!value) return null;
  if (typeof value.toDate === 'function') return value.toDate();
  if (value instanceof Date) return value;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function formatDayLabel(dateKey: string) {
  const [year, month, day] = dateKey.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  const weekday = new Intl.DateTimeFormat('pt-BR', { weekday: 'short', timeZone: 'UTC' })
    .format(date)
    .replace('.', '')
    .toUpperCase();
  return { weekday, day: `${String(day).padStart(2, '0')}/${String(month).padStart(2, '0')}` };
}

export const DashboardController = {
  async dashboard(req: Request, res: Response) {
    try {
      const userId = (req.session as AppSession).userId!;
      const user = await UserModel.findById(userId);
      if (!user) return res.status(404).json({ error: 'Usuário não encontrado.' });

      const challengeHistory = await UserModel.getChallengeHistory(userId, 500);
      const recentChallenges = challengeHistory.slice(0, 10);
      const challengesAnswered = Number(user.challengesAnswered) || 0;
      const challengesCorrect = Number(user.challengesCorrect) || 0;
      const accuracy =
        challengesAnswered > 0 ? Math.round((challengesCorrect / challengesAnswered) * 100) : 0;

      const today = getStudyDateKey();
      const activityKeys = [today];
      for (let i = 1; i < 7; i += 1) activityKeys.unshift(previousStudyDateKey(activityKeys[0]));

      const activityMap = new Map(
        activityKeys.map((key) => [key, { answered: 0, correct: 0, xp: 0 }]),
      );
      const categoryMap = new Map<string, { answered: number; correct: number; xp: number }>();

      for (const attempt of challengeHistory) {
        const attemptDate = toJsDate(attempt.respondidoEm);
        if (attemptDate) {
          const key = getStudyDateKey(attemptDate);
          const activity = activityMap.get(key);
          if (activity) {
            activity.answered += 1;
            if (attempt.acertou) activity.correct += 1;
            activity.xp += Number(attempt.xpGanho) || 0;
          }
        }

        const categoryName = String(attempt.categoria || 'Matemática');
        const category = categoryMap.get(categoryName) || { answered: 0, correct: 0, xp: 0 };
        category.answered += 1;
        if (attempt.acertou) category.correct += 1;
        category.xp += Number(attempt.xpGanho) || 0;
        categoryMap.set(categoryName, category);
      }

      const activity7Days = activityKeys.map((key) => {
        const data = activityMap.get(key)!;
        const labels = formatDayLabel(key);
        return { date: key, ...labels, ...data };
      });

      const attemptsLast7Days = activity7Days.reduce((sum, item) => sum + item.answered, 0);
      const correctLast7Days = activity7Days.reduce((sum, item) => sum + item.correct, 0);
      const xpLast7Days = activity7Days.reduce((sum, item) => sum + item.xp, 0);
      const accuracyLast7Days =
        attemptsLast7Days > 0 ? Math.round((correctLast7Days / attemptsLast7Days) * 100) : 0;

      const categoryPerformance = Array.from(categoryMap.entries())
        .map(([name, stats]) => ({
          name,
          answered: stats.answered,
          correct: stats.correct,
          xp: stats.xp,
          accuracy: stats.answered > 0 ? Math.round((stats.correct / stats.answered) * 100) : 0,
        }))
        .sort((a, b) => b.answered - a.answered || b.accuracy - a.accuracy)
        .slice(0, 6);

      return res.json({
        message: 'Sessão autenticada.',
        user: {
          id: user.id,
          displayName: user.displayName || user.username,
          username: user.username,
          email: user.email,
          xpTotal: Number(user.xpTotal) || 0,
          streak: getEffectiveStreak(Number(user.streak) || 0, user.lastStudyDate || null),
          lastStudyDate: user.lastStudyDate || null,
          challengesAnswered,
          challengesCorrect,
          challengesIncorrect: Math.max(challengesAnswered - challengesCorrect, 0),
          accuracy,
          recentChallenges: recentChallenges.map((attempt) => ({
            id: attempt.id,
            challengeId: attempt.challengeId,
            tipoDesafio: attempt.tipoDesafio,
            categoria: attempt.categoria,
            dificuldade: attempt.dificuldade,
            titulo: attempt.titulo,
            acertou: attempt.acertou,
            usouDica: attempt.usouDica,
            xpGanho: Number(attempt.xpGanho) || 0,
            respondidoEm: serializeDate(attempt.respondidoEm),
          })),
          hasPassword: Boolean(user.passwordHash),
          googleLinked: Boolean(user.googleId),
        },
        dashboard: {
          attemptsLast7Days,
          correctLast7Days,
          accuracyLast7Days,
          xpLast7Days,
          activity7Days,
          categoryPerformance,
          historyAnalyzed: challengeHistory.length,
        },
      });
    } catch (error) {
      console.error('[dashboard]', error);
      return res.status(500).json({ error: 'Não foi possível carregar os dados da sessão.' });
    }
  },
};
