import fs from 'node:fs/promises';
import path from 'node:path';
import { ValidationError } from './validate.js';

export interface StoredSettings {
  apiBaseUrl: string | null;
  apiKey: string | null;
}

export interface EnvOverrides {
  apiBaseUrl: string | null;
  apiKey: string | null;
}

export interface EffectiveUpstream {
  apiBaseUrl: string;
  apiKey: string | null;
  source: {
    apiBaseUrl: 'env' | 'settings' | 'default';
    apiKey: 'env' | 'settings' | 'none';
  };
}

export const DEFAULT_API_BASE_URL = 'https://open.mxapi.org';

export function normalizeApiBaseUrl(v: unknown): string {
  if (typeof v !== 'string' || !v.trim()) throw new ValidationError('apiBaseUrl is required');
  let url: URL;
  try {
    url = new URL(v.trim());
  } catch {
    throw new ValidationError('apiBaseUrl must be a valid URL');
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new ValidationError('apiBaseUrl must be http or https');
  }
  if (url.username || url.password) {
    throw new ValidationError('apiBaseUrl must not contain credentials');
  }
  if (url.search || url.hash) {
    throw new ValidationError('apiBaseUrl must not contain a query string or fragment');
  }
  return url.toString().replace(/\/+$/, '');
}

/** Persists user-editable upstream settings; env vars always win over stored values. */
export class SettingsStore {
  private stored: StoredSettings = { apiBaseUrl: null, apiKey: null };
  private writing: Promise<void> = Promise.resolve();

  constructor(private readonly file: string, private readonly env: EnvOverrides) {}

  async load(): Promise<void> {
    try {
      const raw = JSON.parse(await fs.readFile(this.file, 'utf8')) as Partial<StoredSettings> & {
        /** Read-only migration path from the MiniMax UI settings schema. */
        musicApi?: unknown;
      };
      this.stored = {
        apiBaseUrl: typeof raw.apiBaseUrl === 'string' && raw.apiBaseUrl
          ? normalizeApiBaseUrl(raw.apiBaseUrl)
          : typeof raw.musicApi === 'string' && raw.musicApi
            ? normalizeApiBaseUrl(raw.musicApi)
            : null,
        apiKey: typeof raw.apiKey === 'string' && raw.apiKey.trim() ? raw.apiKey.trim() : null,
      };
      await fs.chmod(this.file, 0o600);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
    }
  }

  effective(): EffectiveUpstream {
    const apiBaseUrl = this.env.apiBaseUrl !== null
      ? normalizeApiBaseUrl(this.env.apiBaseUrl)
      : this.stored.apiBaseUrl ?? DEFAULT_API_BASE_URL;
    const apiKey = this.env.apiKey ?? this.stored.apiKey;
    return {
      apiBaseUrl,
      apiKey,
      source: {
        apiBaseUrl: this.env.apiBaseUrl ? 'env' : this.stored.apiBaseUrl ? 'settings' : 'default',
        apiKey: this.env.apiKey ? 'env' : this.stored.apiKey ? 'settings' : 'none',
      },
    };
  }

  /** What the UI may see: never the key itself. */
  publicView() {
    const e = this.effective();
    return {
      apiBaseUrl: e.apiBaseUrl,
      apiKeySet: !!e.apiKey,
      source: e.source,
      locked: { apiBaseUrl: this.env.apiBaseUrl !== null, apiKey: this.env.apiKey !== null },
    };
  }

  /**
   * Update stored values. `apiKey: ""` clears it; `undefined` normally leaves
   * it alone, except that a cross-origin provider change clears a stored key.
   */
  async update(patch: { apiBaseUrl?: unknown; apiKey?: unknown }): Promise<void> {
    const previous = this.effective();
    const next: StoredSettings = { ...this.stored };
    if (patch.apiBaseUrl !== undefined) {
      if (this.env.apiBaseUrl !== null) {
        throw new ValidationError('SUNO_API_BASE_URL is set in the environment and cannot be changed here');
      }
      next.apiBaseUrl = normalizeApiBaseUrl(patch.apiBaseUrl);
    }
    if (patch.apiKey !== undefined) {
      if (this.env.apiKey !== null) {
        throw new ValidationError('SUNO_API_KEY is set in the environment and cannot be changed here');
      }
      if (typeof patch.apiKey !== 'string') throw new ValidationError('apiKey must be a string');
      next.apiKey = patch.apiKey.trim() || null;
    }

    const nextApiBaseUrl = this.env.apiBaseUrl ?? next.apiBaseUrl ?? DEFAULT_API_BASE_URL;
    if (new URL(nextApiBaseUrl).origin !== new URL(previous.apiBaseUrl).origin) {
      if (this.env.apiKey !== null) {
        throw new ValidationError('apiBaseUrl cannot change origin while SUNO_API_KEY is set in the environment');
      }
      // Never carry an existing secret to a newly selected provider. The user
      // must explicitly enter a key for the new origin, or it is cleared.
      if (patch.apiKey === undefined) next.apiKey = null;
    }
    this.stored = next;
    await this.persist();
  }

  private persist(): Promise<void> {
    const snapshot = JSON.stringify(this.stored, null, 2);
    const operation = this.writing.catch(() => undefined).then(async () => {
      await fs.mkdir(path.dirname(this.file), { recursive: true });
      const tmp = `${this.file}.${process.pid}.tmp`;
      await fs.writeFile(tmp, snapshot, { encoding: 'utf8', mode: 0o600 });
      await fs.rename(tmp, this.file);
    });
    this.writing = operation.catch(() => undefined);
    return operation;
  }
}
