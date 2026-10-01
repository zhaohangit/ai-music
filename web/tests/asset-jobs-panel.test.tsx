import axe from 'axe-core';
import { render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AssetJobsPanel } from '../src/components/AssetJobsPanel';
import type { AssetJob } from '../src/types';
import { makeTrack } from './track-fixture';

class TestEventSource {
  static current: TestEventSource | null = null;
  onopen: ((event: Event) => unknown) | null = null;
  onerror: ((event: Event) => unknown) | null = null;
  private listeners = new Map<string, Set<EventListener>>();

  constructor(readonly url: string) {
    TestEventSource.current = this;
    queueMicrotask(() => this.onopen?.(new Event('open')));
  }

  addEventListener(type: string, listener: EventListenerOrEventListenerObject | null) {
    if (typeof listener !== 'function') return;
    const values = this.listeners.get(type) ?? new Set<EventListener>();
    values.add(listener);
    this.listeners.set(type, values);
  }

  removeEventListener(type: string, listener: EventListenerOrEventListenerObject | null) {
    if (typeof listener === 'function') this.listeners.get(type)?.delete(listener);
  }

  emit(type: string) {
    this.listeners.get(type)?.forEach((listener) => listener(new MessageEvent(type, { data: '{}' })));
  }

  close() {
    this.listeners.clear();
    if (TestEventSource.current === this) TestEventSource.current = null;
  }
}

const queued: AssetJob = {
  id: 'asset-job-1', trackId: 'track-1', action: 'video', status: 'queued', progress: 0.1, billingStatus: 'reserved',
};
const completed: AssetJob = {
  ...queued, status: 'completed', progress: 1, assetUrl: 'https://provider.example/unsafe-video.mp4', billingStatus: 'captured',
};

describe('AssetJobsPanel', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    TestEventSource.current = null;
  });

  it('restores jobs from the server and refreshes them through SSE without exposing Provider URLs', async () => {
    let response: Array<Record<string, unknown>> = [queued];
    const fetchMock = vi.fn().mockImplementation(() => Promise.resolve(new Response(JSON.stringify(response), {
      status: 200, headers: { 'Content-Type': 'application/json' },
    })));
    vi.stubGlobal('fetch', fetchMock);
    vi.stubGlobal('EventSource', TestEventSource);
    render(<AssetJobsPanel track={makeTrack()} />);

    expect(await screen.findByText('排队中')).toBeInTheDocument();
    expect(screen.getByRole('progressbar', { name: '音乐视频进度' })).toHaveAttribute('aria-valuenow', '10');
    // PostgreSQL/API raw lifecycle uses `succeeded`; the Web API boundary must normalize it
    // to the panel's terminal `completed` state.
    response = [{ ...completed, status: 'succeeded' }];
    TestEventSource.current?.emit('track.asset.completed');

    const view = await screen.findByRole('link', { name: '查看视频' });
    expect(view).toHaveAttribute('href', '/api/tracks/track-1/video');
    expect(screen.getByRole('link', { name: '下载视频' })).toHaveAttribute('href', '/api/tracks/track-1/video?download=1');
    expect(screen.queryByRole('progressbar', { name: '音乐视频进度' })).not.toBeInTheDocument();
    expect(document.body.innerHTML).not.toContain('provider.example');
    expect(fetchMock).toHaveBeenCalledWith('/api/tracks/track-1/assets/jobs', expect.objectContaining({ credentials: 'include' }));
  });

  it('shows aligned lyrics from a completed persisted result and safe same-origin downloads', async () => {
    vi.stubGlobal('EventSource', undefined);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify([{
      id: 'lyrics-job', trackId: 'track-1', action: 'aligned_lyrics', status: 'completed', progress: 1,
      billingStatus: 'captured', result: { alignedLyrics: '[00:01.20] 海风吹过' },
    }]), { status: 200, headers: { 'Content-Type': 'application/json' } })));
    render(<AssetJobsPanel track={makeTrack()} />);

    expect(await screen.findByText('[00:01.20] 海风吹过')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '查看逐字歌词' })).toHaveAttribute('href', '/api/tracks/track-1/aligned-lyrics');
    expect(screen.getByRole('link', { name: '下载逐字歌词' })).toHaveAttribute('href', '/api/tracks/track-1/aligned-lyrics?download=1');
    await waitFor(() => expect(screen.getByText('已完成')).toBeInTheDocument());
  });

  it('has no serious or critical axe violations after persisted assets load', async () => {
    vi.stubGlobal('EventSource', undefined);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify([completed]), {
      status: 200, headers: { 'Content-Type': 'application/json' },
    })));
    const { container } = render(<AssetJobsPanel track={makeTrack()} />);
    await screen.findByText('已完成');
    const results = await axe.run(container);
    expect(results.violations.filter((violation) => violation.impact === 'serious' || violation.impact === 'critical')).toEqual([]);
  });
});
