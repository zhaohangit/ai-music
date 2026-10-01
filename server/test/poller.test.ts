import { afterEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { Library } from '../src/library.js';
import { downloadRemoteAsset, SunoPoller } from '../src/poller.js';
import { SunoClient } from '../src/suno.js';
import type { Track } from '../src/types.js';
import { startFakeMxapi, type FakeMxapi, type FakeMxapiOptions, type FakeTaskSpec } from './fakeMxapi.js';

const track = (id: string, upstreamTaskId: string | null, patch: Partial<Track> = {}): Track => ({
  id, groupId: 'group', takeIndex: 0, title: id, mode: 'simple', operation: 'generate',
  description: 'dreamy', style: '', lyrics: '', instrumental: false, model: 'chirp-bluejay',
  negativeTags: '', vocalGender: 'auto', styleWeight: 0.5, weirdness: 0.5,
  status: 'queued', progress: 0, stage: 'queued', eta: null, elapsed: null, error: null,
  file: null, coverFile: null, audioUrl: null, imageUrl: null, videoUrl: null,
  upstreamTaskId, customId: null, duration: 0, format: 'mp3', pointsCost: null,
  pointsRefunded: null, upstreamStatus: null,
  createdAt: new Date().toISOString(), finishedAt: null, ...patch,
});

let fake: FakeMxapi | null = null;
const temporaryDirectories: string[] = [];
afterEach(async () => {
  await fake?.close();
  fake = null;
  await Promise.all(temporaryDirectories.splice(0).map((directory) => fs.rm(directory, { recursive: true, force: true })));
});

async function setup(
  taskSpecs: FakeTaskSpec[] | undefined = undefined,
  options: FakeMxapiOptions = {},
  missingTaskThreshold = 60,
) {
  fake = await startFakeMxapi({ ...options, tasks: taskSpecs });
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'poller-'));
  temporaryDirectories.push(root);
  const library = new Library(path.join(root, 'library.json'));
  await library.load();
  const client = new SunoClient(fake.url, 'test-key');
  const logs: string[] = [];
  const poller = new SunoPoller(library, client, path.join(root, 'tracks'), path.join(root, 'covers'), {
    intervalMs: 10, missingTaskThreshold, log: (message) => logs.push(message),
  });
  return { root, library, client, poller, logs };
}

describe('downloadRemoteAsset', () => {
  it('downloads MP3 and cover bytes to final atomic names without leaving .part files', async () => {
    fake = await startFakeMxapi();
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'asset-'));
    temporaryDirectories.push(root);
    expect(await downloadRemoteAsset(`${fake.url}/assets/task-a.mp3`, root, 'local-a', 'audio')).toBe('local-a.mp3');
    expect(await downloadRemoteAsset(`${fake.url}/assets/task-a.jpg`, root, 'local-a', 'cover')).toBe('local-a.jpg');
    expect((await fs.readFile(path.join(root, 'local-a.mp3'), 'utf8'))).toContain('ID3-fake');
    expect((await fs.readdir(root)).some((name) => name.endsWith('.part'))).toBe(false);
  });

  it('rejects unsupported URLs and oversized responses and cleans temporary files', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'asset-limit-'));
    temporaryDirectories.push(root);
    await expect(downloadRemoteAsset('file:///tmp/audio.mp3', root, 'x', 'audio')).rejects.toThrow(/http/);
    const fetchImpl = (async () => new Response(Buffer.alloc(20), { headers: { 'content-type': 'audio/mpeg' } })) as typeof fetch;
    await expect(downloadRemoteAsset('https://assets.invalid/a.mp3', root, 'x', 'audio', { fetchImpl, maxBytes: 10 })).rejects.toThrow(/larger/);
    expect((await fs.readdir(root)).some((name) => name.endsWith('.part'))).toBe(false);
  });

  it('identifies Provider asset downloads without forwarding credentials', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'asset-auth-'));
    temporaryDirectories.push(root);
    const fetchImpl = vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) => {
      const headers = new Headers(init?.headers);
      expect(headers.get('user-agent')).toBe('MuseFlow/1.0');
      expect(headers.get('authorization')).toBeNull();
      return new Response(Buffer.from('ID3-authenticated'), {
        status: 200,
        headers: { 'content-type': 'audio/mpeg' },
      });
    }) as unknown as typeof fetch;
    await expect(downloadRemoteAsset('https://assets.invalid/a.mp3', root, 'x', 'audio', {
      fetchImpl,
    })).resolves.toBe('x.mp3');
  });
});

