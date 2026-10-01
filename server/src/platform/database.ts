import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import pg, { type PoolClient, type QueryResult, type QueryResultRow } from 'pg';

export interface DatabaseClient {
  query<R extends QueryResultRow = QueryResultRow>(text: string, values?: readonly unknown[]): Promise<QueryResult<R>>;
}

export interface PoolLike extends DatabaseClient {
  connect(): Promise<PoolClient>;
  end(): Promise<void>;
}

const sourceDirectory = path.dirname(fileURLToPath(import.meta.url));

export class PlatformDatabase {
  readonly pool: PoolLike;

  constructor(databaseUrlOrPool: string | PoolLike) {
    if (typeof databaseUrlOrPool === 'string') {
      this.pool = new pg.Pool({
        connectionString: databaseUrlOrPool,
        max: Number(process.env.DATABASE_POOL_SIZE ?? 12),
        connectionTimeoutMillis: 10_000,
        idleTimeoutMillis: 30_000,
        allowExitOnIdle: false,
      }) as unknown as PoolLike;
    } else {
      this.pool = databaseUrlOrPool;
    }
  }

  query<R extends QueryResultRow = QueryResultRow>(text: string, values?: readonly unknown[]): Promise<QueryResult<R>> {
    return this.pool.query<R>(text, values);
  }

  async transaction<T>(run: (client: DatabaseClient) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const result = await run(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  async migrate(directory = path.resolve(sourceDirectory, '../../migrations')): Promise<string[]> {
    const lockClient = await this.pool.connect();
    let locked = false;
    try {
      try {
        await lockClient.query(`SELECT pg_advisory_lock(hashtext('museflow-platform-migrations'))`);
        locked = true;
      } catch (error) {
        // Lightweight test adapters such as pg-mem do not implement advisory
        // locks. Production PostgreSQL does, and any other failure remains fatal.
        if ((error as { code?: string }).code !== '42883') throw error;
      }
      await this.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
        name TEXT PRIMARY KEY,
        checksum TEXT NOT NULL,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )`);
      const names = (await fs.readdir(directory)).filter((name) => /^\d+.*\.sql$/.test(name)).sort();
      const applied: string[] = [];
      for (const name of names) {
        const sql = await fs.readFile(path.join(directory, name), 'utf8');
        const checksum = createHash('sha256').update(sql).digest('hex');
        const existing = await this.query<{ checksum: string }>('SELECT checksum FROM schema_migrations WHERE name = $1', [name]);
        if (existing.rows[0]) {
          if (existing.rows[0].checksum !== checksum) throw new Error(`migration checksum changed after apply: ${name}`);
          continue;
        }
        await this.transaction(async (client) => {
          await client.query(sql);
          await client.query('INSERT INTO schema_migrations(name, checksum) VALUES ($1, $2)', [name, checksum]);
        });
        applied.push(name);
      }
      return applied;
    } finally {
      if (locked) await lockClient.query(`SELECT pg_advisory_unlock(hashtext('museflow-platform-migrations'))`).catch(() => undefined);
      lockClient.release();
    }
  }

  async ready(): Promise<boolean> {
    try {
      const result = await this.query<{ ok: number }>('SELECT 1 AS ok');
      return result.rows[0]?.ok === 1;
    } catch {
      return false;
    }
  }

  close(): Promise<void> {
    return this.pool.end();
  }
}
