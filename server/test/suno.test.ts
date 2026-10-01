import { afterEach, describe, expect, it } from 'vitest';
import type { GenerateRequest, SoundGenerateRequest } from '../src/types.js';
import {
  mapGeneratePayload,
  mapSoundPayload,
  normalizeProgress,
  normalizeSunoTask,
  remasterModelFor,
  SUNO_SPEED_MULTIPLIERS,
  SunoClient,
  SunoError,
} from '../src/suno.js';
import { startFakeMxapi, type FakeMxapi } from './fakeMxapi.js';

const input = (patch: Partial<GenerateRequest> = {}): GenerateRequest => ({
  mode: 'simple', title: 'Midnight', description: 'dreamy neon drive', style: '', lyrics: '',
  instrumental: false, model: 'chirp-bluejay', negativeTags: '', vocalGender: 'auto',
  styleWeight: 0.6, weirdness: 0.2, ...patch,
});

const soundInput = (patch: Partial<SoundGenerateRequest> = {}): SoundGenerateRequest => ({
  kind: 'sound', mode: 'custom', title: 'Rain', description: '', style: 'rain on a glass roof', lyrics: '',
  instrumental: true, model: 'chirp-crow', negativeTags: '', vocalGender: 'auto', styleWeight: 0.5,
  weirdness: 0.5, soundTempo: null, soundKey: '', soundLoop: null, ...patch,
});

let fake: FakeMxapi | null = null;
afterEach(async () => {
  await fake?.close();
  fake = null;
});

