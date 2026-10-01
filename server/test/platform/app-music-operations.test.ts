import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import { createPlatformApp, type PlatformAppDeps } from '../../src/platform/app.js';
import type { AuthenticatedSession } from '../../src/platform/types.js';
import { platformUser, testConfig } from './helpers.js';

const session: AuthenticatedSession = {
  tokenHash: 'catalog-session',
  user: platformUser('catalog-owner'),
  clientId: 'museflow-test',
  accessToken: 'catalog-access-token',
  refreshToken: 'catalog-refresh-token',
  idToken: null,
  accessExpiresAt: new Date(Date.now() + 60_000),
  refreshExpiresAt: new Date(Date.now() + 3_600_000),
};

const catalog = vi.fn(async (
  _token: string,
  requested: Array<{ action: string; operationCode: string; fallbackCredits: number }>,
) => requested.map((entry) => ({
  ...entry,
  available: true,
  estimatedCredits: entry.fallbackCredits,
  priceVersion: 'catalog-test-v1',
  chargingEnabled: false,
  preview: true,
})));

const appFor = (input: {
  providerUrl: string;
  providerConfigured: boolean;
  fakeProvider?: boolean;
  storage?: 'local' | 's3';
}) => {
  const storage = input.storage ?? 's3';
  const config = testConfig({
    ALLOW_DEVELOPMENT_FAKE_PROVIDER: input.fakeProvider ? 'true' : 'false',
    STORAGE_DRIVER: storage,
    ...(storage === 's3' ? {
      S3_ACCESS_KEY_ID: 'catalog-test-access',
      S3_SECRET_ACCESS_KEY: 'catalog-test-secret',
    } : {}),
  });
  return createPlatformApp({
    config,
    sessions: { authenticate: vi.fn(async () => session) },
    modelCross: { musicOperationCatalog: catalog },
    suno: {
      configured: input.providerConfigured,
      url: input.providerUrl,
      balance: vi.fn(async () => 1_000),
    },
    repository: {},
    music: {},
    sunoActions: {},
    ai: {},
    storage: {},
    queue: {},
    events: {},
    staticDir: null,
    log: () => undefined,
  } as unknown as PlatformAppDeps);
};