describe('SunoPoller', () => {
  it('maps queued/running/completed, matches reversed batch results by task id, and materializes MP3/covers', async () => {
    const { root, library, poller } = await setup();
    await library.addMany([track('local-a', 'task-a'), track('local-b', 'task-b', { takeIndex: 1 })]);

    await poller.tick();
    expect(library.get('local-a')).toMatchObject({ status: 'queued', stage: 'queued', progress: 0 });
    expect(library.get('local-b')?.upstreamTaskId).toBe('task-b');
    await poller.tick();
    expect(library.get('local-a')).toMatchObject({ status: 'running', stage: 'generating', progress: 0.5 });
    await poller.tick();

    expect(library.get('local-a')).toMatchObject({
      status: 'done', stage: 'done', progress: 1, customId: 'clip-a', file: 'local-a.mp3', coverFile: 'local-a.jpg', pointsCost: 12,
    });
    expect(library.get('local-b')).toMatchObject({
      status: 'done', customId: 'clip-b', file: 'local-b.mp3', coverFile: 'local-b.jpg', pointsCost: 13,
    });
    expect(await fs.readFile(path.join(root, 'tracks', 'local-a.mp3'), 'utf8')).toContain('task-a');
    expect(await fs.readFile(path.join(root, 'covers', 'local-b.jpg'), 'utf8')).toContain('task-b');
  });

  it('records explicit provider failure as a terminal error without downloading assets', async () => {
    const { library, poller } = await setup([{ taskId: 'failed', statuses: [4], error: 'moderated', refunded: true }]);
    await library.add(track('local-failed', 'failed'));
    await poller.tick();
    expect(library.get('local-failed')).toMatchObject({ status: 'error', stage: 'error', progress: 1, error: 'moderated', pointsRefunded: true });
    expect(library.get('local-failed')?.finishedAt).toBeTruthy();
  });

  it('keeps remote URL fallbacks and marks a successfully generated song done when caching fails', async () => {
    const { library, poller, logs } = await setup([{ taskId: 'remote', customId: 'clip-remote', statuses: [3] }], { assetHttpStatus: 503 });
    await library.add(track('local-remote', 'remote'));
    await poller.tick();
    expect(library.get('local-remote')).toMatchObject({
      status: 'done', stage: 'done', file: null, coverFile: null, customId: 'clip-remote',
      audioUrl: expect.stringContaining('/assets/remote.mp3'), imageUrl: expect.stringContaining('/assets/remote.jpg'),
    });
    expect(logs.join('\n')).toMatch(/audio cache failed/);
    expect(logs.join('\n')).toMatch(/cover cache failed/);
  });

  it('keeps completed tasks in downloading when MXAPI has not published an audio URL yet', async () => {
    const { library, poller } = await setup([{ taskId: 'not-ready', statuses: [3], omitAudio: true }]);
    await library.add(track('local-not-ready', 'not-ready'));
    await poller.tick();
    expect(library.get('local-not-ready')).toMatchObject({ status: 'running', stage: 'downloading', file: null, audioUrl: null });
  });

  it('keeps tasks recoverable across transient polling errors instead of marking them failed', async () => {
    const { library, poller, logs } = await setup(undefined, { pollHttpStatus: 503 });
    await library.add(track('local-retry', 'task-a'));
    await poller.tick();
    expect(library.get('local-retry')).toMatchObject({ status: 'queued', stage: 'queued', error: null });
    expect(logs.join('\n')).toMatch(/poll failed/);
  });

  it('fails one permanently missing task after bounded successful queries while its sibling completes', async () => {
    const { library, poller } = await setup([
      { taskId: 'present', statuses: [3] },
    ], {}, 2);
    await library.addMany([
      track('local-present', 'present'),
      track('local-missing', 'never-returned', { takeIndex: 1 }),
    ]);

    await poller.tick();
    expect(library.get('local-present')).toMatchObject({ status: 'done' });
    expect(library.get('local-missing')).toMatchObject({ status: 'queued', error: null });
    await poller.tick();
    expect(library.get('local-missing')).toMatchObject({
      status: 'error', stage: 'error', upstreamStatus: 'missing',
      error: expect.stringContaining('absent from 2 consecutive queries'),
    });
  });

  it('never regresses generating or downloading tracks when the provider returns stale states', async () => {
    const { library, poller } = await setup([
      { taskId: 'stale-pending', statuses: [1] },
      { taskId: 'stale-processing', statuses: [2] },
    ]);
    await library.addMany([
      track('local-generating', 'stale-pending', { status: 'running', stage: 'generating', progress: 0.7 }),
      track('local-downloading', 'stale-processing', { status: 'running', stage: 'downloading', progress: 1 }),
    ]);

    await poller.tick();
    expect(library.get('local-generating')).toMatchObject({ status: 'running', stage: 'generating', progress: 0.7 });
    expect(library.get('local-downloading')).toMatchObject({ status: 'running', stage: 'downloading', progress: 1 });
  });

  it('recovers submitted jobs after restart and only fails interrupted submissions without upstream ids', async () => {
    const { library, poller } = await setup([{ taskId: 'existing', statuses: [3] }]);
    await library.addMany([
      track('submitted', 'existing', { status: 'running', stage: 'generating' }),
      track('interrupted', null, { status: 'queued', stage: 'queued' }),
      track('finished', 'old', { status: 'done', stage: 'done', progress: 1 }),
    ]);
    expect(await poller.recover()).toEqual({ resumed: 1, failed: 1 });
    expect(library.get('interrupted')).toMatchObject({ status: 'error', stage: 'error', error: expect.stringContaining('interrupted') });
    expect(library.get('submitted')).toMatchObject({ status: 'running', upstreamTaskId: 'existing' });
    await poller.tick();
    expect(library.get('submitted')).toMatchObject({ status: 'done', customId: 'clip-existing' });
    expect(fake!.requests.filter((request) => request.method === 'POST')).toEqual([]);
  });
});
