const test = require('node:test');
const assert = require('node:assert/strict');
const axiosModule = require('axios');
const axios = axiosModule.default || axiosModule;
const {
  getRecentTeamMatches,
  normalizeRecentMatches,
} = require('../dist/services/footballService');

function createFixture({
  status = 'FT',
  teamId = 127,
  opponentId = 900,
  opponent = 'Adversário',
  home = true,
  teamGoals = 2,
  opponentGoals = 1,
} = {}) {
  return {
    fixture: { status: { short: status } },
    teams: {
      home: home ? { id: teamId, name: 'MathStats FC' } : { id: opponentId, name: opponent },
      away: home ? { id: opponentId, name: opponent } : { id: teamId, name: 'MathStats FC' },
    },
    goals: {
      home: home ? teamGoals : opponentGoals,
      away: home ? opponentGoals : teamGoals,
    },
  };
}

function createApiResponse(teamId) {
  return {
    data: {
      response: Array.from({ length: 5 }, (_, index) =>
        createFixture({
          teamId,
          opponentId: 1_000 + index,
          opponent: `Adversário ${index + 1}`,
          teamGoals: index,
        }),
      ),
    },
  };
}

test('normaliza partidas em casa e fora pela perspectiva do time consultado', () => {
  // Arrange
  const fixtures = [
    createFixture({ opponent: 'Time A', teamGoals: 3, opponentGoals: 1 }),
    createFixture({ opponent: 'Time B', home: false, teamGoals: 2, opponentGoals: 4 }),
  ];

  // Act
  const matches = normalizeRecentMatches(fixtures, 127);

  // Assert
  assert.deepEqual(matches, [
    { adversario: 'Time A', gols: 3, golsAdversario: 1 },
    { adversario: 'Time B', gols: 2, golsAdversario: 4 },
  ]);
});

test('ignora partidas não finalizadas, sem placar ou sem o time consultado', () => {
  // Arrange
  const fixtures = [
    createFixture({ status: 'NS' }),
    { ...createFixture(), goals: { home: null, away: null } },
    createFixture({ teamId: 300, opponentId: 301 }),
  ];

  // Act
  const matches = normalizeRecentMatches(fixtures, 127);

  // Assert
  assert.deepEqual(matches, []);
});

test('mantém somente as cinco partidas finalizadas mais recentes', () => {
  // Arrange
  const fixtures = Array.from({ length: 6 }, (_, index) =>
    createFixture({ opponentId: 200 + index, opponent: `Time ${index + 1}` }),
  );

  // Act
  const matches = normalizeRecentMatches(fixtures, 127);

  // Assert
  assert.equal(matches.length, 5);
  assert.equal(matches[0].adversario, 'Time 2');
  assert.equal(matches[4].adversario, 'Time 6');
});

test('reutiliza o cache fresco sem chamar novamente a API nem emitir aviso', async (t) => {
  // Arrange
  const teamId = 710;
  const getMock = t.mock.method(axios, 'get', async () => createApiResponse(teamId));
  const warnMock = t.mock.method(console, 'warn', () => {});

  // Act
  const firstResult = await getRecentTeamMatches(teamId, 2026);
  const cachedResult = await getRecentTeamMatches(teamId, 2026);

  // Assert
  assert.deepEqual(cachedResult, firstResult);
  assert.equal(getMock.mock.callCount(), 1);
  assert.equal(warnMock.mock.callCount(), 0);
});

test('informa indisponibilidade após duas tentativas sem cache, com tipo e mensagem', async (t) => {
  // Arrange
  const getMock = t.mock.method(axios, 'get', async () => {
    throw Object.assign(new Error('timeout'), { isAxiosError: true });
  });
  const warnMock = t.mock.method(console, 'warn', () => {});

  // Act
  await assert.rejects(getRecentTeamMatches(711, 2026), (error) => {
    // Assert
    assert.equal(error.constructor, Error);
    assert.equal(error.message, 'Os dados esportivos estão indisponíveis no momento.');
    assert.equal(error.statusCode, 503);
    return true;
  });

  assert.equal(getMock.mock.callCount(), 2);
  assert.equal(warnMock.mock.callCount(), 0);
});
