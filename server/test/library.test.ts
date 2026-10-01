import { describe, expect, it } from 'vitest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { Library } from '../src/library.js';
import type { Track } from '../src/types.js';

export const trackFixture = (id: string, patch: Partial<Track> = {}): Track => ({
  id, groupId: 'group-1', takeIndex: 0, title: id, mode: 'simple', operation: 'generate',
  description: 'cinematic sunrise', style: '', lyrics: '', instrumental: false, model: 'chirp-bluejay',
  negativeTags: '', vocalGender: 'auto', styleWeight: 0.5, weirdness: 0.5,
  status: 'queued', progress: 0, stage: 'queued', eta: null, elapsed: null, error: null,
  file: null, coverFile: null, audioUrl: null, imageUrl: null, videoUrl: null,
  upstreamTaskId: `upstream-${id}`, customId: null, duration: 0, format: 'mp3', pointsCost: null,
  pointsRefunded: null, upstreamStatus: null,
  createdAt: new Date().toISOString(), finishedAt: null, ...patch,
});

describe('Library', () => {
  it('loads empty when missing, writes atomically, persists, updates, and reloads', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'library-'));
    const file = path.join(dir, 'library.json');
    const library = new Library(file);
    await library.load();
    expect(library.all()).toEqual([]);
    await library.add(trackFixture('a'));
    await library.add(trackFixture('b'));
    expect(library.all().map((track) => track.id)).toEqual(['b', 'a']);
    await library.update('a', { status: 'done', stage: 'done', progress: 1 });
    expect(library.get('a')).toMatchObject({ status: 'done', stage: 'done', progress: 1 });
    expect(await library.remove('b')).toMatchObject({ id: 'b' });

    const reloaded = new Library(file);
    await reloaded.load();
    expect(reloaded.all().map((track) => track.id)).toEqual(['a']);
    expect(await reloaded.update('missing', {})).toBeUndefined();
    expect((await fs.readdir(dir)).filter((name) => name.endsWith('.tmp'))).toEqual([]);
  });
});
