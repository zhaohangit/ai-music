import { afterEach, describe, expect, it } from 'vitest';
import { startFakeMxapi, type FakeMxapi } from './fakeMxapi.js';

let fake: FakeMxapi | null = null;
afterEach(async () => {
  await fake?.close();
  fake = null;
});

describe('fake MXAPI', () => {
  it('requires bearer, returns exactly two tasks, advances 1/2/3, and serves assets', async () => {
    fake = await startFakeMxapi({ requiredBearer: 'secret' });
    expect((await fetch(`${fake.url}/api/v2/music/generate`, { method: 'POST' })).status).toBe(401);
    const headers = { Authorization: 'Bearer secret', 'Content-Type': 'application/json' };
    const generated = await fetch(`${fake.url}/api/v2/music/generate`, {
      method: 'POST', headers, body: JSON.stringify({ gpt_description_prompt: 'x' }),
    }).then((response) => response.json()) as { data: { task_ids: string[] } };
    expect(generated.data.task_ids).toEqual(['task-a', 'task-b']);

    const statuses: number[] = [];
    for (let poll = 0; poll < 3; poll++) {
      const response = await fetch(`${fake.url}/api/v2/music/task?id=task-a`, { headers }).then((item) => item.json()) as { data: { result: { status: number } } };
      statuses.push(response.data.result.status);
    }
    expect(statuses).toEqual([1, 2, 3]);
    expect((await fetch(`${fake.url}/api/v2/music/task?task_id=task-a`, { headers })).status).toBe(404);
    expect(await fetch(`${fake.url}/assets/task-a.mp3`).then((response) => response.text())).toBe('ID3-fake-task-a.mp3');
  });

  it('returns batch results in reverse order and embeds a matching custom clip in extend JSON', async () => {
    fake = await startFakeMxapi({ tasks: [
      { taskId: 'first', customId: 'clip-first', statuses: [3], unrelatedExtendFirst: true, omitFileInfo: true },
      { taskId: 'second', customId: 'clip-second', statuses: [4], error: 'moderated', refunded: true },
    ] });
    const body = await fetch(`${fake.url}/api/v2/music/tasks?ids=first,second&page=1&size=10`).then((response) => response.json()) as {
      data: { items: Array<{ task_id: string; points_refunded: boolean; result: { custom_id: string; extend: string; status: number } }> };
    };
    expect(body.data.items.map((task) => task.task_id)).toEqual(['second', 'first']);
    const first = body.data.items.find((task) => task.task_id === 'first')!;
    const clips = JSON.parse(first.result.extend) as Array<{ id: string }>;
    expect(clips[0]?.id).toBe('wrong-clip');
    expect(clips.find((clip) => clip.id === first.result.custom_id)?.id).toBe('clip-first');
    expect(body.data.items.find((task) => task.task_id === 'second')).toMatchObject({ points_refunded: true, result: { status: 4 } });
  });

  it('accepts the current V6 models and Max/creativity metadata', async () => {
    fake = await startFakeMxapi({ validateRequests: true });
    const headers = { 'Content-Type': 'application/json' };
    const response = await fetch(`${fake.url}/api/v2/music/generate`, { method: 'POST', headers, body: JSON.stringify({
      mv: 'chirp-hawk', make_instrumental: false, gpt_description_prompt: 'green morning',
      metadata: { is_max_mode: true, control_sliders: { style_weight: .6, weirdness_constraint: .4, aug_creativity: 3 }, can_control_sliders: ['style_weight','weirdness_constraint'] },
    }) });
    expect(response.status).toBe(200);
  });

  it('supports strict unique submissions and browser-decodable local media fixtures', async () => {
    fake = await startFakeMxapi({ uniqueTaskBatches: true, validateRequests: true, validMedia: true });
    const headers = { 'Content-Type': 'application/json' };
    expect((await fetch(`${fake.url}/api/v2/music/generate`, {
      method: 'POST', headers, body: JSON.stringify({ gpt_description_prompt: 'missing model' }),
    })).status).toBe(400);

    const submit = () => fetch(`${fake!.url}/api/v2/music/generate`, {
      method: 'POST', headers, body: JSON.stringify({
        mv: 'chirp-bluejay', make_instrumental: false, gpt_description_prompt: 'night drive',
      }),
    }).then((response) => response.json()) as Promise<{ data: { task_ids: string[] } }>;
    const first = await submit();
    const second = await submit();
    expect(first.data.task_ids).toHaveLength(2);
    expect(second.data.task_ids).toHaveLength(2);
    expect(second.data.task_ids).not.toEqual(first.data.task_ids);

    expect((await fetch(`${fake.url}/api/v2/music/sound`, {
      method: 'POST', headers, body: JSON.stringify({
        title: 'Rain', tags: 'rain ambience', mv: 'chirp-crow', tempo: 99, key: 'D', loop: true,
      }),
    })).status).toBe(200);
    expect((await fetch(`${fake.url}/api/v2/music/sound`, {
      method: 'POST', headers, body: JSON.stringify({
        title: 'Rain', tags: 'rain ambience', mv: 'chirp-crow', make_instrumental: true,
      }),
    })).status).toBe(400);

    const uploadExtend = {
      mv: 'chirp-bluejay', make_instrumental: false, task: 'upload_extend',
      continue_clip_id: 'uploaded-clip', continue_at: 12.5,
      metadata: {
        control_sliders: { style_weight: 0.6, weirdness_constraint: 0.5, audio_weight: 0.8 },
      },
    };
    expect((await fetch(`${fake.url}/api/v2/music/generate`, {
      method: 'POST', headers, body: JSON.stringify(uploadExtend),
    })).status).toBe(200);
    expect((await fetch(`${fake.url}/api/v2/music/generate`, {
      method: 'POST', headers, body: JSON.stringify({
        ...uploadExtend,
        metadata: { ...uploadExtend.metadata, audio_weight: 0.8 },
      }),
    })).status).toBe(400);
    expect((await fetch(`${fake.url}/api/v2/music/generate`, {
      method: 'POST', headers, body: JSON.stringify({
        ...uploadExtend,
        metadata: { ...uploadExtend.metadata, can_control_sliders: ['unsupported_slider'] },
      }),
    })).status).toBe(400);
    expect((await fetch(`${fake.url}/api/v2/music/generate`, {
      method: 'POST', headers, body: JSON.stringify({
        mv: 'chirp-v4', make_instrumental: true, gpt_description_prompt: 'legacy',
        metadata: { create_mode: 'simple' },
      }),
    })).status).toBe(400);

    expect((await fetch(`${fake.url}/api/v2/music/upsample`, {
      method: 'POST', headers, body: JSON.stringify({
        clip_id: 'clip-a', model_name: 'chirp-flounder', variation_category: 'high',
      }),
    })).status).toBe(200);

    expect((await fetch(`${fake.url}/api/v2/music/upsample`, {
      method: 'POST', headers, body: JSON.stringify({
        clip_id: 'clip-a', model_name: 'chirp-bass', variation_category: 'subtle',
      }),
    })).status).toBe(400);
    expect((await fetch(`${fake.url}/api/v2/music/upsample`, {
      method: 'POST', headers, body: JSON.stringify({ clip_id: 'clip-a', model_name: 'chirp-bass' }),
    })).status).toBe(200);

    const audio = await fetch(`${fake.url}/assets/fixture.mp3`);
    const cover = await fetch(`${fake.url}/assets/fixture.jpg`);
    expect(audio.headers.get('content-type')).toContain('audio/mpeg');
    expect(Buffer.from(await audio.arrayBuffer()).subarray(0, 2)).toEqual(Buffer.from([0xff, 0xf3]));
    expect(cover.headers.get('content-type')).toContain('image/png');
    expect(Buffer.from(await cover.arrayBuffer()).subarray(0, 8)).toEqual(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  });
});
