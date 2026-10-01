import path from 'node:path';

export interface Config {
  /** SUNO_API_BASE_URL from env, or null when settings/default should apply. */
  apiBaseUrlEnv: string | null;
  /** SUNO_API_KEY from env, or null when settings should apply. */
  apiKeyEnv: string | null;
  host: string;
  port: number;
  dataDir: string;
  staticDir: string | null;
  pollIntervalMs: number;
  requestTimeoutMs: number;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const port = Number(env.PORT ?? 8787);
  if (!Number.isInteger(port) || port <= 0 || port > 65_535) throw new Error(`Invalid PORT: ${env.PORT}`);
  const host = env.HOST?.trim() || '127.0.0.1';
  const pollIntervalMs = Number(env.SUNO_POLL_INTERVAL_MS ?? 4000);
  if (!Number.isInteger(pollIntervalMs) || pollIntervalMs < 250) {
    throw new Error(`Invalid SUNO_POLL_INTERVAL_MS: ${env.SUNO_POLL_INTERVAL_MS}`);
  }
  const requestTimeoutMs = Number(env.SUNO_REQUEST_TIMEOUT_MS ?? 30_000);
  if (!Number.isInteger(requestTimeoutMs) || requestTimeoutMs < 250) {
    throw new Error(`Invalid SUNO_REQUEST_TIMEOUT_MS: ${env.SUNO_REQUEST_TIMEOUT_MS}`);
  }
  return {
    apiBaseUrlEnv: env.SUNO_API_BASE_URL?.trim()
      ? env.SUNO_API_BASE_URL.trim().replace(/\/+$/, '')
      : null,
    apiKeyEnv: env.SUNO_API_KEY?.trim() || null,
    host,
    port,
    dataDir: path.resolve(env.DATA_DIR ?? './data'),
    staticDir: env.STATIC_DIR ? path.resolve(env.STATIC_DIR) : null,
    pollIntervalMs,
    requestTimeoutMs,
  };
}
