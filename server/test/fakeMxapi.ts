import express from 'express';
import type { Server } from 'node:http';
import { randomUUID } from 'node:crypto';

export type FakeTaskStatus = 1 | 2 | 3 | 4;

export interface FakeMxapiRequest {
  method: string;
  path: string;
  query: Record<string, string | string[]>;
  body?: unknown;
  auth?: string;
  idempotencyKey?: string;
}

export interface FakeTaskSpec {
  taskId: string;
  providerRecordId?: number;
  customId?: string;
  /** Each poll advances by one item and then stays at the final status. */
  statuses?: FakeTaskStatus[];
  title?: string;
  error?: string;
  pointsCost?: number;
  refunded?: boolean;
  /** Return malformed JSON in result.extend. */
  malformedExtend?: boolean;
  /** Do not expose fileInfo; clients must fall back to the matching extend item. */
  omitFileInfo?: boolean;
  /** Put an unrelated clip first to ensure custom_id matching is used. */
  unrelatedExtendFirst?: boolean;
  /** Omit selected downloadable resources. */
  omitAudio?: boolean;
  omitCover?: boolean;
  omitVideo?: boolean;
}

export interface FakeMxapiOptions {
  prefix?: string;
  port?: number;
  requiredBearer?: string;
  /** Defaults to exactly two tasks, as MXAPI generate/actions do. */
  tasks?: FakeTaskSpec[];
  balance?: number;
  /** Provider merchant points ledger rows returned by the V2 diagnostics API. */
  pointsLogs?: Array<Record<string, unknown>>;
  generateHttpStatus?: number;
  generateCode?: number;
  pollHttpStatus?: number;
  pollCode?: number;
  assetHttpStatus?: number;
  /** Create a fresh pair of opaque tasks for every paid submission. */
  uniqueTaskBatches?: boolean;
  /** Reject malformed generate/action payloads instead of always succeeding. */
  validateRequests?: boolean;
  /** Serve browser-decodable generated fixtures for local UI testing. */
  validMedia?: boolean;
}

export interface FakeMxapi {
  url: string;
  requests: FakeMxapiRequest[];
  tasks: Map<string, FakeTaskSpec>;
  pollCounts: Map<string, number>;
  setStatuses(taskId: string, statuses: FakeTaskStatus[]): void;
  close(): Promise<void>;
}

const DEFAULT_TASKS: FakeTaskSpec[] = [
  { taskId: 'task-a', customId: 'clip-a', statuses: [1, 2, 3], title: 'Result A', pointsCost: 12 },
  { taskId: 'task-b', customId: 'clip-b', statuses: [1, 2, 3], title: 'Result B', pointsCost: 13 },
];

// A short generated C4 tone (MP3) and a solid MuseFlow-purple PNG. These are
// deterministic local fixtures, not downloaded music or third-party artwork.
const VALID_MP3 = Buffer.from('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', 'base64');
const VALID_COVER = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAIAAAD8GO2jAAAAKklEQVR42mMo8LhDU8QwasGoBaMWjFowasGoBaMWjFowasGoBaMWDBULAJorUFvQqlONAAAAAElFTkSuQmCC', 'base64');
const VALID_MP4 = Buffer.from('000000186674797069736f6d0000020069736f6d69736f32', 'hex');

const statusName = (status: FakeTaskStatus) => ({ 1: 'pending', 2: 'processing', 3: 'completed', 4: 'failed' })[status];

/**
 * Deterministic local MXAPI double. It deliberately models the awkward parts of the real
 * protocol: one submit returns two task ids, result.status is numeric, and result.extend is a
 * JSON-encoded string whose matching item is selected by custom_id.
 */
