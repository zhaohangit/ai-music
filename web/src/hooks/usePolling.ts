import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../api';
import { isInflight, type Health, type Track } from '../types';

const OFFLINE_HEALTH: Health = {
  provider: 'mxapi',
  configured: false,
  upstreamReachable: false,
  ready: false,
  active: 0,
  queued: 0,
  balance: null,
  models: [],
  error: '本地服务不可访问',
};

export function useHealth(intervalMs = 5000) {
  const [health, setHealth] = useState<Health | null>(null);
  useEffect(() => {
    let alive = true;
    const run = () => api.health().then((h) => alive && setHealth(h)).catch(() => alive && setHealth(OFFLINE_HEALTH));
    run();
    const t = setInterval(run, intervalMs);
    return () => { alive = false; clearInterval(t); };
  }, [intervalMs]);
  return health;
}

/** Polls the local library; the server owns MXAPI polling and persistence. */
export function useLibrary(enabled = true) {
  const [tracks, setTracks] = useState<Track[]>([]);
  const [error, setError] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const alive = useRef(true);
  const requestId = useRef(0);
  const refreshRef = useRef<() => Promise<void>>(async () => undefined);

  const schedule = useCallback((ms: number) => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => void refreshRef.current(), ms);
  }, []);

  const refresh = useCallback(async () => {
    if (!enabled) return;
    const id = ++requestId.current;
    try {
      const list = await api.library();
      if (!alive.current || id !== requestId.current) return;
      setTracks(list);
      setError(null);
      schedule(list.some(isInflight) ? (document.hidden ? 5000 : 1500) : 10000);
    } catch (err) {
      if (!alive.current || id !== requestId.current) return;
      setError((err as Error).message);
      schedule(5000);
    }
  }, [enabled, schedule]);

  useEffect(() => { refreshRef.current = refresh; }, [refresh]);

  useEffect(() => {
    alive.current = true;
    if (!enabled) {
      if (timer.current) clearTimeout(timer.current);
      setTracks([]);
      setError(null);
      return () => { alive.current = false; };
    }
    void refresh();
    return () => { alive.current = false; if (timer.current) clearTimeout(timer.current); };
  }, [enabled, refresh]);

  return { tracks, error, refresh, setTracks };
}
