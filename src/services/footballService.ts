import axios from 'axios';
import { z } from 'zod';

const fixtureSchema = z.object({
  fixture: z.object({
    status: z.object({ short: z.string() }),
  }),
  teams: z.object({
    home: z.object({ id: z.number(), name: z.string() }),
    away: z.object({ id: z.number(), name: z.string() }),
  }),
  goals: z.object({
    home: z.number().int().nonnegative().nullable(),
    away: z.number().int().nonnegative().nullable(),
  }),
});

const fixturesResponseSchema = z.object({
  response: z.array(fixtureSchema),
});

type Fixture = z.infer<typeof fixtureSchema>;

export type TeamMatch = {
  adversario: string;
  gols: number;
  golsAdversario: number;
};

type CacheEntry = {
  fixtures: Fixture[];
  fetchedAt: number;
};

const CACHE_FRESH_MS = 5 * 60 * 1000;
const CACHE_STALE_MS = 24 * 60 * 60 * 1000;
const REQUEST_TIMEOUT_MS = 5_000;

const cacheByQuery = new Map<string, CacheEntry>();
const requestsByQuery = new Map<string, Promise<Fixture[]>>();

function isRetryable(error: unknown): boolean {
  if (!axios.isAxiosError(error)) return false;
  return !error.response || error.response.status >= 500;
}

async function fetchFixtures(teamId: number, season: number): Promise<Fixture[]> {
  let lastError: unknown;

  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const response = await axios.get('https://v3.football.api-sports.io/fixtures', {
        params: { team: teamId, season },
        headers: { 'x-apisports-key': process.env.API_FOOTBALL_KEY },
        timeout: REQUEST_TIMEOUT_MS,
        maxContentLength: 2 * 1024 * 1024,
      });
      const fixtures = fixturesResponseSchema.parse(response.data).response;
      if (normalizeRecentMatches(fixtures, teamId).length < 5)
        throw new Error('A API não retornou cinco partidas finalizadas válidas.');
      return fixtures;
    } catch (error) {
      lastError = error;
      if (!isRetryable(error)) break;
    }
  }

  throw lastError;
}

export function normalizeRecentMatches(fixtures: Fixture[], teamId: number): TeamMatch[] {
  return fixtures
    .filter(
      (fixture) =>
        fixture.fixture.status.short === 'FT' &&
        (fixture.teams.home.id === teamId || fixture.teams.away.id === teamId) &&
        fixture.goals.home !== null &&
        fixture.goals.away !== null,
    )
    .slice(-5)
    .map((fixture) => {
      const homeTeam = fixture.teams.home.id === teamId;
      return {
        adversario: homeTeam ? fixture.teams.away.name : fixture.teams.home.name,
        gols: Number(homeTeam ? fixture.goals.home : fixture.goals.away) || 0,
        golsAdversario: Number(homeTeam ? fixture.goals.away : fixture.goals.home) || 0,
      };
    });
}

export async function getRecentTeamMatches(teamId: number, season: number): Promise<TeamMatch[]> {
  const now = Date.now();
  const cacheKey = `${teamId}:${season}`;
  const cache = cacheByQuery.get(cacheKey);

  if (cache && now - cache.fetchedAt < CACHE_FRESH_MS) {
    return normalizeRecentMatches(cache.fixtures, teamId);
  }

  try {
    let pending = requestsByQuery.get(cacheKey);
    if (!pending) {
      pending = fetchFixtures(teamId, season).finally(() => requestsByQuery.delete(cacheKey));
      requestsByQuery.set(cacheKey, pending);
    }
    const fixtures = await pending;
    cacheByQuery.set(cacheKey, { fixtures, fetchedAt: now });
    return normalizeRecentMatches(fixtures, teamId);
  } catch {
    if (cache && now - cache.fetchedAt < CACHE_STALE_MS) {
      console.warn('[api-football] Serviço indisponível. Usando dados recentes em cache.');
      return normalizeRecentMatches(cache.fixtures, teamId);
    }
    throw Object.assign(new Error('Os dados esportivos estão indisponíveis no momento.'), {
      statusCode: 503,
    });
  }
}