export async function startFakeMxapi(options: FakeMxapiOptions = {}): Promise<FakeMxapi> {
  const root = express();
  const app = express();
  root.use(options.prefix ?? '/', app);
  app.use(express.json());

  const requests: FakeMxapiRequest[] = [];
  const pollCounts = new Map<string, number>();
  const taskBlueprints = (options.tasks ?? DEFAULT_TASKS).map((task, index) => ({
    providerRecordId: index + 1,
    ...task,
    statuses: task.statuses ? [...task.statuses] : undefined,
  }));
  const tasks = new Map(taskBlueprints.map((task) => [task.taskId, { ...task }]));
  let submissionCount = 0;
  // A process-instance nonce keeps ids unique even when the fake provider is
  // restarted against a persistent E2E database. This mirrors real provider
  // ids and makes repeated local delivery runs deterministic with respect to
  // uniqueness (without ever calling an external service).
  const submissionNamespace = randomUUID().replaceAll('-', '').slice(0, 12);
  let origin = '';

  const submittedTaskIds = (): string[] => {
    if (!options.uniqueTaskBatches) return taskBlueprints.map((task) => task.taskId);
    submissionCount += 1;
    return taskBlueprints.map((blueprint, index) => {
      const taskId = `${blueprint.taskId}-${submissionNamespace}-batch-${submissionCount}`;
      const customBase = blueprint.customId ?? `clip-${index + 1}`;
      tasks.set(taskId, {
        ...blueprint,
        taskId,
        customId: `${customBase}-${submissionNamespace}-batch-${submissionCount}`,
        statuses: blueprint.statuses ? [...blueprint.statuses] : undefined,
      });
      return taskId;
    });
  };

  const validateGeneratePayload = (body: unknown): string | null => {
    if (!body || typeof body !== 'object') return 'body must be an object';
    const value = body as Record<string, unknown>;
    if (typeof value.mv !== 'string' || !value.mv) return 'mv is required';
    if (typeof value.make_instrumental !== 'boolean') return 'make_instrumental must be boolean';
    const advancedModel = ['chirp-hawk', 'chirp-hawk-wild', 'chirp-goose', 'chirp-fenix', 'chirp-crow', 'chirp-bluejay', 'chirp-auk', 'chirp-auk-turbo']
      .includes(value.mv);
    if (!advancedModel && value.metadata !== undefined) return 'metadata is only supported by v4.5+ models';
    if (value.metadata !== undefined) {
      if (!value.metadata || typeof value.metadata !== 'object' || Array.isArray(value.metadata)) {
        return 'metadata must be an object';
      }
      const metadata = value.metadata as Record<string, unknown>;
      if (metadata.audio_weight !== undefined) return 'audio_weight must be nested under metadata.control_sliders';
      const unknownMetadataField = Object.keys(metadata).find((field) => ![
        'create_mode', 'vocal_gender', 'is_max_mode', 'control_sliders', 'can_control_sliders',
      ].includes(field));
      if (unknownMetadataField) return `metadata field ${unknownMetadataField} is not supported`;
      if (metadata.create_mode !== undefined
        && !['simple', 'custom'].includes(String(metadata.create_mode))) {
        return 'metadata.create_mode is invalid';
      }
      if (metadata.vocal_gender !== undefined && !['m', 'f'].includes(String(metadata.vocal_gender))) {
        return 'metadata.vocal_gender is invalid';
      }
      if (metadata.can_control_sliders !== undefined) {
        if (!Array.isArray(metadata.can_control_sliders)
          || metadata.can_control_sliders.some((field) => ![
            'style_weight', 'weirdness_constraint', 'audio_weight',
          ].includes(String(field)))) {
          return 'metadata.can_control_sliders is invalid';
        }
      }
      if (metadata.control_sliders !== undefined) {
        if (!metadata.control_sliders || typeof metadata.control_sliders !== 'object'
          || Array.isArray(metadata.control_sliders)) {
          return 'metadata.control_sliders must be an object';
        }
        const controls = metadata.control_sliders as Record<string, unknown>;
        const controlKeys = Object.keys(controls).sort();
        const allowedControlKeys = ['style_weight', 'weirdness_constraint', 'audio_weight', 'aug_creativity'];
        if (controlKeys.some((field) => !allowedControlKeys.includes(field))) return 'metadata control slider is invalid';
        if (controlKeys.some((field) => typeof controls[field] !== 'number'
          || !Number.isFinite(controls[field]) || Number(controls[field]) < 0 || (field !== 'aug_creativity' && Number(controls[field]) > 1) || (field === 'aug_creativity' && Number(controls[field]) > 4))) {
          return 'metadata control sliders must be finite numbers between 0 and 1';
        }
        if (controlKeys.includes('audio_weight') && !['upload_extend', 'cover'].includes(String(value.task))) {
          return 'audio_weight is only supported for upload_extend or cover';
        }
      }
    }
    if (value.task === 'extend' || value.task === 'upload_extend') {
      if (typeof value.continue_clip_id !== 'string' || !value.continue_clip_id) return 'continue_clip_id is required';
      if (!Number.isFinite(Number(value.continue_at)) || Number(value.continue_at) < 0) return 'continue_at is invalid';
      return null;
    }
    if (value.task === 'cover') {
      return typeof value.cover_clip_id === 'string' && value.cover_clip_id ? null : 'cover_clip_id is required';
    }
    if (value.task !== undefined) return 'task is invalid';
    const simple = typeof value.gpt_description_prompt === 'string' && Boolean(value.gpt_description_prompt.trim());
    const custom = typeof value.prompt === 'string' && typeof value.tags === 'string' && Boolean(value.tags.trim());
    return simple || custom ? null : 'simple description or custom prompt/tags are required';
  };

  const validateRemasterPayload = (body: unknown): string | null => {
    if (!body || typeof body !== 'object') return 'body must be an object';
    const value = body as Record<string, unknown>;
    if (typeof value.clip_id !== 'string' || !value.clip_id) return 'clip_id is required';
    if (!['chirp-carp', 'chirp-bass', 'chirp-up', 'chirp-flounder'].includes(String(value.model_name))) return 'model_name is invalid';
    const v5OrNewer = value.model_name === 'chirp-carp' || value.model_name === 'chirp-flounder';
    if (v5OrNewer && !['subtle', 'normal', 'high'].includes(String(value.variation_category))) {
      return 'variation_category is invalid';
    }
    if (!v5OrNewer && value.variation_category !== undefined) return 'variation_category is only supported by v5 or newer';
    return null;
  };

  const validateSoundPayload = (body: unknown): string | null => {
    if (!body || typeof body !== 'object' || Array.isArray(body)) return 'body must be an object';
    const value = body as Record<string, unknown>;
    const allowedFields = new Set(['title', 'tags', 'mv', 'tempo', 'key', 'loop']);
    const unknownField = Object.keys(value).find((field) => !allowedFields.has(field));
    if (unknownField) return `sound field ${unknownField} is not supported`;
    if (typeof value.title !== 'string' || !value.title.trim() || value.title.trim().length > 100) {
      return 'title is required and must be at most 100 characters';
    }
    if (typeof value.tags !== 'string' || !value.tags.trim() || value.tags.trim().length > 1000) {
      return 'tags are required and must be at most 1000 characters';
    }
    if (!['chirp-crow', 'chirp-fenix'].includes(String(value.mv))) return 'mv is invalid';
    if (value.tempo !== undefined && (typeof value.tempo !== 'number' || !Number.isFinite(value.tempo))) {
      return 'tempo must be a finite number';
    }
    if (value.key !== undefined && typeof value.key !== 'string') return 'key must be a string';
    if (value.loop !== undefined && typeof value.loop !== 'boolean') return 'loop must be boolean';
    return null;
  };

  app.use((req, res, next) => {
    if (req.path.startsWith('/assets/')) return next();
    requests.push({
      method: req.method,
      path: req.path,
      query: req.query as Record<string, string | string[]>,
      body: req.body,
      auth: req.header('authorization') ?? undefined,
      idempotencyKey: req.header('idempotency-key') ?? undefined,
    });
    if (options.requiredBearer && req.header('authorization') !== `Bearer ${options.requiredBearer}`) {
      return res.status(401).json({ code: 401, message: 'invalid bearer token' });
    }
    next();
  });

  app.post('/api/v2/music/generate', (req, res) => {
    if (options.generateHttpStatus && options.generateHttpStatus !== 200) {
      return res.status(options.generateHttpStatus).json({ code: options.generateCode ?? options.generateHttpStatus, message: 'submit failed' });
    }
    if (options.validateRequests) {
      const error = validateGeneratePayload(req.body);
      if (error) return res.status(400).json({ code: 400, message: error });
    }
    const code = options.generateCode ?? 200;
    res.json(code === 200
      ? { code, data: { task_ids: submittedTaskIds() } }
      : { code, message: 'submit failed', data: null });
  });

  app.post('/api/v2/music/sound', (req, res) => {
    if (options.generateHttpStatus && options.generateHttpStatus !== 200) {
      return res.status(options.generateHttpStatus).json({ code: options.generateCode ?? options.generateHttpStatus, message: 'sound failed' });
    }
    if (options.validateRequests) {
      const error = validateSoundPayload(req.body);
      if (error) return res.status(400).json({ code: 400, message: error });
    }
    const code = options.generateCode ?? 200;
    res.json(code === 200
      ? { code, data: { task_ids: submittedTaskIds() } }
      : { code, message: 'sound failed', data: null });
  });

  app.post('/api/v2/music/upsample', (req, res) => {
    if (options.generateHttpStatus && options.generateHttpStatus !== 200) {
      return res.status(options.generateHttpStatus).json({ code: options.generateCode ?? options.generateHttpStatus, message: 'remaster failed' });
    }
    if (options.validateRequests) {
      const error = validateRemasterPayload(req.body);
      if (error) return res.status(400).json({ code: 400, message: error });
    }
    const code = options.generateCode ?? 200;
    res.json(code === 200
      ? { code, data: { task_ids: submittedTaskIds() } }
      : { code, message: 'remaster failed', data: null });
  });

  for (const endpoint of ['upload', 'whole-song', 'aligned-lyrics', 'video', 'convert-wav', 'download-wav', 'download-mp3', 'download-m4a', 'crop', 'speed']) {
    app.post(`/api/v2/music/${endpoint}`, (_req, res) => {
      res.json({ code: 200, data: { task_id: `${endpoint}-task`, status: 'pending' } });
    });
  }

  const taskResult = (task: FakeTaskSpec) => {
    const count = pollCounts.get(task.taskId) ?? 0;
    const sequence = task.statuses?.length ? task.statuses : [3];
    const status = sequence[Math.min(count, sequence.length - 1)]!;
    pollCounts.set(task.taskId, count + 1);
    const customId = task.customId ?? `clip-${task.taskId}`;
    const resource = {
      id: customId,
      title: task.title ?? task.taskId,
      ...(!task.omitAudio ? { audio_url: `${origin}/assets/${task.taskId}.mp3` } : {}),
      ...(!task.omitCover ? { image_url: `${origin}/assets/${task.taskId}.jpg` } : {}),
      ...(!task.omitVideo ? { video_url: `${origin}/assets/${task.taskId}.mp4` } : {}),
      display_tags: 'dream pop, synthwave',
      model_name: 'chirp-bluejay',
      status: status === 3 ? 'complete' : 'pending',
      metadata: { duration: 123.4, tags: 'dream pop', prompt: 'midnight lights', make_instrumental: false },
    };
    const extend = task.malformedExtend
      ? '{not-json'
      : JSON.stringify([
          ...(task.unrelatedExtendFirst ? [{ ...resource, id: 'wrong-clip', audio_url: `${origin}/assets/wrong.mp3` }] : []),
          resource,
        ]);
    return {
      id: task.providerRecordId,
      task_id: task.taskId,
      status: statusName(status),
      points_cost: task.pointsCost ?? 10,
      points_refunded: task.refunded ?? false,
      result: {
        status,
        progress: status === 1 ? '0%' : status === 2 ? '50%' : '100%',
        custom_id: customId,
        error: status === 4 ? (task.error ?? 'generation failed') : '',
        extend,
        ...(!task.omitFileInfo ? {
          fileInfo: {
            ...(!task.omitAudio ? { mp3Url: `${origin}/assets/${task.taskId}.mp3` } : {}),
            ...(!task.omitCover ? { thumbImg: `${origin}/assets/${task.taskId}.jpg` } : {}),
            ...(!task.omitVideo ? { mp4Url: `${origin}/assets/${task.taskId}.mp4` } : {}),
          },
        } : {}),
      },
    };
  };

  const pollFailure = (res: express.Response): boolean => {
    if (options.pollHttpStatus && options.pollHttpStatus !== 200) {
      res.status(options.pollHttpStatus).json({ code: options.pollCode ?? options.pollHttpStatus, message: 'poll failed' });
      return true;
    }
    if (options.pollCode && options.pollCode !== 200) {
      res.json({ code: options.pollCode, message: 'poll failed', data: null });
      return true;
    }
    return false;
  };

  app.get('/api/v2/music/task', (req, res) => {
    if (pollFailure(res)) return;
    // Mirror the published MXAPI V2 contract exactly. Accepting the historical
    // `task_id` alias here would let a production-client query regression pass
    // every Fake Provider test even though the live endpoint requires `id`.
    const id = String(req.query.id ?? '');
    const task = tasks.get(id);
    if (!task) return res.status(404).json({ code: 404, message: 'task not found' });
    res.json({ code: 200, data: taskResult(task) });
  });

  app.get('/api/v2/music/tasks', (req, res) => {
    if (pollFailure(res)) return;
    const ids = String(req.query.ids ?? '').split(',').filter(Boolean);
    const result = ids.map((id) => tasks.get(id)).filter((task): task is FakeTaskSpec => Boolean(task)).map(taskResult);
    // Return in reverse order on purpose; production code must associate records by task_id.
    res.json({ code: 200, data: { items: result.reverse(), total: result.length, page: Number(req.query.page ?? 1), size: Number(req.query.size ?? 10) } });
  });

  const pointsBalance = (_req: express.Request, res: express.Response) => {
    res.json({ code: 200, data: { remaining_points: options.balance ?? 2048 } });
  };
  // V2 is the documented provider points contract. Keep the old V1 alias in
  // the fake so older standalone-app tests remain useful during migration.
  app.get('/api/v2/points/balance', pointsBalance);
  app.get('/api/v1/points/balance', pointsBalance);
  app.get('/api/v2/points/logs', (req, res) => {
    const rows = options.pointsLogs ?? [];
    const page = Math.max(1, Number(req.query.page ?? 1) || 1);
    const pageSize = Math.min(100, Math.max(1, Number(req.query.pageSize ?? 20) || 20));
    const start = (page - 1) * pageSize;
    res.json({
      code: 200,
      data: {
        list: rows.slice(start, start + pageSize),
        pagination: {
          page,
          pageSize,
          total: rows.length,
          totalPages: rows.length ? Math.ceil(rows.length / pageSize) : 0,
        },
      },
    });
  });

  app.get('/assets/:name', (req, res) => {
    if (options.assetHttpStatus && options.assetHttpStatus !== 200) return res.sendStatus(options.assetHttpStatus);
    const name = req.params.name;
    if (name.endsWith('.mp3')) return res.type('audio/mpeg').send(options.validMedia ? VALID_MP3 : Buffer.from(`ID3-fake-${name}`));
    if (name.endsWith('.jpg')) return options.validMedia
      ? res.type('image/png').send(VALID_COVER)
      : res.type('image/jpeg').send(Buffer.from(`JPEG-fake-${name}`));
    if (name.endsWith('.mp4')) return res.type('video/mp4').send(options.validMedia ? VALID_MP4 : Buffer.from(`MP4-fake-${name}`));
    res.sendStatus(404);
  });

  const server: Server = await new Promise((resolve) => {
    const listening = root.listen(options.port ?? 0, '127.0.0.1', () => resolve(listening));
  });
  const address = server.address() as { port: number };
  origin = `http://127.0.0.1:${address.port}${options.prefix ?? ''}`;

  return {
    url: origin,
    requests,
    tasks,
    pollCounts,
    setStatuses(taskId, statuses) {
      const task = tasks.get(taskId);
      if (!task) throw new Error(`unknown fake task: ${taskId}`);
      task.statuses = statuses;
      pollCounts.set(taskId, 0);
    },
    close: () => new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve())),
  };
}
