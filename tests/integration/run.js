const { spawn } = require('node:child_process');
const { MongoMemoryServer } = require('mongodb-memory-server');
const fs = require('node:fs');
const path = require('node:path');
const net = require('node:net');
const { randomUUID } = require('node:crypto');

function freePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const port = server.address().port;
      server.close((error) => (error ? reject(error) : resolve(port)));
    });
  });
}

async function main() {
  const temp = path.resolve('tmp/integration-java');
  fs.mkdirSync(temp, { recursive: true });
  const mongo = await MongoMemoryServer.create({ binary: { version: '7.0.14' } });
  const configPath = path.join(temp, 'firebase-' + randomUUID() + '.json');
  try {
    const config = JSON.parse(fs.readFileSync('tests/integration/firebase.json', 'utf8'));
    config.emulators.firestore.port = await freePort();
    config.emulators.hub = { port: await freePort() };
    config.emulators.logging = { port: await freePort() };
    fs.writeFileSync(configPath, JSON.stringify(config));
    const child = spawn(
      process.execPath,
      [
        require.resolve('firebase-tools/lib/bin/firebase'),
        'emulators:exec',
        '--only',
        'firestore',
        '--project',
        'demo-mathstats-integration',
        '--config',
        configPath,
        process.argv.includes('--load')
          ? 'node --test --test-force-exit --test-concurrency=1 --test-name-pattern=carga tests/integration/http.test.js'
          : 'node --test --test-force-exit --test-concurrency=1 tests/integration/http.test.js',
      ],
      {
        stdio: 'inherit',
        env: {
          ...process.env,
          JAVA_TOOL_OPTIONS: `${process.env.JAVA_TOOL_OPTIONS || ''} -Djdk.net.unixdomain.tmpdir="${temp}"`,
          MONGODB_URI: mongo.getUri(),
          MONGODB_DB: 'mathstats_integration',
          NODE_ENV: 'test',
          MATHSTATS_LOAD: process.argv.includes('--load') ? '1' : '0',
          SESSION_SECRET: 'integration-only-session-secret',
          ENCRYPTION_KEY: '0'.repeat(64),
          FIREBASE_SERVICE_ACCOUNT_BASE64: '',
          FIREBASE_SERVICE_ACCOUNT_JSON: '',
          GOOGLE_CLIENT_ID: '',
          FIREBASE_KEY_PATH: '__integration_does_not_use_credentials__',
        },
      },
    );
    process.exitCode = await new Promise((resolve, reject) => {
      child.once('error', reject);
      child.once('exit', (code) => resolve(code ?? 1));
    });
  } finally {
    fs.rmSync(configPath, { force: true });
    await mongo.stop();
  }
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
