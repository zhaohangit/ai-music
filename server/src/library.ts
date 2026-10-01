import fs from 'node:fs/promises';
import path from 'node:path';
import type { Track } from './types.js';

/** Generic append-at-front JSON array store with atomic writes. */
export class JsonStore<T extends { id: string }> {
  private tracks: T[] = [];
  private writing: Promise<void> = Promise.resolve();

  constructor(private readonly file: string) {}

  async load(): Promise<void> {
    try {
      const raw = await fs.readFile(this.file, 'utf8');
      const parsed = JSON.parse(raw);
      this.tracks = Array.isArray(parsed) ? parsed : [];
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
        this.tracks = [];
        return;
      }
      throw err;
    }
  }

  all(): T[] {
    return this.tracks;
  }

  get(id: string): T | undefined {
    return this.tracks.find((t) => t.id === id);
  }

  async add(track: T): Promise<T> {
    this.tracks.unshift(track);
    await this.persist();
    return track;
  }

  /** Add a generated batch with a single atomic snapshot. */
  async addMany(tracks: T[]): Promise<T[]> {
    if (!tracks.length) return [];
    this.tracks.unshift(...tracks);
    await this.persist();
    return tracks;
  }

  async update(id: string, patch: Partial<T>): Promise<T | undefined> {
    const idx = this.tracks.findIndex((t) => t.id === id);
    if (idx === -1) return undefined;
    this.tracks[idx] = { ...this.tracks[idx], ...patch };
    await this.persist();
    return this.tracks[idx];
  }

  /** Apply a polling batch with one disk write. Unknown ids are ignored. */
  async updateMany(changes: Array<{ id: string; patch: Partial<T> }>): Promise<T[]> {
    const updated: T[] = [];
    for (const { id, patch } of changes) {
      const idx = this.tracks.findIndex((track) => track.id === id);
      if (idx === -1) continue;
      this.tracks[idx] = { ...this.tracks[idx], ...patch };
      updated.push(this.tracks[idx]);
    }
    if (updated.length) await this.persist();
    return updated;
  }

  async remove(id: string): Promise<T | undefined> {
    const idx = this.tracks.findIndex((t) => t.id === id);
    if (idx === -1) return undefined;
    const [removed] = this.tracks.splice(idx, 1);
    await this.persist();
    return removed;
  }

  private persist(): Promise<void> {
    const snapshot = JSON.stringify(this.tracks, null, 2);
    const operation = this.writing.catch(() => undefined).then(async () => {
      await fs.mkdir(path.dirname(this.file), { recursive: true });
      const tmp = `${this.file}.${process.pid}.tmp`;
      await fs.writeFile(tmp, snapshot, 'utf8');
      await fs.rename(tmp, this.file);
    });
    // A transient I/O failure is returned to this caller without permanently
    // poisoning every later write queued by the process.
    this.writing = operation.catch(() => undefined);
    return operation;
  }
}

export class Library extends JsonStore<Track> {}
