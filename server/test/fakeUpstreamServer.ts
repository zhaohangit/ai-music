import { startFakeMxapi } from './fakeMxapi.js';

// Standalone deterministic MXAPI double for `npm run dev:fake`; it never calls an external
// service and each generated task advances pending -> processing -> completed as it is polled.
const port = Number(process.env.FAKE_PORT ?? 7999);
const fake = await startFakeMxapi({
  port,
  requiredBearer: process.env.FAKE_API_KEY || 'local-fake-key',
  balance: Number(process.env.FAKE_BALANCE ?? 2048),
  uniqueTaskBatches: true,
  validateRequests: true,
  validMedia: true,
});

console.log(`fake MXAPI server listening on ${fake.url} (POST /api/v2/music/generate)`);
