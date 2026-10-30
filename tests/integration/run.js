const { spawn } = require('node:child_process');
const { MongoMemoryServer } = require('mongodb-memory-server');
const fs = require('node:fs');
const path = require('node:path');

async function main() {
  const temp = path.resolve('tmp/integration-java');
  fs.mkdirSync(temp, { recursive: true });
  const mongo = await MongoMemoryServer.create({ binary: { version: '7.0.14' } });
  try {
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
        'tests/integration/firebase.json',
        'node --test --test-force-exit --test-concurrency=1 tests/integration/http.test.js',
      ],
      {
        stdio: 'inherit',
        env: {
          ...process.env,
          JAVA_TOOL_OPTIONS: `${process.env.JAVA_TOOL_OPTIONS || ''} -Djdk.net.unixdomain.tmpdir="${temp}"`,
          MONGODB_URI: mongo.getUri(),
          MONGODB_DB: 'mathstats_integration',
          NODE_ENV: 'test',
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
    await mongo.stop();
  }
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
