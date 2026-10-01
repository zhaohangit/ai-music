import { afterEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createApp } from '../src/app.js';
import { JsonStore, Library } from '../src/library.js';
import { SunoPoller } from '../src/poller.js';
import { SettingsStore, type EnvOverrides } from '../src/settings.js';
import { SunoClient } from '../src/suno.js';
import type { Template, Track } from '../src/types.js';
import { startFakeMxapi, type FakeMxapi, type FakeMxapiOptions } from './fakeMxapi.js';

let fake: FakeMxapi | null = null;
const temporaryDirectories: string[] = [];
afterEach(async () => {
  await fake?.close();
  fake = null;
  await Promise.all(temporaryDirectories.splice(0).map((directory) => fs.rm(directory, { recursive: true, force: true })));
});

async function setup(fakeOptions: FakeMxapiOptions = {}, editable = false, breakLibraryWrites = false) {
  fake = await startFakeMxapi(fakeOptions);
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'app-suno-'));
  temporaryDirectories.push(root);
  const libraryParent = path.join(root, 'library-store');
  const library = new Library(path.join(libraryParent, 'library.json'));
  const templates = new JsonStore<Template>(path.join(root, 'templates.json'));
  await Promise.all([library.load(), templates.load()]);
  if (breakLibraryWrites) await fs.writeFile(libraryParent, 'not-a-directory');
  const env: EnvOverrides = editable
    ? { apiBaseUrl: null, apiKey: null }
    : { apiBaseUrl: fake.url, apiKey: 'test-key' };
  const settings = new SettingsStore(path.join(root, 'settings.json'), env);
  await settings.load();
  if (editable) await settings.update({ apiBaseUrl: fake.url, apiKey: 'test-key' });
  const effective = settings.effective();
  const client = new SunoClient(effective.apiBaseUrl, effective.apiKey);
  const tracksDir = path.join(root, 'tracks');
  const coversDir = path.join(root, 'covers');
  const poller = new SunoPoller(library, client, tracksDir, coversDir, { intervalMs: 10, log: () => {} });
  const app = createApp({ library, templates, settings, client, poller, tracksDir, coversDir, log: () => {} });
  return { app, root, library, templates, settings, client, poller, tracksDir, coversDir };
}

const simpleRequest = {
  mode: 'simple', title: 'Night Drive', description: 'cinematic synth pop', instrumental: false,
  model: 'chirp-bluejay', negativeTags: 'metal', vocalGender: 'f', styleWeight: 0.7, weirdness: 0.3,
};

const binaryParser = (response: request.Response, callback: (error: Error | null, body: Buffer) => void) => {
  const chunks: Buffer[] = [];
  response.on('data', (chunk: Buffer) => chunks.push(chunk));
  response.on('end', () => callback(null, Buffer.concat(chunks)));
};

