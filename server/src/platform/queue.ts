import { EventEmitter } from 'node:events';
import { createHash } from 'node:crypto';
import { Queue, Worker, type Job } from 'bullmq';
import { Redis } from 'ioredis';
import type { PlatformConfig } from './config.js';

export type PlatformJobName =
  | 'music.poll'
  | 'music.poll-all'
  | 'billing.reconcile'
  | 'storage.reconcile'
  | 'outbox.dispatch';

export interface PlatformJob<T = Record<string, unknown>> {
  name: PlatformJobName;
  data: T;
  id?: string;
  attemptsMade: number;
}

export type PlatformJobProcessor = (job: PlatformJob) => Promise<void>;

export interface PlatformQueue {
  start(processor: PlatformJobProcessor): Promise<void>;
  add(name: PlatformJobName, data?: Record<string, unknown>, options?: { delayMs?: number; jobId?: string }): Promise<void>;
  ready(): Promise<boolean>;
  close(): Promise<void>;
}

export class InlinePlatformQueue implements PlatformQueue {
  private processor: PlatformJobProcessor | null = null;
  private closed = false;
  private readonly timers = new Set<NodeJS.Timeout>();
  private readonly scheduled = new Set<string>();
  private readonly pending = new Map<string, Promise<void>>();

  async start(processor: PlatformJobProcessor): Promise<void> {
    this.processor = processor;
  }

  async add(name: PlatformJobName, data: Record<string, unknown> = {}, options: { delayMs?: number; jobId?: string } = {}): Promise<void> {
    if (this.closed) throw new Error('queue is closed');
    const id = options.jobId ?? `${name}:${Date.now()}:${Math.random()}`;
    if (this.scheduled.has(id) || this.pending.has(id)) return;
    this.scheduled.add(id);
    const execute = async (): Promise<void> => {
      this.timers.delete(timer);
      this.scheduled.delete(id);
      if (!this.processor || this.closed) return;
      const promise = this.processor({ name, data, id, attemptsMade: 0 });
      this.pending.set(id, promise);
      try { await promise; } finally { this.pending.delete(id); }
    };
    const timer = setTimeout(() => void execute(), Math.max(0, options.delayMs ?? 0));
    timer.unref?.();
    this.timers.add(timer);
  }

  async ready(): Promise<boolean> {
    return !this.closed;
  }

  async drain(): Promise<void> {
    await Promise.all([...this.pending.values()]);
  }

  async close(): Promise<void> {
    this.closed = true;
    for (const timer of this.timers) clearTimeout(timer);
    this.timers.clear();
    this.scheduled.clear();
    await this.drain();
  }
}

export class BullPlatformQueue implements PlatformQueue {
  private readonly connection: Redis;
  private readonly queue: Queue;
  private readonly queueName = 'museflow-jobs';
  private worker: Worker | null = null;

  constructor(private readonly config: PlatformConfig) {
    this.connection = new Redis(config.redisUrl!, {
      maxRetriesPerRequest: null,
      enableReadyCheck: true,
      lazyConnect: true,
      keyPrefix: '',
    });
    this.queue = new Queue(this.queueName, {
      connection: this.connection,
      prefix: config.queue.prefix,
      defaultJobOptions: {
        attempts: 8,
        backoff: { type: 'exponential', delay: 1500 },
        removeOnComplete: { age: 3600, count: 1000 },
        removeOnFail: { age: 7 * 24 * 3600, count: 5000 },
      },
    });
  }

  async start(processor: PlatformJobProcessor): Promise<void> {
    if (this.connection.status === 'wait') await this.connection.connect();
    if (this.worker) return;
    const workerConnection = this.connection.duplicate({ maxRetriesPerRequest: null });
    this.worker = new Worker(this.queueName, async (job: Job) => {
      await processor({
        name: job.name as PlatformJobName,
        data: job.data as Record<string, unknown>,
        id: job.id,
        attemptsMade: job.attemptsMade,
      });
    }, {
      connection: workerConnection,
      prefix: this.config.queue.prefix,
      concurrency: this.config.queue.concurrency,
    });
    this.worker.on('error', (error) => console.error(JSON.stringify({ level: 'error', event: 'worker.error', error: error.message })));
  }

  async add(name: PlatformJobName, data: Record<string, unknown> = {}, options: { delayMs?: number; jobId?: string } = {}): Promise<void> {
    await this.queue.add(name, data, {
      delay: options.delayMs,
      // BullMQ 6 rejects ':' in custom ids. Hashing preserves deterministic
      // de-duplication across API/worker processes without leaking user ids.
      jobId: options.jobId ? createHash('sha256').update(options.jobId).digest('hex') : undefined,
    });
  }

  async ready(): Promise<boolean> {
    try {
      await this.queue.waitUntilReady();
      return (await this.connection.ping()) === 'PONG';
    } catch {
      return false;
    }
  }

  async close(): Promise<void> {
    await this.worker?.close();
    await this.queue.close();
    await this.connection.quit().catch(() => undefined);
  }
}

export interface PlatformEvent {
  /** Stable id for transactional-outbox events; absent for ephemeral progress events. */
  id?: string;
  type: string;
  subject: string;
  resourceId?: string;
  payload: Record<string, unknown>;
  at: string;
}

export class PlatformEventBus {
  private readonly emitter = new EventEmitter();
  private publisher: Redis | null = null;
  private subscriber: Redis | null = null;
  private readonly channel: string;

  constructor(private readonly config: PlatformConfig) {
    this.channel = `${config.queue.prefix}:events`;
    this.emitter.setMaxListeners(500);
  }

  async start(): Promise<void> {
    if (!this.config.redisUrl) return;
    this.publisher = new Redis(this.config.redisUrl, { maxRetriesPerRequest: 2, lazyConnect: true });
    this.subscriber = this.publisher.duplicate();
    await Promise.all([this.publisher.connect(), this.subscriber.connect()]);
    await this.subscriber.subscribe(this.channel);
    this.subscriber.on('message', (_channel: string, raw: string) => {
      try { this.emitter.emit('event', JSON.parse(raw) as PlatformEvent); } catch { /* ignore malformed cross-process data */ }
    });
  }

  subscribe(listener: (event: PlatformEvent) => void): () => void {
    this.emitter.on('event', listener);
    return () => this.emitter.off('event', listener);
  }

  async publish(event: Omit<PlatformEvent, 'at'>): Promise<void> {
    const full: PlatformEvent = { ...event, at: new Date().toISOString() };
    if (this.publisher) await this.publisher.publish(this.channel, JSON.stringify(full));
    else this.emitter.emit('event', full);
  }

  async ready(): Promise<boolean> {
    if (!this.publisher) return true;
    try { return (await this.publisher.ping()) === 'PONG'; } catch { return false; }
  }

  async close(): Promise<void> {
    this.emitter.removeAllListeners();
    await Promise.all([
      this.subscriber?.quit().catch(() => undefined),
      this.publisher?.quit().catch(() => undefined),
    ]);
  }
}

export function createPlatformQueue(config: PlatformConfig): PlatformQueue {
  return config.queue.driver === 'bullmq' ? new BullPlatformQueue(config) : new InlinePlatformQueue();
}
