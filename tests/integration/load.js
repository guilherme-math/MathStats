const { performance } = require('node:perf_hooks');
const { setTimeout: delay } = require('node:timers/promises');

async function measureStage(origin, accounts, durationMs) {
  const intervalMs = 1000;
  const paths = ['/api/dashboard', '/api/classes'];
  const requests = [];
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
            const start = performance.now();
            let status = 'network';
            try {
              const response = await fetch(origin + path, {
                headers: { Cookie: cookie },
                signal: AbortSignal.timeout(5000),
              });
              await response.arrayBuffer();
              status = response.status;
            } catch {}
            requests.push({ status, ms: performance.now() - start });
          }),
        );
        next = Math.max(next + intervalMs, performance.now());
      }
    }),
  );

  const elapsed = performance.now() - began;
  const latencies = requests.map(({ ms }) => ms).sort((a, b) => a - b);
  const p95 = latencies[Math.ceil(latencies.length * 0.95) - 1];
  const statuses = {};
  for (const { status } of requests) statuses[status] = (statuses[status] || 0) + 1;
  const successful = statuses[200] || 0;
  return {
    users: accounts.length,
    requests: requests.length,
    rpm: Math.round((requests.length * 60000) / elapsed),
    successfulRpm: Math.round((successful * 60000) / elapsed),
    p95Ms: Math.round(p95),
    errorPercent: Number((((requests.length - successful) * 100) / requests.length).toFixed(2)),
    statuses,
  };
}

module.exports = { measureStage };