describe('MXAPI payload mapping', () => {
  it('maps simple mode without leaking custom-only prompt/tags fields', () => {
    const payload = mapGeneratePayload(input({ negativeTags: 'metal', vocalGender: 'f' }));
    expect(payload).toEqual({
      mv: 'chirp-bluejay',
      title: 'Midnight',
      make_instrumental: false,
      negative_tags: 'metal',
      gpt_description_prompt: 'dreamy neon drive',
      metadata: {
        create_mode: 'simple',
        vocal_gender: 'f',
        control_sliders: { style_weight: 0.6, weirdness_constraint: 0.2 },
        can_control_sliders: ['style_weight', 'weirdness_constraint'],
      },
    });
    expect(payload).not.toHaveProperty('task');
    expect(payload).not.toHaveProperty('prompt');
    expect(payload).not.toHaveProperty('tags');
  });

  it('maps custom mode lyrics, tags, instrumental, and omits auto vocal gender', () => {
    const payload = mapGeneratePayload(input({
      mode: 'custom', description: '', style: 'alt pop', lyrics: '[Verse]\nhello', instrumental: true,
    }));
    expect(payload).toMatchObject({
      prompt: '[Verse]\nhello', tags: 'alt pop', make_instrumental: true,
      metadata: {
        create_mode: 'custom',
        can_control_sliders: ['style_weight', 'weirdness_constraint'],
      },
    });
    expect(payload).not.toHaveProperty('gpt_description_prompt');
    expect(payload.metadata).not.toHaveProperty('vocal_gender');
  });

  it.each([
    ['generate', undefined],
    ['extend', { operation: 'extend' as const, clipId: 'clip-1', continueAt: 41.5 }],
    ['cover', { operation: 'cover' as const, clipId: 'clip-1' }],
    ['upload_extend', { operation: 'upload_extend' as const, clipId: 'uploaded-clip', continueAt: 12.5 }],
  ])('never maps vocal gender for instrumental %s requests', (_operation, options) => {
    const payload = mapGeneratePayload(input({ instrumental: true, vocalGender: 'f' }), options);
    expect(payload.make_instrumental).toBe(true);
    expect(payload.metadata).not.toHaveProperty('vocal_gender');
  });

  it('maps extend and cover with the completed clip custom id', () => {
    expect(mapGeneratePayload(input(), { operation: 'extend', clipId: 'clip-1', continueAt: 41.5 })).toMatchObject({
      task: 'extend', continue_clip_id: 'clip-1', continue_at: 41.5,
    });
    expect(mapGeneratePayload(input(), { operation: 'cover', clipId: 'clip-1' })).toMatchObject({
      task: 'cover', cover_clip_id: 'clip-1',
    });
    expect(() => mapGeneratePayload(input(), { operation: 'extend', clipId: 'clip-1' })).toThrow(/continueAt/);
    expect(() => mapGeneratePayload(input(), { operation: 'cover' })).toThrow(/clip id/);
  });

  it('maps the documented upload_extend task and audio_weight metadata', () => {
    expect(mapGeneratePayload(input(), {
      operation: 'upload_extend', clipId: 'uploaded-clip', continueAt: 12.5, audioWeight: 0.8,
    })).toEqual(expect.objectContaining({
      task: 'upload_extend', continue_clip_id: 'uploaded-clip', continue_at: 12.5,
      metadata: expect.objectContaining({
        control_sliders: { style_weight: 0.6, weirdness_constraint: 0.2, audio_weight: 0.8 },
        can_control_sliders: ['style_weight', 'weirdness_constraint', 'audio_weight'],
      }),
    }));
    expect(mapGeneratePayload(input(), {
      operation: 'upload_extend', clipId: 'uploaded-clip', continueAt: 12.5,
    })).not.toHaveProperty('metadata.control_sliders.audio_weight');
    expect(() => mapGeneratePayload(input(), {
      operation: 'upload_extend', clipId: 'uploaded-clip', continueAt: 12.5, audioWeight: Number.NaN,
    })).toThrow(/between 0 and 1/);
    expect(() => mapGeneratePayload(input(), { audioWeight: 0.8 })).toThrow(/only supported/);
  });

  it('does not publish V4/V3 control sliders and rejects legacy audioWeight', () => {
    for (const model of ['chirp-v4', 'chirp-v3-5', 'chirp-v3-0']) {
      const payload = mapGeneratePayload(input({ model, negativeTags: 'spoken word', vocalGender: 'f' }));
      expect(payload).not.toHaveProperty('metadata');
      expect(payload).toHaveProperty('negative_tags', 'spoken word');
    }
    expect(() => mapGeneratePayload(input({ model: 'chirp-v4' }), {
      operation: 'cover', clipId: 'legacy-clip', audioWeight: 0.5,
    })).toThrow(/V4.5 or newer/);
  });

  it('maps the exact sound fields and preserves optional omission', () => {
    expect(mapSoundPayload(soundInput({ soundTempo: 99, soundKey: ' D ', soundLoop: true }))).toEqual({
      title: 'Rain', tags: 'rain on a glass roof', mv: 'chirp-crow', tempo: 99, key: 'D', loop: true,
    });
    const minimal = mapSoundPayload(soundInput({ model: 'chirp-fenix' }));
    expect(minimal).toEqual({ title: 'Rain', tags: 'rain on a glass roof', mv: 'chirp-fenix' });
    expect(minimal).not.toHaveProperty('make_instrumental');
    expect(minimal).not.toHaveProperty('metadata');
    expect(minimal).not.toHaveProperty('prompt');
    expect(() => mapSoundPayload(soundInput({ model: 'chirp-bluejay' }))).toThrow(/chirp-crow or chirp-fenix/);
    expect(() => mapSoundPayload(soundInput({ soundTempo: Number.NaN }))).toThrow(/finite/);
  });
});

