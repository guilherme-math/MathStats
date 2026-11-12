const { initializeApp } = require('firebase-admin/app');

process.env.NODE_ENV = 'test';
process.env.SESSION_SECRET ||= 'test-only-session-secret';
process.env.ENCRYPTION_KEY ||= '0'.repeat(64);
process.env.FIRESTORE_EMULATOR_HOST ||= '127.0.0.1:1';
initializeApp({ projectId: 'demo-mathstats-integration' });
