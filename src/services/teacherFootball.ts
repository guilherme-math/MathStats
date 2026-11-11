import { createHmac, timingSafeEqual, randomInt } from 'node:crypto';
import { z } from 'zod';
import { getRecentTeamMatches, getTeamPlayers } from './footballService';

import { footballTeams } from '../config/footballTeams';
export const teacherTeams = footballTeams;
export const footballQuery = z
  .object({
    teamId: z.coerce
      .number()
      .int()
      .refine((id) => teacherTeams.some((t) => t.id === id)),
    context: z.enum(['team', 'player']),
    count: z.coerce
      .number()
      .pipe(z.union([z.literal(3), z.literal(5)]))
      .optional(),
  })
  .strict();
const snapshotSchema = z.object({
  source: z.literal('API-Football'),
  team: z.string().min(1).max(100),
  season: z.literal(2024),
  context: z.enum(['team', 'player']),
  collectedAt: z.string(),
  matches: z
    .array(
      z.object({
        adversario: z.string(),
        gols: z.number().int().nonnegative(),
        golsAdversario: z.number().int().nonnegative(),
      }),
    )
    .max(5)
    .optional(),
  player: z
    .object({
      name: z.string(),
      games: z.number().int().positive(),
      goals: z.number().int().nonnegative(),
    })
    .optional(),
});
export type FootballSnapshot = z.infer<typeof snapshotSchema>;
const secret = () => {
  if (!process.env.SESSION_SECRET) throw new Error('SESSION_SECRET ausente.');
  return process.env.SESSION_SECRET;
};
function signature(value: string) {
  return createHmac('sha256', secret())
    .update('teacher-football-v1:' + value)
    .digest();
}
export function signFootballSnapshot(owner: string, data: FootballSnapshot) {
  const payload = Buffer.from(
    JSON.stringify({ owner, expires: Date.now() + 60 * 60 * 1000, data }),
  ).toString('base64url');
  return payload + '.' + signature(payload).toString('base64url');
}
export function readFootballSnapshot(token: string, owner: string): FootballSnapshot {
  const [payload, mac, extra] = token.split('.');
  if (!payload || !mac || extra) throw new Error('Dados de futebol inválidos.');
  const expected = signature(payload),
    received = Buffer.from(mac, 'base64url');
  if (received.length !== expected.length || !timingSafeEqual(received, expected))
    throw new Error('Dados de futebol inválidos.');
  const data = JSON.parse(Buffer.from(payload, 'base64url').toString());
  if (data.owner !== owner || typeof data.expires !== 'number' || data.expires < Date.now())
    throw new Error('Consulte os dados de futebol novamente.');
  return snapshotSchema.parse(data.data);
}
export async function footballDatasets(query: z.infer<typeof footballQuery>, owner: string) {
  const team = teacherTeams.find((t) => t.id === query.teamId)!;
  const base = {
    source: 'API-Football' as const,
    team: team.name,
    season: 2024 as const,
    context: query.context,
    collectedAt: new Date().toISOString(),
  };
  if (query.context === 'team') {
    const matches = (await getRecentTeamMatches(team.id, 2024)).slice(-(query.count || 5));
    const data = { ...base, matches };
    return [
      {
        label: matches.length + ' partidas disponíveis de ' + team.name,
        data,
        token: signFootballSnapshot(owner, data),
      },
    ];
  }
  return (await getTeamPlayers(team.id, 2024)).map((player) => {
    const data = {
      ...base,
      player: { name: player.name, games: player.games, goals: player.goals },
    };
    return {
      label: player.name + ' · ' + player.goals + ' gols em ' + player.games + ' jogos',
      data,
      token: signFootballSnapshot(owner, data),
    };
  });
}
export const footballModelSchema = z
  .object({
    token: z.string().max(12000),
    model: z.enum(['mean', 'sum', 'balance', 'percentage']),
    format: z.enum(['numeric', 'choice']),
  })
  .strict();
export function footballQuestion(
  data: FootballSnapshot,
  model: z.infer<typeof footballModelSchema>['model'],
  format: 'numeric' | 'choice',
) {
  const matches = data.matches || [];
  const goals = data.player?.goals ?? matches.reduce((s, m) => s + m.gols, 0);
  const games = data.player?.games ?? matches.length;
  const conceded = matches.reduce((s, m) => s + m.golsAdversario, 0);
  const subject = data.player ? data.player.name + ' (' + data.team + ')' : data.team;
  if (!games || (data.context === 'player' && !['mean', 'sum'].includes(model)))
    throw new Error('Modelo incompatível com os dados selecionados.');
  const fmt = (n: number) => n.toLocaleString('pt-BR', { maximumFractionDigits: 2 });
  let answer: number, prompt: string, explanation: string;
  if (model === 'mean') {
    answer = Number((goals / games).toFixed(2));
    prompt = `Qual foi a média de gols de ${subject} no conjunto de dados apresentado? Arredonde para duas casas decimais quando necessário.`;
    explanation = `Divida ${goals} gols por ${games} jogos: ${goals} ÷ ${games} = ${fmt(answer)} gol(s) por jogo.`;
  } else if (model === 'sum') {
    answer = goals;
    prompt = `Quantos gols ${subject} marcou ao todo no conjunto de dados apresentado?`;
    explanation = data.player
      ? `As estatísticas de ${subject} registram ${goals} gols.`
      : `Some os gols marcados: ${matches.map((m) => m.gols).join(' + ')} = ${goals}.`;
  } else if (model === 'balance') {
    answer = goals - conceded;
    prompt = `Qual foi o saldo de gols de ${subject} nas partidas apresentadas?`;
    explanation = `Subtraia os gols sofridos dos marcados: ${goals} − ${conceded} = ${answer}.`;
  } else {
    const scored = matches.filter((m) => m.gols > 0).length;
    answer = Number(((scored / games) * 100).toFixed(2));
    prompt = `Em qual porcentagem das partidas apresentadas ${subject} marcou pelo menos um gol? Informe apenas o número e arredonde para duas casas decimais quando necessário.`;
    explanation = `O time marcou em ${scored} de ${games} partidas. Calcule ${scored} ÷ ${games} × 100 = ${fmt(answer)}%.`;
  }
  if (format === 'numeric') return { type: 'numeric' as const, prompt, answer, explanation };
  const index = randomInt(4),
    values = [answer, answer + 1, answer + 2, answer + 3].map((n) => fmt(Number(n.toFixed(2))));
  const options = [...values.slice(4 - index), ...values.slice(0, 4 - index)];
  return { type: 'choice' as const, prompt, answer: index, explanation, options };
}