describe('task normalization', () => {
  it.each([
    [1, 'queued', 'queued'],
    [2, 'running', 'generating'],
    [3, 'running', 'downloading'],
    [4, 'error', 'error'],
  ] as const)('maps provider status %s to %s/%s', (provider, status, stage) => {
    expect(normalizeSunoTask({ task_id: 't', result: { status: provider } })).toMatchObject({ taskId: 't', status, stage });
  });

  it('normalizes fractional, percent-number, and percent-string progress', () => {
    expect(normalizeProgress(0.4)).toBe(0.4);
    expect(normalizeProgress(40)).toBe(0.4);
    expect(normalizeProgress('40%')).toBe(0.4);
    expect(normalizeProgress(200)).toBe(1);
    expect(normalizeProgress('invalid')).toBe(0);
  });

  it('selects extend metadata by custom_id instead of the first item and falls back to its URLs', () => {
    const task = normalizeSunoTask({
      task_id: 'task-1',
      status: 'completed',
      points_cost: 17,
      points_refunded: true,
      result: {
        status: 3,
        custom_id: 'wanted',
        extend: JSON.stringify([
          { id: 'wrong', title: 'Wrong', audio_url: 'https://x/wrong.mp3' },
          {
            id: 'wanted', title: 'Right', audio_url: 'https://x/right.mp3', image_url: 'https://x/right.jpg', video_url: 'https://x/right.mp4',
            model_name: 'chirp-fenix', metadata: { duration: 182.5, tags: 'synth pop', prompt: 'lyrics', make_instrumental: false },
          },
        ]),
      },
    });
    expect(task).toMatchObject({
      taskId: 'task-1', customId: 'wanted', title: 'Right', style: 'synth pop', lyrics: 'lyrics',
      model: 'chirp-fenix', duration: 182.5, audioUrl: 'https://x/right.mp3', imageUrl: 'https://x/right.jpg',
      videoUrl: 'https://x/right.mp4', pointsCost: 17, pointsRefunded: true,
    });
  });

  it('tolerates malformed extend JSON and preserves provider errors', () => {
    expect(normalizeSunoTask({ task_id: 'bad', result: { status: 4, extend: '{bad', error: 'moderated' } })).toMatchObject({
      taskId: 'bad', status: 'error', stage: 'error', error: 'moderated', audioUrl: null,
    });
  });

  it('ignores MXAPI forbidden mp3 placeholders and prefers playable media_urls', () => {
    const task = normalizeSunoTask({
      task_id: 'task-forbidden-mp3',
      status: 'completed',
      result: {
        status: 3,
        fileInfo: { mp3Url: 'https://studio-api.prod.suno.com/api/forbidden', duration: 44.56 },
        extend: JSON.stringify([{
          id: 'clip-1',
          audio_url: 'https://suno-data-uploads.s3.amazonaws.com/clip-1.mp3',
          media_urls: [
            { url: 'https://d2lwuy8qc234o3.cloudfront.net/1/clip/clip-1.m4a', content_type: 'm4a-opus' },
            { url: 'https://cdn1.suno.ai/clip-1.mp3', content_type: 'mp3' },
          ],
        }]),
      },
    });
    expect(task.audioUrl).toBe('https://cdn1.suno.ai/clip-1.mp3');
    expect(task.duration).toBe(44.56);
  });

  it('never falls back to a sibling clip when custom_id has no exact match', () => {
    const task = normalizeSunoTask({
      task_id: 'task-missing-clip',
      result: {
        status: 3,
        custom_id: 'wanted',
        extend: JSON.stringify([
          { id: 'sibling', title: 'Wrong sibling', audio_url: 'https://x/wrong.mp3' },
        ]),
        fileInfo: { mp3Url: 'https://x/task-specific.mp3', duration: 90 },
      },
    });
    expect(task).toMatchObject({
      customId: 'wanted',
      title: null,
      audioUrl: 'https://x/task-specific.mp3',
      duration: 90,
    });
  });

  it('retains the numeric MXAPI record id and normalizes specialized async results', () => {
    const aligned = normalizeSunoTask({
      id: 204,
      task_id: 'aligned-task',
      status: 'completed',
      result: {
        status: 3,
        extend: JSON.stringify({
          state: 'aligned',
          alignment: [
            { word: '夜', start_s: 1.25, end_s: 1.6, success: true, p_align: 0.98 },
            { word: '', start_s: 2, end_s: 3 },
          ],
        }),
      },
    });
    expect(aligned).toMatchObject({
      providerRecordId: 204,
      taskId: 'aligned-task',
      alignmentState: 'aligned',
      lyricAlignment: [{ word: '夜', startS: 1.25, endS: 1.6, success: true, confidence: 0.98 }],
    });

    expect(normalizeSunoTask({
      id: '205', task_id: 'wav-task', status: 'completed',
      result: { status: 3, extend: { wav_file_url: 'https://cdn.example/song.wav' } },
    })).toMatchObject({ providerRecordId: 205, wavUrl: 'https://cdn.example/song.wav' });
    expect(normalizeSunoTask({
      id: 206, task_id: 'video-task', status: 'completed',
      result: { status: 3, extend: JSON.stringify({ status: 'complete', video_url: 'https://cdn.example/song.mp4' }) },
    })).toMatchObject({ providerRecordId: 206, videoUrl: 'https://cdn.example/song.mp4' });

    expect(normalizeSunoTask({
      id: 207, task_id: 'mp3-task', status: 'completed',
      result: { status: 3, extend: JSON.stringify({ download_url: 'https://cdn.example/song.mp3' }) },
    })).toMatchObject({ providerRecordId: 207, mp3Url: 'https://cdn.example/song.mp3' });
    expect(normalizeSunoTask({
      id: 208, task_id: 'm4a-task', status: 'completed',
      result: { status: 3, extend: JSON.stringify({ audio_url: 'https://cdn.example/song.m4a' }) },
    })).toMatchObject({ providerRecordId: 208, m4aUrl: 'https://cdn.example/song.m4a' });
  });
});