describe('music operation catalog runtime contract', () => {
  it('does not advertise a public Provider as executable while billing is disabled', async () => {
    const app = appFor({
      providerUrl: 'https://public-provider.example.test',
      providerConfigured: true,
      fakeProvider: true,
      storage: 's3',
    });
    const response = await request(app).get('/api/catalog/music-operations');
    expect(response.status, response.text).toBe(200);
    expect(response.body).toHaveLength(18);
    expect(response.body.every((entry: { executable: boolean }) => entry.executable === false)).toBe(true);
    expect(response.body.find((entry: { operationCode: string }) => entry.operationCode === 'generation_pair'))
      .toMatchObject({
        available: false,
        catalogAvailable: true,
        chargingEnabled: false,
        previewExecutable: false,
        reason: 'MuseFlow 计费写入已关闭，禁止调用公网音乐 Provider',
      });
  });

  it('advertises an explicit loopback fake only for actions the current storage can execute', async () => {
    const app = appFor({
      providerUrl: 'http://127.0.0.1:39999',
      providerConfigured: true,
      fakeProvider: true,
      storage: 'local',
    });
    const response = await request(app).get('/api/catalog/music-operations');
    expect(response.status, response.text).toBe(200);
    const generation = response.body.find((entry: { operationCode: string }) => entry.operationCode === 'generation_pair');
    expect(generation).toMatchObject({ executable: true, previewExecutable: true, available: true });
    for (const operationCode of [
      'upload_single', 'upload_copyright_single', 'upload_extend_pair', 'upload_copyright_extend_pair',
    ]) {
      expect(response.body.find((entry: { operationCode: string }) => entry.operationCode === operationCode))
        .toMatchObject({
          executable: false,
          previewExecutable: false,
          reason: '参考音频操作需要可访问的短期签名素材地址',
        });
    }
  });

  it('publishes the exact server validators for sound, upload, upload_extend, crop, and speed', async () => {
    const app = appFor({
      providerUrl: 'http://localhost:39999',
      providerConfigured: true,
      fakeProvider: true,
      storage: 's3',
    });
    const response = await request(app).get('/api/catalog/music-operations');
    const sound = response.body.find((entry: { operationCode: string }) => entry.operationCode === 'sound_pair');
    const standardUpload = response.body.find((entry: { operationCode: string }) => entry.operationCode === 'upload_single');
    const continuation = response.body.find((entry: { operationCode: string }) => entry.operationCode === 'upload_extend_pair');
    const copyrightContinuation = response.body.find((entry: { operationCode: string }) => entry.operationCode === 'upload_copyright_extend_pair');
    const extend = response.body.find((entry: { operationCode: string }) => entry.operationCode === 'extend_pair');
    const cover = response.body.find((entry: { operationCode: string }) => entry.operationCode === 'cover_pair');
    const remaster = response.body.find((entry: { operationCode: string }) => entry.operationCode === 'remaster_pair');
    const crop = response.body.find((entry: { operationCode: string }) => entry.operationCode === 'crop_single');
    const speed = response.body.find((entry: { operationCode: string }) => entry.operationCode === 'speed_single');
    expect(sound).toMatchObject({
      action: 'sound', operationCode: 'sound_pair', outputCount: 2,
      modelIds: ['chirp-crow', 'chirp-fenix'],
      parameters: {
        title: { type: 'string', required: true, maxLength: 100, wireName: 'title' },
        tags: { type: 'string', required: true, maxLength: 1000, wireName: 'tags' },
        model: { type: 'string', required: true, enum: ['chirp-crow', 'chirp-fenix'], wireName: 'mv' },
        tempo: { type: 'number', required: false, default: 99, wireName: 'tempo' },
        key: { type: 'string', required: false, default: 'D', wireName: 'key' },
        loop: { type: 'boolean', required: false, default: true, wireName: 'loop' },
      },
    });
    expect(standardUpload.parameters).toEqual({
      acceptedMimeTypes: ['audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/x-wav', 'audio/flac'],
      acceptedExtensions: ['.mp3', '.wav', '.flac'],
      maxBytes: 52_428_800,
      maxDurationSeconds: 600,
      copyrightConfirmedRequired: true,
      copyrightAudio: false,
    });
    expect(continuation.parameters).toEqual({
      continueAt: { min: 0, max: 600, step: 1, default: 0, maximumField: 'upload.duration' },
      audioWeight: { min: 0, max: 1, step: 0.05, default: 0.5 },
      generationOverrides: expect.arrayContaining(['model', 'mode', 'title', 'lyrics', 'styleWeight', 'weirdness']),
      copyrightAudio: false,
    });
    expect(copyrightContinuation.parameters.generationOverrides).toEqual(continuation.parameters.generationOverrides);
    expect(copyrightContinuation.parameters.copyrightAudio).toBe(true);
    expect(extend.parameters).toMatchObject({
      continueAt: { min: 0, step: 1, maximumField: 'track.duration' },
      generationOverrides: expect.arrayContaining(['model', 'mode', 'title', 'lyrics', 'styleWeight', 'weirdness']),
    });
    expect(cover.parameters.generationOverrides).toEqual(extend.parameters.generationOverrides);
    expect(remaster.parameters).toEqual({
      variation: {
        enum: ['subtle', 'normal', 'high'],
        modelIds: ['chirp-crow', 'chirp-fenix'],
        default: 'normal',
      },
    });
    expect(crop.parameters).toEqual({
      startSeconds: { min: 0, default: 0 },
      endSeconds: {
        exclusiveMinimumField: 'startSeconds',
        maximumField: 'track.duration',
      },
    });
    expect(speed.parameters).toEqual({
      multiplier: { enum: [0.25, 0.5, 0.75, 1, 1.25, 1.5, 2], default: 1 },
      keepPitch: { type: 'boolean', default: true },
      title: { type: 'string', required: false },
    });
  });

  it('reports every operation unavailable when the Provider is not configured', async () => {
    const app = appFor({
      providerUrl: 'http://127.0.0.1:39999',
      providerConfigured: false,
      fakeProvider: true,
      storage: 's3',
    });
    const response = await request(app).get('/api/catalog/music-operations');
    expect(response.status, response.text).toBe(200);
    expect(response.body.every((entry: { executable: boolean; reason: string }) =>
      entry.executable === false && entry.reason === '音乐 Provider 尚未配置')).toBe(true);
  });
});
