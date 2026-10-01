import { afterEach, describe, expect, it, vi } from 'vitest';
import { api, ApiError } from '../src/api';
import { DEFAULT_FORM } from '../src/components/CreatePanel';

describe('API client', () => {
  afterEach(() => {
    api.resetAuthRequired();
    vi.unstubAllGlobals();
  });

  it('coalesces concurrent protected 401 responses into one auth-required signal', async () => {
    const onAuthRequired = vi.fn();
    const unsubscribe = api.onAuthRequired(onAuthRequired);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: 'expired' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    })));

    await Promise.allSettled([api.projects(), api.tasks(), api.billingSummary()]);

    expect(onAuthRequired).toHaveBeenCalledOnce();
    unsubscribe();
  });

  it('does not emit an auth-required signal when the session probe itself is anonymous', async () => {
    const onAuthRequired = vi.fn();
    const unsubscribe = api.onAuthRequired(onAuthRequired);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: 'anonymous' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    })));

    await expect(api.session()).rejects.toMatchObject({ status: 401 });

    expect(onAuthRequired).not.toHaveBeenCalled();
    unsubscribe();
  });

  it('sends cookies and an idempotency key for music generation', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify([]), { status: 200, headers: { 'Content-Type': 'application/json' } }));
    vi.stubGlobal('fetch', fetchMock);

    await api.generate(DEFAULT_FORM);

    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/generate');
    expect(init.credentials).toBe('include');
    expect(new Headers(init.headers).get('Idempotency-Key')).toMatch(/^music-generate-/);
    expect(JSON.parse(String(init.body))).toMatchObject({ model: 'chirp-hawk', mode: 'simple' });
  });

  it('sends the exact sound payload under an independent idempotency scope', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify([]), { status: 200, headers: { 'Content-Type': 'application/json' } }));
    vi.stubGlobal('fetch', fetchMock);

    await api.generate({
      kind: 'sound',
      title: 'Rain',
      tags: 'cinematic rain ambience',
      model: 'chirp-crow',
      tempo: 99,
      key: 'D',
      loop: false,
    });

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/generate');
    expect(new Headers(init.headers).get('Idempotency-Key')).toMatch(/^sound-generate-/);
    expect(JSON.parse(String(init.body))).toEqual({
      kind: 'sound', title: 'Rain', tags: 'cinematic rain ambience', model: 'chirp-crow', tempo: 99, key: 'D', loop: false,
    });
  });

  it('normalizes the documented v4.5-all display name from a stale server catalog', async () => {
    const stale = {
      id: 'chirp-auk-turbo',
      displayName: 'Suno V4.5 Turbo',
      provider: 'MXAPI',
      description: 'stale label',
      enabled: true,
      estimatedCredits: { generatePair: 10, extendPair: 10, coverPair: 14, remasterPair: 14 },
      capabilities: {
        simple: true, custom: true, instrumental: true, negativeTags: true, vocalGender: true,
        operations: ['generate'], maxTitleLength: 80, maxDescriptionLength: 1000,
        maxStyleLength: 200, maxLyricsLength: 3000, maxNegativeTagsLength: 200,
      },
    };
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify([stale]), {
      status: 200, headers: { 'Content-Type': 'application/json' },
    })));

    const [model] = await api.models();
    expect(model.id).toBe('chirp-auk-turbo');
    expect(model.displayName).toBe('Suno V4.5 All');
  });

  it('uses a scoped idempotency key for AI actions', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ id: '1' }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
    vi.stubGlobal('fetch', fetchMock);
    await api.aiAssist({ action: 'lyrics.rewrite', input: '原始歌词' });
    const init = fetchMock.mock.calls[0][1] as RequestInit;
    expect(new Headers(init.headers).get('Idempotency-Key')).toMatch(/^ai-lyrics\.rewrite-/);
  });

  it('loads the account-scoped AI catalog and preserves a caller-owned retry key', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify([]), { status: 200, headers: { 'Content-Type': 'application/json' } }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: 'ai-1' }), { status: 201, headers: { 'Content-Type': 'application/json' } }));
    vi.stubGlobal('fetch', fetchMock);

    await api.aiOperations();
    await api.aiAssist({ action: 'lyrics.translate', input: '原歌词', context: { language: 'zh-CN', targetLanguage: 'ja-JP' } }, 'ai-stable-retry-key-123');

    expect(fetchMock.mock.calls[0][0]).toBe('/api/catalog/ai-operations');
    expect(fetchMock.mock.calls[0][1]).toMatchObject({ credentials: 'include' });
    const [url, init] = fetchMock.mock.calls[1] as [string, RequestInit];
    expect(url).toBe('/api/ai/assist');
    expect(new Headers(init.headers).get('Idempotency-Key')).toBe('ai-stable-retry-key-123');
    const body = JSON.parse(String(init.body)) as Record<string, unknown>;
    expect(body).toMatchObject({ action: 'lyrics.translate', context: { language: 'zh-CN', targetLanguage: 'ja-JP' } });
    expect(body).not.toHaveProperty('estimatedCredits');
    expect(body).not.toHaveProperty('priceVersion');
    expect(body).not.toHaveProperty('executable');
  });

  it('loads the authenticated MXAPI capability and pricing catalog', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify([]), {
      status: 200, headers: { 'Content-Type': 'application/json' },
    }));
    vi.stubGlobal('fetch', fetchMock);

    await api.mxapiCapabilities();

    expect(fetchMock).toHaveBeenCalledWith('/api/catalog/mxapi-capabilities', { credentials: 'include' });
  });

  it('uploads reference audio only to the MuseFlow multipart endpoint with separate copyright fields', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      id: 'upload-1', status: 'ready', mimeType: 'audio/mpeg', byteSize: 3, durationSeconds: 1,
      checksumSha256: 'abc', copyrightConfirmed: true, copyrightAudio: false, createdAt: '2026-08-25T00:00:00Z',
    }), { status: 201, headers: { 'Content-Type': 'application/json' } }));
    vi.stubGlobal('fetch', fetchMock);
    const file = new File(['mp3'], 'reference.mp3', { type: 'audio/mpeg' });

    await api.uploadAudio(file, { copyrightConfirmed: true, copyrightAudio: false });

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/uploads/audio');
    expect(init.method).toBe('POST');
    expect(init.body).toBeInstanceOf(FormData);
    expect(new Headers(init.headers).has('Content-Type')).toBe(false);
    expect(new Headers(init.headers).get('Idempotency-Key')).toMatch(/^audio-upload-/);
    const body = init.body as FormData;
    expect(body.get('audio')).toEqual(expect.objectContaining({ name: 'reference.mp3', type: 'audio/mpeg', size: 3 }));
    expect(body.get('copyrightConfirmed')).toBe('true');
    expect(body.get('copyrightAudio')).toBe('false');
  });

  it('keeps the persisted copyright variant out of the reference action body', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      generationId: 'generation-1', status: 'submitting', tracks: [],
    }), { status: 202, headers: { 'Content-Type': 'application/json' } }));
    vi.stubGlobal('fetch', fetchMock);

    await api.uploadAudioAction('upload/owner-scoped', {
      action: 'upload_extend',
      mode: 'simple',
      title: '参考续作',
      description: '延续副歌',
      style: '',
      lyrics: '',
      instrumental: false,
      model: 'chirp-fenix',
      negativeTags: '',
      vocalGender: 'auto',
      styleWeight: 0.65,
      weirdness: 0.5,
      continueAt: 12.5,
      audioWeight: 0.5,
    });

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/uploads/upload%2Fowner-scoped/actions');
    expect(new Headers(init.headers).get('Idempotency-Key')).toMatch(/^music-upload-extend-/);
    const body = JSON.parse(String(init.body)) as Record<string, unknown>;
    expect(body).toMatchObject({ action: 'upload_extend', continueAt: 12.5, audioWeight: 0.5 });
    expect(body).not.toHaveProperty('copyrightAudio');
    expect(body).not.toHaveProperty('customId');
    expect(body).not.toHaveProperty('providerRecordId');
    expect(body).not.toHaveProperty('estimatedCredits');
    expect(body).not.toHaveProperty('priceVersion');
    expect(JSON.stringify(body)).not.toContain('http');
  });

  it('submits a standalone Provider import with its own scope and no continuation or billing fields', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      generationId: 'import-generation-1', status: 'submitting', tracks: [],
    }), { status: 202, headers: { 'Content-Type': 'application/json' } }));
    vi.stubGlobal('fetch', fetchMock);

    await api.uploadAudioAction('upload/owner-scoped', {
      action: 'upload',
      model: 'chirp-fenix',
      title: '参考素材',
    });

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/uploads/upload%2Fowner-scoped/actions');
    expect(new Headers(init.headers).get('Idempotency-Key')).toMatch(/^music-upload-/);
    expect(new Headers(init.headers).get('Idempotency-Key')).not.toMatch(/^music-upload-extend-/);
    const body = JSON.parse(String(init.body)) as Record<string, unknown>;
    expect(body).toEqual({ action: 'upload', model: 'chirp-fenix', title: '参考素材' });
    for (const field of ['copyrightAudio', 'copyrightConfirmed', 'continueAt', 'audioWeight', 'estimatedCredits', 'priceVersion', 'customId', 'providerRecordId']) {
      expect(body).not.toHaveProperty(field);
    }
    expect(JSON.stringify(body)).not.toContain('http');
  });

  it('uses stable owner-scoped action and asset-job endpoints', async () => {
    const fetchMock = vi.fn().mockImplementation(() => Promise.resolve(new Response(JSON.stringify({
      id: 'job-1', trackId: 'track/unsafe', action: 'convert_wav', status: 'draft', progress: 0,
      billingStatus: 'draft', error: null,
    }), {
      status: 202, headers: { 'Content-Type': 'application/json' },
    })));
    vi.stubGlobal('fetch', fetchMock);
    await api.assetAction('track/unsafe', { action: 'convert_wav' });
    expect(fetchMock).toHaveBeenCalledWith('/api/tracks/track%2Funsafe/assets', expect.objectContaining({
      method: 'POST', credentials: 'include',
    }));
    const init = fetchMock.mock.calls[0][1] as RequestInit;
    expect(new Headers(init.headers).get('Idempotency-Key')).toMatch(/^asset-convert_wav-/);
    expect(JSON.parse(String(init.body))).toEqual({ action: 'convert_wav' });

    fetchMock.mockClear();
    fetchMock.mockImplementationOnce(() => Promise.resolve(new Response(JSON.stringify([]), {
      status: 200, headers: { 'Content-Type': 'application/json' },
    })));
    await api.assetJobs('track/unsafe');
    expect(fetchMock).toHaveBeenCalledWith('/api/tracks/track%2Funsafe/assets/jobs', expect.objectContaining({ credentials: 'include' }));
  });

  it('normalizes the raw asset worker lifecycle and fails unknown states closed', async () => {
    const base = { trackId: 'track-1', action: 'video', progress: 0, billingStatus: 'reserved', error: null };
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify([
      { ...base, id: 'draft', status: 'draft' },
      { ...base, id: 'submitting', status: 'submitting' },
      { ...base, id: 'succeeded', status: 'succeeded', progress: 1 },
      { ...base, id: 'unknown', status: 'provider_mystery' },
    ]), { status: 200, headers: { 'Content-Type': 'application/json' } })));

    const jobs = await api.assetJobs('track-1');
    expect(jobs.map((job) => job.status)).toEqual(['queued', 'queued', 'completed', 'failed']);
    expect(jobs[3].error).toBe('服务端返回未知资产作业状态：provider_mystery');
  });

  it('confirms an AI revision through the owner-scoped server endpoint', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ documentId: 'd1', revisionId: 'r1' }), {
      status: 201, headers: { 'Content-Type': 'application/json' },
    }));
    vi.stubGlobal('fetch', fetchMock);
    await api.acceptAiAssist('run/unsafe', { kind: 'lyrics', title: 'Accepted', appliedFields: ['lyrics', 'negativeTags'] });
    expect(fetchMock).toHaveBeenCalledWith('/api/ai/assist/run%2Funsafe/accept', expect.objectContaining({
      method: 'POST', credentials: 'include',
    }));
    const body = JSON.parse(String((fetchMock.mock.calls[0][1] as RequestInit).body));
    expect(body).toEqual({ kind: 'lyrics', title: 'Accepted', appliedFields: ['lyrics', 'negativeTags'] });
  });

  it('preserves the server error and status', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: '积分不足' }), { status: 402, statusText: 'Payment Required', headers: { 'Content-Type': 'application/json' } })));
    await expect(api.generate(DEFAULT_FORM)).rejects.toEqual(expect.objectContaining<ApiError>({ message: '积分不足', status: 402 }));
  });
});
