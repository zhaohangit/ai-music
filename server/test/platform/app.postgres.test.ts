import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { AiAssistantService } from '../../src/platform/ai-service.js';
import { createPlatformApp } from '../../src/platform/app.js';
import { DEFAULT_MUSIC_MODEL_PROFILES } from '../../src/platform/catalog.js';
import type { ModelCrossClient } from '../../src/platform/modelcross-client.js';
import type { MusicService } from '../../src/platform/music-service.js';
import { LocalObjectStorage } from '../../src/platform/object-storage.js';
import { InlinePlatformQueue, PlatformEventBus } from '../../src/platform/queue.js';
import { PlatformRepository } from '../../src/platform/repository.js';
import { SessionManager } from '../../src/platform/session.js';
import { SunoActionsService } from '../../src/platform/suno-actions-service.js';
import { SunoClient } from '../../src/suno.js';
import type { GenerateRequest } from '../../src/types.js';
import {
  claimTestGenerationProviderSubmission,
  isolatedPostgres,
  testConfig,
  type IsolatedPostgres,
} from './helpers.js';

const integration = describe.skipIf(!process.env.TEST_DATABASE_URL);
let postgres: IsolatedPostgres;
let repository: PlatformRepository;
let storage: LocalObjectStorage;
let queue: InlinePlatformQueue;
let events: PlatformEventBus;
let objectsRoot = '';
let app: ReturnType<typeof createPlatformApp>;
let ownerA: ReturnType<typeof request.agent>;
let ownerB: ReturnType<typeof request.agent>;
let suffix = '';
let providerUpload: ReturnType<typeof vi.spyOn>;

const wavFixture = (durationSeconds: number): Buffer => {
  const sampleRate = 8_000;
  const dataBytes = Math.round(durationSeconds * sampleRate);
  const buffer = Buffer.alloc(44 + dataBytes);
  buffer.write('RIFF', 0, 'ascii');
  buffer.writeUInt32LE(36 + dataBytes, 4);
  buffer.write('WAVE', 8, 'ascii');
  buffer.write('fmt ', 12, 'ascii');
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate, 28);
  buffer.writeUInt16LE(1, 32);
  buffer.writeUInt16LE(8, 34);
  buffer.write('data', 36, 'ascii');
  buffer.writeUInt32LE(dataBytes, 40);
  buffer.fill(0x80, 44);
  return buffer;
};

const binaryParser = (response: request.Response, callback: (error: Error | null, body: Buffer) => void) => {
  const chunks: Buffer[] = [];
  response.on('data', (chunk: Buffer) => chunks.push(chunk));
  response.on('end', () => callback(null, Buffer.concat(chunks)));
};

const requestBody: GenerateRequest = {
  mode: 'simple', title: 'Private track', description: 'app integration fixture', style: '', lyrics: '',
  instrumental: true, model: 'chirp-bluejay', negativeTags: '', vocalGender: 'auto',
  styleWeight: 0.65, weirdness: 0.5,
};

