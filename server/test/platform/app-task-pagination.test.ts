import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import { createPlatformApp, type PlatformAppDeps } from '../../src/platform/app.js';
import type { AuthenticatedSession } from '../../src/platform/types.js';
import { platformUser, testConfig } from './helpers.js';

const session: AuthenticatedSession = {
  tokenHash: 'task-page-session',
  user: platformUser('task-page-owner'),
  clientId: 'museflow-test',
  accessToken: 'task-page-access',
  refreshToken: 'task-page-refresh',
  idToken: null,
  accessExpiresAt: new Date(Date.now() + 60_000),
  refreshExpiresAt: new Date(Date.now() + 3_600_000),
};

describe('task route pagination contract', () => {
  it('passes size as the page length and preserves mixed-task metadata', async () => {
    const listTasks = vi.fn(async () => [{
      id: 'asset-job-1',
      generationId: 'generation-1',
      title: 'Aligned lyrics',
      operation: 'aligned_lyrics',
      model: 'chirp-bluejay',
      status: 'queued',
      stage: 'queued',
      progress: 0,
      estimatedCredits: 3,
      settledCredits: null,
      billingStatus: 'reserved',
      createdAt: '2026-08-20T00:00:00.000Z',
      updatedAt: '2026-08-20T00:00:01.000Z',
      error: null,
      upstreamTaskId: 'task-1',
      providerRecordId: 123,
      submissionOptions: { lyrics: 'hello' },
      taskType: 'track_asset',
    }]);
    const app = createPlatformApp({
      config: testConfig(),
      repository: { listTasks },
      sessions: { authenticate: vi.fn(async () => session) },
      modelCross: {},
      music: {},
      sunoActions: {},
      ai: {},
      storage: {},
      queue: {},
      events: {},
      suno: { configured: false },
      staticDir: null,
      log: () => undefined,
    } as unknown as PlatformAppDeps);

    const response = await request(app).get('/api/tasks?page=3&size=7&ids=task-1,task-2');

    expect(response.status).toBe(200);
    expect(listTasks).toHaveBeenCalledWith(session.user.subject, 7, {
      upstreamTaskIds: ['task-1', 'task-2'],
      offset: 14,
    });
    expect(response.headers).toMatchObject({
      'x-task-page': '3',
      'x-task-size': '7',
      'x-task-count': '1',
    });
    expect(response.body).toEqual([expect.objectContaining({
      id: 'asset-job-1',
      batchId: 'generation-1',
      status: 'queued',
      upstreamTaskId: 'task-1',
      providerRecordId: 123,
      submissionOptions: { lyrics: 'hello' },
      taskType: 'track_asset',
    })]);
  });
});
