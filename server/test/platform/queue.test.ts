import { afterEach, describe, expect, it, vi } from 'vitest';
import { InlinePlatformQueue, PlatformEventBus } from '../../src/platform/queue.js';
import { testConfig } from './helpers.js';

afterEach(() => {
  vi.useRealTimers();
});

describe('inline platform queue', () => {
  it('coalesces concurrent additions with the same deterministic job id', async () => {
    vi.useFakeTimers();
    const queue = new InlinePlatformQueue();
    const processed = vi.fn(async () => undefined);
    await queue.start(processed);

    await Promise.all([
      queue.add('music.poll', { generationId: 'generation-1' }, { jobId: 'poll:generation-1' }),
      queue.add('music.poll', { generationId: 'generation-1' }, { jobId: 'poll:generation-1' }),
      queue.add('music.poll', { generationId: 'generation-1' }, { jobId: 'poll:generation-1' }),
    ]);
    await vi.runAllTimersAsync();
    await queue.drain();

    expect(processed).toHaveBeenCalledTimes(1);
    expect(processed).toHaveBeenCalledWith({
      name: 'music.poll', data: { generationId: 'generation-1' }, id: 'poll:generation-1', attemptsMade: 0,
    });
    await queue.close();
  });

  it('runs distinct jobs, honors delay, and rejects additions after close', async () => {
    vi.useFakeTimers();
    const queue = new InlinePlatformQueue();
    const names: string[] = [];
    await queue.start(async (job) => { names.push(`${job.name}:${job.id}`); });
    await queue.add('music.poll', {}, { jobId: 'first', delayMs: 50 });
    await queue.add('billing.reconcile', {}, { jobId: 'second', delayMs: 100 });

    await vi.advanceTimersByTimeAsync(49);
    expect(names).toEqual([]);
    await vi.advanceTimersByTimeAsync(1);
    expect(names).toEqual(['music.poll:first']);
    await vi.advanceTimersByTimeAsync(50);
    expect(names).toEqual(['music.poll:first', 'billing.reconcile:second']);

    await queue.close();
    await expect(queue.add('music.poll')).rejects.toThrow('queue is closed');
  });

  it('cancels delayed work on close', async () => {
    vi.useFakeTimers();
    const queue = new InlinePlatformQueue();
    const processed = vi.fn(async () => undefined);
    await queue.start(processed);
    await queue.add('music.poll-all', {}, { jobId: 'future', delayMs: 10_000 });
    await queue.close();
    await vi.runAllTimersAsync();
    expect(processed).not.toHaveBeenCalled();
  });
});

describe('local event bus', () => {
  it('timestamps events and stops delivery immediately after unsubscribe', async () => {
    const bus = new PlatformEventBus(testConfig());
    await bus.start();
    const received: unknown[] = [];
    const unsubscribe = bus.subscribe((event) => received.push(event));
    await bus.publish({
      type: 'generation.submitted', subject: 'owner-a', resourceId: 'generation-1',
      payload: { trackIds: ['track-a', 'track-b'] },
    });
    unsubscribe();
    await bus.publish({ type: 'generation.failed', subject: 'owner-a', payload: {} });

    expect(received).toHaveLength(1);
    expect(received[0]).toMatchObject({
      type: 'generation.submitted', subject: 'owner-a', resourceId: 'generation-1',
      payload: { trackIds: ['track-a', 'track-b'] }, at: expect.any(String),
    });
    expect(await bus.ready()).toBe(true);
    await bus.close();
  });
});