describe('SunoClient', () => {
  it('forwards bearer, sends the mapped request, and requires exactly two task ids', async () => {
    fake = await startFakeMxapi({ requiredBearer: 'secret' });
    const client = new SunoClient(fake.url, 'secret');
    expect(await client.generate(input())).toEqual(['task-a', 'task-b']);
    expect(fake.requests[0]).toMatchObject({ method: 'POST', path: '/api/v2/music/generate', auth: 'Bearer secret' });
    expect(fake.requests[0]?.body).toMatchObject({ gpt_description_prompt: 'dreamy neon drive', mv: 'chirp-bluejay' });
  });

  it('rejects a malformed submit result instead of creating a partial local batch', async () => {
    fake = await startFakeMxapi({ tasks: [{ taskId: 'only-one', statuses: [1] }] });
    await expect(new SunoClient(fake.url, 'key').generate(input())).rejects.toThrow(/expected exactly 2/);
  });

  it('submits sound to its dedicated endpoint with no song-only fields', async () => {
    fake = await startFakeMxapi({ requiredBearer: 'secret', validateRequests: true });
    const client = new SunoClient(fake.url, 'secret');
    expect(await client.sound(soundInput({ soundTempo: 99, soundKey: 'D', soundLoop: false }), 'sound-idem'))
      .toEqual(['task-a', 'task-b']);
    expect(fake.requests[0]).toEqual(expect.objectContaining({
      method: 'POST', path: '/api/v2/music/sound', auth: 'Bearer secret', idempotencyKey: 'sound-idem',
      body: { title: 'Rain', tags: 'rain on a glass roof', mv: 'chirp-crow', tempo: 99, key: 'D', loop: false },
    }));

    await fake.close();
    fake = await startFakeMxapi({ tasks: [{ taskId: 'only-sound-task', statuses: [1] }] });
    await expect(new SunoClient(fake.url, 'key').sound(soundInput())).rejects.toThrow(/expected exactly 2/);
  });

  it('polls one or many tasks and associates batch records by task id', async () => {
    fake = await startFakeMxapi();
    const client = new SunoClient(fake.url, 'key');
    expect((await client.task('task-a')).taskId).toBe('task-a');
    const single = fake.requests.find((entry) => entry.path === '/api/v2/music/task');
    expect(single?.query).toMatchObject({ id: 'task-a' });
    expect(single?.query).not.toHaveProperty('task_id');
    const tasks = await client.tasks(['task-a', 'task-b', 'task-a']);
    expect(tasks.map((task) => task.taskId)).toEqual(['task-b', 'task-a']);
    expect(fake.requests.at(-1)?.query).toMatchObject({ ids: 'task-a,task-b', page: '1', size: '10' });
  });

  it('chunks more than ten task ids into bounded batch requests', async () => {
    const specs = Array.from({ length: 12 }, (_, index) => ({ taskId: `task-${index + 1}`, statuses: [1 as const] }));
    fake = await startFakeMxapi({ tasks: specs });
    const ids = specs.map((task) => task.taskId);
    const tasks = await new SunoClient(fake.url, 'key').tasks([...ids, ids[0]!]);

    expect(tasks).toHaveLength(12);
    const batches = fake.requests.filter((entry) => entry.path === '/api/v2/music/tasks');
    expect(batches).toHaveLength(2);
    expect(String(batches[0]?.query.ids).split(',')).toEqual(ids.slice(0, 10));
    expect(String(batches[1]?.query.ids).split(',')).toEqual(ids.slice(10));
    expect(batches.map((entry) => entry.query.size)).toEqual(['10', '10']);
  });

  it('rejects oversized JSON responses before buffering their bodies', async () => {
    const fetchImpl = (async () => new Response('{}', {
      status: 200,
      headers: { 'content-length': String(2 * 1024 * 1024 + 1) },
    })) as typeof fetch;
    await expect(new SunoClient('https://mxapi.invalid', 'key', fetchImpl).balance()).rejects.toThrow(/exceeded/);
  });

  it('keeps the timeout active while a response body is still streaming', async () => {
    const fetchImpl = (async (_input: RequestInfo | URL, init?: RequestInit) => new Response(new ReadableStream({
      start(controller) {
        const abort = () => controller.error(new DOMException('Aborted', 'AbortError'));
        if (init?.signal?.aborted) abort();
        else init?.signal?.addEventListener('abort', abort, { once: true });
      },
    }), { status: 200 })) as typeof fetch;
    await expect(new SunoClient('https://mxapi.invalid', 'key', fetchImpl, 20).balance()).rejects.toThrow(/timed out/);
  });

  it('maps remaster models and calls the distinct upsample endpoint', async () => {
    fake = await startFakeMxapi();
    const client = new SunoClient(fake.url, 'key');
    expect(remasterModelFor('chirp-crow')).toBe('chirp-carp');
    expect(remasterModelFor('chirp-fenix')).toBe('chirp-flounder');
    expect(remasterModelFor('chirp-bluejay')).toBe('chirp-bass');
    expect(remasterModelFor('chirp-v4')).toBe('chirp-up');
    expect(() => remasterModelFor('chirp-v3-0')).toThrow(/unsupported/);
    expect(() => remasterModelFor('unknown-model')).toThrow(/unsupported/);
    expect(await client.remaster('clip-a', 'chirp-fenix', 'high')).toEqual(['task-a', 'task-b']);
    expect(fake.requests.at(-1)).toMatchObject({
      path: '/api/v2/music/upsample', body: { clip_id: 'clip-a', model_name: 'chirp-flounder', variation_category: 'high' },
    });
    expect(await client.remaster('clip-a', 'chirp-crow', 'high')).toEqual(['task-a', 'task-b']);
    expect(fake.requests.at(-1)).toMatchObject({
      path: '/api/v2/music/upsample', body: { clip_id: 'clip-a', model_name: 'chirp-carp', variation_category: 'high' },
    });
    expect(await client.remaster('clip-b', 'chirp-bluejay', 'subtle')).toEqual(['task-a', 'task-b']);
    expect(fake.requests.at(-1)).toMatchObject({
      path: '/api/v2/music/upsample', body: { clip_id: 'clip-b', model_name: 'chirp-bass' },
    });
    expect(fake.requests.at(-1)?.body).not.toHaveProperty('variation_category');
  });

  it('covers every documented single-task music endpoint with exact V2 field names', async () => {
    fake = await startFakeMxapi();
    const client = new SunoClient(fake.url, 'key');

    expect(await client.uploadAudio('https://assets.example/reference.mp3', true, 'idem-upload')).toBe('upload-task');
    expect(fake.requests.at(-1)).toMatchObject({
      path: '/api/v2/music/upload',
      body: { audio_url: 'https://assets.example/reference.mp3', copyrightAudio: true },
      idempotencyKey: 'idem-upload',
    });
    expect(await client.wholeSong('clip-a')).toBe('whole-song-task');
    expect(fake.requests.at(-1)).toMatchObject({ path: '/api/v2/music/whole-song', body: { clip_id: 'clip-a' } });
    expect(await client.alignedLyrics('[Verse]\nhello', 'clip-a')).toBe('aligned-lyrics-task');
    expect(fake.requests.at(-1)).toMatchObject({
      path: '/api/v2/music/aligned-lyrics', body: { lyrics: '[Verse]\nhello', suno_id: 'clip-a' },
    });
    expect(await client.musicVideo(204, 'clip-a')).toBe('video-task');
    expect(fake.requests.at(-1)).toMatchObject({ path: '/api/v2/music/video', body: { task_id: 204, suno_id: 'clip-a' } });
    expect(await client.convertWav(204, 'clip-a')).toBe('convert-wav-task');
    expect(fake.requests.at(-1)).toMatchObject({ path: '/api/v2/music/convert-wav', body: { task_id: 204, suno_id: 'clip-a' } });
    expect(await client.crop('clip-a', 1.25, 1.26)).toBe('crop-task');
    expect(fake.requests.at(-1)).toMatchObject({
      path: '/api/v2/music/crop', body: { clip_id: 'clip-a', crop_start_s: 1.25, crop_end_s: 1.26 },
    });
    const longSpeedTitle = 'F'.repeat(101);
    expect(await client.speed('clip-a', 1.25, {
      keepPitch: false, title: ` ${longSpeedTitle}\n`, idempotencyKey: 'idem-speed',
    })).toBe('speed-task');
    expect(fake.requests.at(-1)).toMatchObject({
      path: '/api/v2/music/speed',
      body: { clip_id: 'clip-a', speed_multiplier: 1.25, keep_pitch: false, title: longSpeedTitle },
      idempotencyKey: 'idem-speed',
    });
    expect(await client.speed('clip-a', 1, { title: ' \t ' })).toBe('speed-task');
    expect(fake.requests.at(-1)?.body).toEqual({
      clip_id: 'clip-a', speed_multiplier: 1, keep_pitch: true,
    });
  });

  it('validates specialized endpoint identifiers, ranges, enums, and URL fields before network I/O', async () => {
    fake = await startFakeMxapi();
    const client = new SunoClient(fake.url, 'key');
    await expect(client.uploadAudio('file:///tmp/song.mp3')).rejects.toThrow(/http or https/);
    await expect(client.uploadAudio('https://user:secret@example.test/song.mp3')).rejects.toThrow(/without credentials/);
    await expect(client.wholeSong(' ')).rejects.toThrow(/clip_id/);
    await expect(client.alignedLyrics(' ', 'clip-a')).rejects.toThrow(/lyrics/);
    await expect(client.musicVideo(2.5, 'clip-a')).rejects.toThrow(/positive integer/);
    await expect(client.convertWav(0, 'clip-a')).rejects.toThrow(/positive integer/);
    await expect(client.crop('clip-a', -1, 5)).rejects.toThrow(/non-negative/);
    await expect(client.crop('clip-a', 5, 5)).rejects.toThrow(/greater/);
    await expect(client.speed('clip-a', 3 as never)).rejects.toThrow(new RegExp(SUNO_SPEED_MULTIPLIERS.join('.*')));
    expect(fake.requests).toEqual([]);
  });

  it('reads V2 provider balance and paginated points logs without calling a real service', async () => {
    fake = await startFakeMxapi({
      balance: 4321,
      pointsLogs: [
        { id: 'log-1', amount: -20, remaining_points: 4312 },
        { id: 'log-2', amount: 10, remaining_points: 4332 },
        { id: 'log-3', amount: -5, remaining_points: 4327 },
      ],
    });
    const client = new SunoClient(fake.url, 'key');
    expect(await client.balance()).toBe(4321);
    expect(fake.requests.at(-1)?.path).toBe('/api/v2/points/balance');
    expect(await client.pointsLogs(2, 2)).toEqual({
      list: [{ id: 'log-3', amount: -5, remaining_points: 4327 }],
      pagination: { page: 2, pageSize: 2, total: 3, totalPages: 2 },
    });
    expect(fake.requests.at(-1)).toMatchObject({
      method: 'GET', path: '/api/v2/points/logs', query: { page: '2', pageSize: '2' },
    });
    await expect(client.pointsLogs(0, 20)).rejects.toThrow(/positive integer/);
    await expect(client.pointsLogs(1, 101)).rejects.toThrow(/between 1 and 100/);
    await fake.close();
    fake = await startFakeMxapi({ requiredBearer: 'right-key' });
    await expect(new SunoClient(fake.url, 'wrong-key').generate(input())).rejects.toMatchObject({ status: 401 });
    await fake.close();
    fake = await startFakeMxapi({ generateCode: 500 });
    await expect(new SunoClient(fake.url, 'key').generate(input())).rejects.toBeInstanceOf(SunoError);
  });

  it('refuses missing credentials before making a request', async () => {
    fake = await startFakeMxapi();
    await expect(new SunoClient(fake.url, null).generate(input())).rejects.toMatchObject({ status: 401 });
    expect(fake.requests).toEqual([]);
  });
});