integration('platform HTTP API with opaque cookie sessions', () => {
  beforeAll(async () => {
    suffix = randomUUID();
    objectsRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'museflow-app-objects-'));
    const config = testConfig({ OBJECT_STORAGE_LOCAL_DIR: objectsRoot });
    postgres = await isolatedPostgres();
    repository = new PlatformRepository(postgres.database);
    await repository.upsertModelProfiles(DEFAULT_MUSIC_MODEL_PROFILES);
    storage = new LocalObjectStorage(objectsRoot);
    queue = new InlinePlatformQueue();
    await queue.start(async () => undefined);
    events = new PlatformEventBus(config);
    await events.start();
    const modelCross = {
      aiJson: vi.fn(),
      account: vi.fn(() => { throw new Error('development mode must not request a real account'); }),
    } as unknown as ModelCrossClient;
    const sessions = new SessionManager(config, repository, modelCross);
    const ai = new AiAssistantService(config, repository, modelCross, events);
    const music = {
      submit: vi.fn(),
      action: vi.fn(),
    } as unknown as MusicService;
    const suno = new SunoClient('http://127.0.0.1:39999', 'server-managed-provider-token', async () => {
      throw new Error('provider network must not be used by API tests');
    });
    vi.spyOn(suno, 'balance').mockResolvedValue(4321);
    providerUpload = vi.spyOn(suno, 'uploadAudio');
    const sunoActions = new SunoActionsService(config, repository, modelCross, suno, storage, queue, events);
    app = createPlatformApp({
      config, repository, sessions, modelCross, music, sunoActions, ai, storage, queue, events, suno,
      staticDir: null, log: () => undefined,
    });
    ownerA = request.agent(app);
    ownerB = request.agent(app);
  }, 30_000);

  afterAll(async () => {
    await Promise.allSettled([queue?.close(), events?.close(), storage?.close()]);
    await postgres?.close();
    if (objectsRoot) await fs.rm(objectsRoot, { recursive: true, force: true });
  });

  it('sets an HttpOnly opaque session cookie and returns honest unauthenticated/authenticated states', async () => {
    const anonymous = await request(app).get('/api/session');
    expect(anonymous.status).toBe(200);
    expect(anonymous.body).toEqual({ authenticated: false, user: null, account: null });
    expect((await request(app).get('/api/projects')).status).toBe(401);

    const loginA = await ownerA.post('/api/auth/dev-login').send({
      subject: `app-owner-a-${suffix}`, name: 'Owner A', admin: true,
    });
    const loginB = await ownerB.post('/api/auth/dev-login').send({
      subject: `app-owner-b-${suffix}`, name: 'Owner B', admin: false,
    });
    expect(loginA.status).toBe(200);
    expect(loginA.headers['set-cookie']?.[0]).toContain('museflow_session=');
    expect(loginA.headers['set-cookie']?.[0]).toContain('HttpOnly');
    expect(loginA.headers['set-cookie']?.[0]).toContain('SameSite=Lax');
    expect(loginA.body).toMatchObject({
      authenticated: true,
      user: { id: `app-owner-a-${suffix}`, name: 'Owner A', role: 'admin' },
      account: { balance: 1280, availableBalance: 1280, reservedBalance: 0, currency: 'credits' },
      demo: true,
    });
    expect(loginB.body.user.role).toBe('user');
    expect((await ownerA.get('/api/session')).body.user.id).toBe(`app-owner-a-${suffix}`);
    expect((await ownerB.get('/api/session')).body.user.id).toBe(`app-owner-b-${suffix}`);
  });

  it('enforces owner scope on project reads and mutations with cross-user 404', async () => {
    const projectKey = `project-app-${suffix}`;
    const payload = { title: 'A private project', description: 'not shared' };
    const created = await ownerA.post('/api/projects').set('Idempotency-Key', projectKey).send(payload);
    expect(created.status).toBe(201);
    const replay = await ownerA.post('/api/projects').set('Idempotency-Key', projectKey).send(payload);
    expect(replay.status).toBe(200);
    expect(replay.headers['idempotent-replay']).toBe('true');
    expect(replay.body.id).toBe(created.body.id);
    const conflict = await ownerA.post('/api/projects').set('Idempotency-Key', projectKey)
      .send({ ...payload, description: 'changed request' });
    expect(conflict.status).toBe(409);
    expect(conflict.body.error).toContain('different project');
    expect((await ownerA.get('/api/projects')).body).toEqual([expect.objectContaining({
      id: created.body.id, title: 'A private project', trackCount: 0,
    })]);
    expect((await ownerB.get('/api/projects')).body).toEqual([]);
    const foreignDelete = await ownerB.delete(`/api/projects/${created.body.id}`);
    expect(foreignDelete.status).toBe(404);
    expect(foreignDelete.body.error).toBe('project not found');
    expect((await ownerA.get('/api/projects')).body).toHaveLength(1);
  });

  it('serves owner-only media with Range and returns 404 instead of leaking existence cross-user', async () => {
    const subjectA = `app-owner-a-${suffix}`;
    const generation = await repository.createGenerationIntent({
      ownerSubject: subjectA,
      projectId: null,
      operation: 'generate',
      sourceTrackId: null,
      modelProfileId: 'chirp-bluejay',
      idempotencyKey: `app-assets-${suffix}`,
      request: requestBody,
      estimatedCredits: 14,
      priceVersion: 'music-2026-08-v1',
    });
    await claimTestGenerationProviderSubmission(repository, subjectA, generation.intent.id);
    const tracks = await repository.acceptGeneration(
      generation.intent.id, subjectA, [`app-provider-a-${suffix}`, `app-provider-b-${suffix}`],
    );
    const track = tracks[0]!;
    const key = `users/${subjectA}/tracks/${track.id}/audio/original.mp3`;
    const object = await storage.put(key, Buffer.from('0123456789'), 'audio/mpeg');
    await repository.upsertAsset({
      id: randomUUID(), trackId: track.id, ownerSubject: subjectA, kind: 'audio', objectKey: key,
      mimeType: object.mimeType, byteSize: object.byteSize, etag: object.etag, checksumSha256: object.checksumSha256,
    });

    const ranged = await ownerA.get(`/api/tracks/${track.id}/audio`)
      .set('Range', 'bytes=2-5').buffer(true).parse(binaryParser);
    expect(ranged.status).toBe(206);
    expect(ranged.headers['content-range']).toBe('bytes 2-5/10');
    expect(ranged.headers['accept-ranges']).toBe('bytes');
    expect(ranged.headers['content-type']).toContain('audio/mpeg');
    expect(ranged.headers['cache-control']).toBe('private, no-store');
    expect(ranged.headers.vary).toContain('Cookie');
    expect(ranged.headers.vary).toContain('Authorization');
    expect(ranged.body).toEqual(Buffer.from('2345'));

    const invalidRange = await ownerA.get(`/api/tracks/${track.id}/audio`).set('Range', 'bytes=99-100');
    expect(invalidRange.status).toBe(416);
    expect(invalidRange.body).toMatchObject({ error: 'range not satisfiable', requestId: expect.any(String) });

    expect((await ownerB.get(`/api/tracks/${track.id}/audio`)).status).toBe(404);
    expect((await ownerB.delete(`/api/tracks/${track.id}`)).status).toBe(404);
    expect(await repository.getTrack(subjectA, track.id)).not.toBeNull();

    const pendingDelete = await ownerA.delete(`/api/tracks/${track.id}`);
    expect(pendingDelete.status).toBe(409);
    expect(pendingDelete.body.error).toBe('track cannot be deleted until its generation and billing are terminal');
    expect(await repository.getTrack(subjectA, track.id)).not.toBeNull();
    expect(await repository.getAsset(subjectA, track.id, 'audio')).not.toBeNull();
    const rangedAfterConflict = await ownerA.get(`/api/tracks/${track.id}/audio`)
      .set('Range', 'bytes=2-5').buffer(true).parse(binaryParser);
    expect(rangedAfterConflict.status).toBe(206);
    expect(rangedAfterConflict.headers['content-range']).toBe('bytes 2-5/10');
    expect(rangedAfterConflict.body).toEqual(Buffer.from('2345'));

    await repository.finalizeGeneration(generation.intent.id, 'succeeded', 'disabled', 0);
    expect((await ownerB.get(`/api/tracks/${track.id}/audio`)).status).toBe(404);
    expect((await ownerB.delete(`/api/tracks/${track.id}`)).status).toBe(404);
    const ownDelete = await ownerA.delete(`/api/tracks/${track.id}`);
    expect(ownDelete.status).toBe(200);
    expect(ownDelete.body).toEqual({ ok: true, assetCount: 1, remoteTaskMayContinue: true });
    expect((await ownerA.get(`/api/tracks/${track.id}/audio`)).status).toBe(404);
  });

  it('returns stable rate-limit headers and request ids after the content-report quota', async () => {
    for (let index = 0; index < 10; index += 1) {
      const response = await ownerA.post('/api/content/reports').send({
        category: `automated-boundary-${index}`,
        details: 'rate-limit integration coverage',
      });
      expect(response.status).toBe(201);
      expect(response.headers['x-ratelimit-limit']).toBe('10');
      expect(Number(response.headers['x-ratelimit-remaining'])).toBe(9 - index);
    }

    const limited = await ownerA.post('/api/content/reports').send({ category: 'over-limit' });
    expect(limited.status).toBe(429);
    expect(limited.headers['x-ratelimit-limit']).toBe('10');
    expect(limited.headers['x-ratelimit-remaining']).toBe('0');
    expect(Number(limited.headers['retry-after'])).toBeGreaterThan(0);
    expect(limited.body).toMatchObject({
      error: 'request rate limit exceeded',
      retryAfter: expect.any(Number),
      requestId: expect.any(String),
    });
  });

  it('validates multipart reference audio, persists trusted duration, replays idempotently and isolates owners', async () => {
    const temporaryUploads = async () => new Set(
      (await fs.readdir(os.tmpdir())).filter((entry) => entry.startsWith('museflow-audio-') && entry.endsWith('.part')),
    );
    const before = await temporaryUploads();
    const audio = wavFixture(2.25);
    const upload = (agent: ReturnType<typeof request.agent>, key: string, bytes = audio) => agent
      .post('/api/uploads/audio')
      .set('Idempotency-Key', key)
      .field('copyrightConfirmed', 'true')
      .field('copyrightAudio', 'false')
      .attach('audio', bytes, { filename: 'private-reference.wav', contentType: 'audio/wav' });

    const anonymous = await request(app).post('/api/uploads/audio')
      .set('Idempotency-Key', `anonymous-upload-${suffix}`)
      .field('copyrightConfirmed', 'true')
      .attach('audio', audio, { filename: 'anonymous.wav', contentType: 'audio/wav' });
    expect(anonymous.status).toBe(401);

    const missingCopyright = await ownerA.post('/api/uploads/audio')
      .set('Idempotency-Key', `missing-copyright-${suffix}`)
      .attach('audio', audio, { filename: 'missing-copyright.wav', contentType: 'audio/wav' });
    expect(missingCopyright.status).toBe(400);
    expect(missingCopyright.body.error).toContain('copyrightConfirmed=true');

    const damaged = await upload(ownerA, `damaged-upload-${suffix}`, Buffer.concat([
      Buffer.from('RIFF', 'ascii'), Buffer.alloc(4), Buffer.from('WAVE', 'ascii'), Buffer.alloc(32),
    ]));
    expect(damaged.status).toBe(400);
    expect(damaged.body.error).toContain('duration');

    const key = `valid-upload-${suffix}`;
    const created = await upload(ownerA, key);
    expect(created.status).toBe(201);
    expect(created.headers['idempotent-replay']).toBe('false');
    expect(created.body).toMatchObject({
      status: 'ready', originalFilename: 'private-reference.wav', mimeType: 'audio/wav',
      byteSize: audio.length, durationSeconds: 2.25,
      copyrightConfirmed: true, copyrightAudio: false,
    });
    expect(created.body.checksumSha256).toMatch(/^[a-f0-9]{64}$/);

    const replay = await upload(ownerA, key);
    expect(replay.status).toBe(200);
    expect(replay.headers['idempotent-replay']).toBe('true');
    expect(replay.body.id).toBe(created.body.id);
    expect(replay.body.durationSeconds).toBe(2.25);

    expect((await ownerA.get(`/api/uploads/${created.body.id}`)).body).toMatchObject({
      id: created.body.id, durationSeconds: 2.25, status: 'ready',
    });
    expect((await ownerB.get(`/api/uploads/${created.body.id}`)).status).toBe(404);
    expect((await ownerB.delete(`/api/uploads/${created.body.id}`)).status).toBe(404);

    const localProviderAction = await ownerA.post(`/api/uploads/${created.body.id}/actions`)
      .set('Idempotency-Key', `local-storage-action-${suffix}`)
      .send({ action: 'upload', model: 'chirp-bluejay' });
    expect(localProviderAction.status).toBe(409);
    expect(localProviderAction.body.error).toContain('Provider-reachable signed S3 URL');
    expect(providerUpload).not.toHaveBeenCalled();

    const oversized = await upload(ownerA, `oversized-upload-${suffix}`, Buffer.alloc(50 * 1024 * 1024 + 1));
    expect(oversized.status).toBe(413);
    expect(oversized.body.error).toContain('upload size limit');

    expect(await temporaryUploads()).toEqual(before);
    expect((await ownerA.delete(`/api/uploads/${created.body.id}`)).status).toBe(200);
    expect((await ownerA.get(`/api/uploads/${created.body.id}`)).status).toBe(404);
  }, 30_000);

  it('replays AI requests by owner + idempotency key and conflicts on changed payloads', async () => {
    const key = `ai-app-${suffix}`;
    const body = { action: 'prompt.optimize', input: 'a hopeful night-drive chorus' };
    const first = await ownerA.post('/api/ai/assist').set('Idempotency-Key', key).send(body);
    const replay = await ownerA.post('/api/ai/assist').set('Idempotency-Key', key).send(body);
    expect(first.status).toBe(201);
    expect(replay.status).toBe(201);
    expect(replay.body).toEqual(first.body);
    expect(replay.body.original).toBe(body.input);

    const count = await postgres.database.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM ai_assistant_runs
       WHERE owner_subject=$1 AND idempotency_key=$2`,
      [`app-owner-a-${suffix}`, key],
    );
    expect(count.rows[0]?.count).toBe('1');

    const conflict = await ownerA.post('/api/ai/assist').set('Idempotency-Key', key)
      .send({ ...body, input: 'a completely different prompt' });
    expect(conflict.status).toBe(409);
    expect(conflict.body.error).toContain('different AI request');
    expect((await ownerA.post('/api/ai/assist').send(body)).status).toBe(400);

    const accepted = await ownerA.post(`/api/ai/assist/${first.body.id}/accept`)
      .send({ kind: 'prompt', title: 'Accepted prompt' });
    const acceptedReplay = await ownerA.post(`/api/ai/assist/${first.body.id}/accept`)
      .send({ kind: 'prompt', title: 'Accepted prompt' });
    expect(accepted.status).toBe(201);
    expect(acceptedReplay.status).toBe(201);
    expect(acceptedReplay.body).toEqual(accepted.body);
    const changedFieldsReplay = await ownerA.post(`/api/ai/assist/${first.body.id}/accept`)
      .send({ kind: 'prompt', title: 'Accepted prompt', appliedFields: ['title'] });
    expect(changedFieldsReplay.status).toBe(409);
    expect(changedFieldsReplay.body.error).toContain('already accepted with different fields');
    const changedMetadataReplay = await ownerA.post(`/api/ai/assist/${first.body.id}/accept`)
      .send({ kind: 'prompt', title: 'Changed accepted prompt' });
    expect(changedMetadataReplay.status).toBe(409);
    expect(changedMetadataReplay.body.error).toContain('already accepted with different fields');
    expect((await ownerB.post(`/api/ai/assist/${first.body.id}/accept`)
      .send({ kind: 'prompt', title: 'Foreign accept' })).status).toBe(404);
    const revisions = await postgres.database.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM prompt_revisions
       WHERE ai_run_id=$1 AND owner_subject=$2 AND accepted=TRUE`,
      [first.body.id, `app-owner-a-${suffix}`],
    );
    expect(revisions.rows[0]?.count).toBe('1');
    const acceptedFields = await postgres.database.query<{ applied_fields: string[]; accepted_fields: string[] }>(
      `SELECT p.applied_fields,a.accepted_fields
       FROM prompt_revisions p JOIN ai_assistant_runs a ON a.id=p.ai_run_id
       WHERE p.ai_run_id=$1 AND p.owner_subject=$2 AND p.accepted=TRUE`,
      [first.body.id, `app-owner-a-${suffix}`],
    );
    expect(acceptedFields.rows[0]).toEqual({ applied_fields: ['prompt'], accepted_fields: ['prompt'] });

    const foreignProject = await ownerB.post('/api/projects')
      .set('Idempotency-Key', `foreign-ai-project-${suffix}`)
      .send({ title: 'Owner B project' });
    const second = await ownerA.post('/api/ai/assist')
      .set('Idempotency-Key', `ai-app-project-${suffix}`)
      .send({ action: 'lyrics.generate', input: 'a private original song' });
    expect((await ownerA.post(`/api/ai/assist/${second.body.id}/accept`).send({
      kind: 'lyrics', title: 'No cross-owner link', projectId: foreignProject.body.id,
    })).status).toBe(404);
  });

  it('keeps provider secrets centralized and restricts reconcile controls to administrators', async () => {
    const settings = await ownerA.get('/api/settings');
    expect(settings.status).toBe(200);
    expect(settings.body).toMatchObject({
      apiKeySet: true,
      apiBaseUrl: '',
      locked: { apiBaseUrl: true, apiKey: true },
      platformManaged: true,
      managedBy: 'modelcross',
      providerConfigured: true,
    });
    expect(settings.body.adminUrl).toBeNull();
    expect(JSON.stringify(settings.body)).not.toContain('server-managed-provider-token');
    const userSettings = await ownerB.get('/api/settings');
    expect(userSettings.body).toMatchObject({ apiBaseUrl: '', adminUrl: null, platformManaged: true });
    expect(JSON.stringify(userSettings.body)).not.toContain('127.0.0.1:3000');
    expect((await ownerA.put('/api/settings').send({ apiKey: 'browser-secret' })).status).toBe(403);
    expect((await ownerB.post('/api/settings/test')).status).toBe(403);
    const connection = await ownerA.post('/api/settings/test');
    expect(connection.status).toBe(200);
    expect(connection.body).toMatchObject({
      ok: true,
      provider: 'MXAPI / Suno',
      configured: true,
      reachable: true,
      authenticated: true,
      balance: 4321,
      errorCode: null,
    });
    expect(connection.body.checkedAt).toEqual(expect.any(String));
    expect((await ownerB.post('/api/admin/reconcile')).status).toBe(403);
    expect((await ownerA.post('/api/admin/reconcile')).status).toBe(202);
  });

  it('revokes the server-side session on logout', async () => {
    expect((await ownerB.post('/api/auth/logout')).status).toBe(200);
    const after = await ownerB.get('/api/session');
    expect(after.body).toEqual({ authenticated: false, user: null, account: null });
    expect((await ownerB.get('/api/projects')).status).toBe(401);
  });
});
