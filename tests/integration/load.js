const { performance } = require('node:perf_hooks');
const { setTimeout: delay } = require('node:timers/promises');

const intervalMs = 5000;

function loadOptions(env = process.env) {
  const levels = (env.MATHSTATS_RPM_LEVELS ?? '30,60,120').split(',').map(Number);
  const seconds = Number(env.MATHSTATS_RPM_SECONDS ?? 180);
  if (
    !levels.every(
      (value, index) =>
        Number.isInteger(value) &&
        value >= 1 &&
        value <= 300 &&
        (index === 0 || value > levels[index - 1]),
    ) ||
    !Number.isInteger(seconds) ||
    seconds < 5 ||
    seconds > 300
  ) {
    throw new Error('Informe níveis crescentes de 1 a 300 alunos e etapas de 5 a 300 segundos.');
  }
  return { levels, durationMs: seconds * 1000 };
}

async function measureRequest(origin, path, cookie, body) {
  const started = performance.now();
  let status = 'network';
  try {
    const response = await fetch(origin + path, {
      method: body === undefined ? 'GET' : 'POST',
      headers:
        body === undefined
          ? { Cookie: cookie }
          : { Cookie: cookie, 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(10_000),
    });
    await response.arrayBuffer();
    status = response.status;
  } catch {}
  return { status, ms: performance.now() - started };
}

function summarize(requests, successfulStatus) {
  const latencies = requests.map(({ ms }) => ms).sort((a, b) => a - b);
  const statuses = {};
  for (const { status } of requests) statuses[status] = (statuses[status] || 0) + 1;
  const successful = statuses[successfulStatus] || 0;
  return {
    requests: requests.length,
    successful,
    p95Ms: Math.round(latencies[Math.ceil(latencies.length * 0.95) - 1]),
    errorPercent: Number((((requests.length - successful) * 100) / requests.length).toFixed(2)),
    statuses,
  };
}

async function measureStage(origin, accounts, durationMs) {
  const paths = ['/api/dashboard', '/api/classes'];
  const requests = Object.fromEntries(paths.map((path) => [path, []]));
  const began = performance.now();
  const deadline = began + durationMs;

  await Promise.all(
    accounts.map(async ({ cookie }, index) => {
      let next = began + (intervalMs * index) / accounts.length;
      while (next < deadline) {
        if (next > performance.now()) await delay(next - performance.now());
        if (performance.now() >= deadline) break;
        await Promise.all(
          paths.map(async (path) => {
            requests[path].push(await measureRequest(origin, path, cookie));
          }),
        );
        next = Math.max(next + intervalMs, performance.now());
      }
    }),
  );

  const elapsed = Math.max(durationMs, performance.now() - began);
  const stats = summarize(Object.values(requests).flat(), 200);
  return {
    scenario: 'reads',
    users: accounts.length,
    seconds: Number((elapsed / 1000).toFixed(2)),
    rpm: Math.round((stats.requests * 60000) / elapsed),
    successfulRpm: Math.round((stats.successful * 60000) / elapsed),
    ...stats,
    byRoute: Object.fromEntries(paths.map((path) => [path, summarize(requests[path], 200)])),
  };
}

async function measureSubmissions(origin, path, accounts) {
  const began = performance.now();
  const requests = await Promise.all(
    accounts.map(({ cookie }) => measureRequest(origin, path, cookie, { answers: ['2'] })),
  );
  return {
    scenario: 'submission-burst',
    users: accounts.length,
    completedInMs: Math.round(performance.now() - began),
    ...summarize(requests, 201),
  };
}

module.exports = { loadOptions, measureStage, measureSubmissions };