describe('MXAPI application routes', () => {
  it('reports the fixed health contract, balance, models, task counts, and bearer-authenticated reachability', async () => {
    const { app } = await setup({ requiredBearer: 'test-key', balance: 987 });
    const health = await request(app).get('/api/health');
    expect(health.body).toMatchObject({
      provider: 'mxapi-suno', configured: true, active: 0, queued: 0,
      upstreamReachable: true, ready: true, balance: 987,
    });
    expect(health.body.models).toContain('chirp-bluejay');
    expect(fake!.requests.at(-1)).toMatchObject({ path: '/api/v2/points/balance', auth: 'Bearer test-key' });
    expect((await request(app).get('/api/health')).body.balance).toBe(987);
    expect(fake!.requests.filter((entry) => entry.path === '/api/v2/points/balance')).toHaveLength(1);
    expect((await request(app).get('/api/points')).body).toEqual({ balance: 987 });
  });

  it('submits simple mode once and persists exactly two distinct local tracks for the two upstream tasks', async () => {
    const { app, library } = await setup({ requiredBearer: 'test-key' });
    const response = await request(app).post('/api/generate').send(simpleRequest);
    expect(response.status).toBe(201);
    expect(response.body).toHaveLength(2);
    const [first, second] = response.body as Track[];
    expect(first.id).not.toBe(second.id);
    expect(first.groupId).toBe(second.groupId);
    expect([first.takeIndex, second.takeIndex]).toEqual([0, 1]);
    expect([first.upstreamTaskId, second.upstreamTaskId]).toEqual(['task-a', 'task-b']);
    expect(first.id).not.toBe(first.upstreamTaskId);
    expect(first).toMatchObject({ operation: 'generate', format: 'mp3', status: 'queued', customId: null });
    expect(library.all()).toHaveLength(2);
    const submits = fake!.requests.filter((entry) => entry.path === '/api/v2/music/generate');
    expect(submits).toHaveLength(1);
    expect(submits[0]).toMatchObject({ auth: 'Bearer test-key', body: {
      gpt_description_prompt: 'cinematic synth pop', mv: 'chirp-bluejay', negative_tags: 'metal',
      metadata: { vocal_gender: 'f', control_sliders: { style_weight: 0.7, weirdness_constraint: 0.3 } },
    } });
  });

  it('returns already-paid remote tasks instead of encouraging a retry when local persistence fails', async () => {
    const { app, library, poller } = await setup({}, false, true);
    const wake = vi.spyOn(poller, 'wake');
    const response = await request(app).post('/api/generate').send(simpleRequest);

    expect(response.status).toBe(201);
    expect(response.headers['x-museflow-warning']).toBe('local-persistence-failed');
    expect(response.body).toHaveLength(2);
    expect(library.all()).toHaveLength(2);
    expect(wake).toHaveBeenCalledOnce();
    expect(fake!.requests.filter((entry) => entry.path === '/api/v2/music/generate')).toHaveLength(1);
  });

  it('maps custom mode separately and rejects invalid requests before upstream submission', async () => {
    const { app } = await setup();
    const response = await request(app).post('/api/generate').send({
      mode: 'custom', title: 'Custom', style: 'dream pop', lyrics: '[Verse]\nhello', instrumental: false,
      model: 'chirp-fenix', vocalGender: 'auto', styleWeight: 0.5, weirdness: 0.4,
    });
    expect(response.status).toBe(201);
    expect(fake!.requests.at(-1)?.body).toMatchObject({ prompt: '[Verse]\nhello', tags: 'dream pop', mv: 'chirp-fenix' });
    expect(fake!.requests.at(-1)?.body).not.toHaveProperty('gpt_description_prompt');
    const before = fake!.requests.length;
    expect((await request(app).post('/api/generate').send({ mode: 'simple' })).status).toBe(400);
    expect((await request(app).post('/api/generate').send({ ...simpleRequest, model: 'V5_5' })).status).toBe(400);
    expect((await request(app).post('/api/generate').send({ ...simpleRequest, description: 'x'.repeat(1001) })).status).toBe(400);
    expect(fake!.requests).toHaveLength(before);
  });

  it.each([
    ['extend', 'chirp-fenix', { action: 'extend', continueAt: 77 }, '/api/v2/music/generate', { task: 'extend', continue_clip_id: 'clip-source', continue_at: 77 }],
    ['cover', 'chirp-fenix', { action: 'cover' }, '/api/v2/music/generate', { task: 'cover', cover_clip_id: 'clip-source' }],
    ['remaster', 'chirp-crow', { action: 'remaster', variation: 'high' }, '/api/v2/music/upsample', { clip_id: 'clip-source', model_name: 'chirp-carp', variation_category: 'high' }],
  ] as const)('creates a fixed two-track %s action batch using customId', async (operation, sourceModel, action, endpoint, upstreamBody) => {
    const { app, library } = await setup();
    const generated = await request(app).post('/api/generate').send({ ...simpleRequest, model: sourceModel });
    const source = generated.body[0] as Track;
    await library.update(source.id, { status: 'done', stage: 'done', customId: 'clip-source', duration: 120 });
    fake!.requests.length = 0;

    const response = await request(app).post(`/api/tracks/${source.id}/actions`).send(action);
    expect(response.status).toBe(201);
    expect(response.body).toHaveLength(2);
    expect(response.body[0]).toMatchObject({ operation, sourceTrackId: source.id, upstreamTaskId: 'task-a', status: 'queued' });
    expect(response.body[1]).toMatchObject({ operation, sourceTrackId: source.id, upstreamTaskId: 'task-b' });
    expect(fake!.requests).toHaveLength(1);
    expect(fake!.requests[0]).toMatchObject({ path: endpoint, body: upstreamBody });
  });

  it('submits V5.5 remaster through the documented chirp-flounder model', async () => {
    const { app, library } = await setup();
    const generated = await request(app).post('/api/generate').send({ ...simpleRequest, model: 'chirp-fenix' });
    const source = generated.body[0] as Track;
    await library.update(source.id, { status: 'done', stage: 'done', customId: 'clip-source', duration: 120 });
    fake!.requests.length = 0;

    const response = await request(app).post(`/api/tracks/${source.id}/actions`).send({
      action: 'remaster', variation: 'high',
    });

    expect(response.status).toBe(201);
    expect(response.body).toHaveLength(2);
    expect(fake!.requests).toHaveLength(1);
    expect(fake!.requests[0]).toMatchObject({
      path: '/api/v2/music/upsample',
      body: { clip_id: 'clip-source', model_name: 'chirp-flounder', variation_category: 'high' },
    });
  });

  it('rejects actions on unknown or unfinished tracks', async () => {
    const { app } = await setup();
    expect((await request(app).post('/api/tracks/missing/actions').send({ action: 'cover' })).status).toBe(404);
    const generated = await request(app).post('/api/generate').send(simpleRequest);
    expect((await request(app).post(`/api/tracks/${generated.body[0].id}/actions`).send({ action: 'cover' })).status).toBe(400);
  });

  it('serves local MP3/cover files and proxies retained audio, cover, and video fallbacks', async () => {
    const { app, library, tracksDir, coversDir } = await setup();
    const generated = await request(app).post('/api/generate').send(simpleRequest);
    const local = generated.body[0] as Track;
    await fs.mkdir(tracksDir, { recursive: true });
    await fs.mkdir(coversDir, { recursive: true });
    await fs.writeFile(path.join(tracksDir, `${local.id}.mp3`), 'LOCAL-MP3');
    await fs.writeFile(path.join(coversDir, `${local.id}.jpg`), 'LOCAL-JPEG');
    await library.update(local.id, { file: `${local.id}.mp3`, coverFile: `${local.id}.jpg` });
    const localAudio = await request(app).get(`/api/tracks/${local.id}/audio?download`).buffer(true).parse(binaryParser);
    expect(localAudio.status).toBe(200);
    expect(localAudio.headers['content-type']).toContain('audio/mpeg');
    expect(localAudio.headers['content-disposition']).toContain('.mp3');
    expect((localAudio.body as Buffer).toString()).toBe('LOCAL-MP3');
    const localCover = await request(app).get(`/api/tracks/${local.id}/cover`).buffer(true).parse(binaryParser);
    expect((localCover.body as Buffer).toString()).toBe('LOCAL-JPEG');

    const remote = generated.body[1] as Track;
    await library.update(remote.id, {
      audioUrl: `${fake!.url}/assets/task-b.mp3`, imageUrl: `${fake!.url}/assets/task-b.jpg`, videoUrl: `${fake!.url}/assets/task-b.mp4`,
    });
    const audio = await request(app).get(`/api/tracks/${remote.id}/audio`).buffer(true).parse(binaryParser);
    const cover = await request(app).get(`/api/tracks/${remote.id}/cover`).buffer(true).parse(binaryParser);
    const video = await request(app).get(`/api/tracks/${remote.id}/video`).buffer(true).parse(binaryParser);
    expect((audio.body as Buffer).toString()).toContain('ID3-fake-task-b');
    expect((cover.body as Buffer).toString()).toContain('JPEG-fake-task-b');
    expect((video.body as Buffer).toString()).toContain('MP4-fake-task-b');
  });

  it('deletes local assets and truthfully reports that an in-flight remote task may continue', async () => {
    const { app, library, tracksDir, coversDir } = await setup();
    const generated = await request(app).post('/api/generate').send(simpleRequest);
    const item = generated.body[0] as Track;
    await fs.mkdir(tracksDir, { recursive: true });
    await fs.mkdir(coversDir, { recursive: true });
    await fs.writeFile(path.join(tracksDir, `${item.id}.mp3`), 'x');
    await fs.writeFile(path.join(coversDir, `${item.id}.jpg`), 'x');
    await library.update(item.id, { file: `${item.id}.mp3`, coverFile: `${item.id}.jpg` });
    const response = await request(app).delete(`/api/tracks/${item.id}`);
    expect(response.body).toEqual({ ok: true, remoteTaskMayContinue: true });
    expect(library.get(item.id)).toBeUndefined();
    await expect(fs.access(path.join(tracksDir, `${item.id}.mp3`))).rejects.toThrow();
    await expect(fs.access(path.join(coversDir, `${item.id}.jpg`))).rejects.toThrow();
  });

  it('never leaks env-locked or stored API keys through settings endpoints', async () => {
    const locked = await setup({ requiredBearer: 'test-key' });
    const publicSettings = await request(locked.app).get('/api/settings');
    expect(publicSettings.body).toMatchObject({
      apiBaseUrl: fake!.url, apiKeySet: true, locked: { apiBaseUrl: true, apiKey: true },
      source: { apiBaseUrl: 'env', apiKey: 'env' },
    });
    expect(JSON.stringify(publicSettings.body)).not.toContain('test-key');
    expect((await request(locked.app).put('/api/settings').send({ apiKey: 'new-key' })).status).toBe(400);
  });

  it('updates editable settings, reconfigures the client, tests candidates without saving, and does not return keys', async () => {
    const { app, client } = await setup({}, true);
    expect((await request(app).get('/api/health')).body.ready).toBe(true);
    expect(fake!.requests.filter((entry) => entry.path === '/api/v2/points/balance')).toHaveLength(1);
    const put = await request(app).put('/api/settings').send({ apiBaseUrl: `${fake!.url}/`, apiKey: 'replacement' });
    expect(put.body).toMatchObject({ apiBaseUrl: fake!.url, apiKeySet: true, source: { apiKey: 'settings' } });
    expect(JSON.stringify(put.body)).not.toContain('replacement');
    expect(client.url).toBe(fake!.url);
    expect((await request(app).get('/api/health')).body.ready).toBe(true);
    expect(fake!.requests.filter((entry) => entry.path === '/api/v2/points/balance')).toHaveLength(2);
    const test = await request(app).post('/api/settings/test').send({ apiBaseUrl: fake!.url, apiKey: 'candidate' });
    expect(test.body).toMatchObject({ ok: true, apiBaseUrl: fake!.url, balance: 2048 });
    expect(JSON.stringify(test.body)).not.toContain('candidate');
  });

  it('rejects provider setting changes while submitted music tasks are active', async () => {
    const { app, settings } = await setup({}, true);
    const generated = await request(app).post('/api/generate').send(simpleRequest);
    expect(generated.status).toBe(201);
    const before = settings.effective();

    const response = await request(app).put('/api/settings').send({ apiKey: 'replacement' });
    expect(response.status).toBe(400);
    expect(response.body.error).toMatch(/tasks are active/);
    expect(settings.effective()).toEqual(before);
  });

  it('creates, upserts, lists, and deletes Suno templates', async () => {
    const { app } = await setup();
    const created = await request(app).post('/api/templates').send({ name: 'Dream', ...simpleRequest });
    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({ name: 'Dream', mode: 'simple', description: 'cinematic synth pop' });
    const updated = await request(app).post('/api/templates').send({ name: 'dream', ...simpleRequest, description: 'updated' });
    expect(updated.status).toBe(200);
    expect(updated.body.id).toBe(created.body.id);
    expect((await request(app).get('/api/templates')).body).toHaveLength(1);
    expect((await request(app).delete(`/api/templates/${created.body.id}`)).status).toBe(200);
    expect((await request(app).delete(`/api/templates/${created.body.id}`)).status).toBe(404);
  });
});
