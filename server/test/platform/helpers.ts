import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { loadPlatformConfig, type PlatformConfig } from '../../src/platform/config.js';
import { PlatformDatabase, type DatabaseClient, type PoolLike } from '../../src/platform/database.js';
import { SessionRefreshRejectedError } from '../../src/platform/repository.js';
import type {
  AuthTransaction,
  PlatformRepository,
  RawSessionRow,
  SessionRefreshUpdate,
  StoredSessionSecrets,
} from '../../src/platform/repository.js';
import type { PlatformUser } from '../../src/platform/types.js';

export const BASE_DEVELOPMENT_ENV: NodeJS.ProcessEnv = {
  NODE_ENV: 'development',
  PLATFORM_MODE: 'true',
  PUBLIC_URL: 'http://127.0.0.1:8787',
  DATABASE_URL: 'postgres://museflow:museflow@127.0.0.1:5432/museflow',
  AUTH_MODE: 'development',
  QUEUE_DRIVER: 'inline',
  STORAGE_DRIVER: 'local',
  OBJECT_STORAGE_LOCAL_DIR: './data/test-objects',
  MUSEFLOW_SESSION_SECRET: 'test-session-secret-with-more-than-32-characters',
  MODELCROSS_OIDC_ISSUER: 'http://127.0.0.1:3000',
  MODELCROSS_BASE_URL: 'http://127.0.0.1:3000',
  MODELCROSS_OIDC_CLIENT_ID: 'museflow-test',
  MODELCROSS_OIDC_CLIENT_SECRET: 'modelcross-test-client-secret',
};

export function testConfig(env: NodeJS.ProcessEnv = {}): PlatformConfig {
  return loadPlatformConfig({ ...BASE_DEVELOPMENT_ENV, ...env });
}

interface MutableSessionRow extends RawSessionRow {
  revoked_at: Date | null;
}

/**
 * Deliberately small in-memory repository for SessionManager unit tests.
 * It stores the same hashed/encrypted values as the SQL repository so tests
 * can assert that browser cookies and upstream tokens are never persisted in
 * plaintext.
 */
export class MemorySessionRepository {
  readonly identities = new Map<string, PlatformUser>();
  readonly sessions = new Map<string, MutableSessionRow>();
  readonly authTransactions = new Map<string, AuthTransaction>();
  private readonly sessionRefreshTails = new Map<string, Promise<void>>();

  async upsertIdentity(user: PlatformUser): Promise<void> {
    this.identities.set(user.subject, structuredClone(user));
  }

  async getIdentity(subject: string): Promise<PlatformUser | null> {
    return this.identities.get(subject) ?? null;
  }

  async storeAuthTransaction(transaction: AuthTransaction): Promise<void> {
    this.authTransactions.set(transaction.stateHash, { ...transaction });
  }

  async takeAuthTransaction(stateHash: string): Promise<AuthTransaction | null> {
    const transaction = this.authTransactions.get(stateHash);
    this.authTransactions.delete(stateHash);
    return transaction && transaction.expiresAt.getTime() > Date.now() ? transaction : null;
  }

  async purgeExpiredAuthTransactions(): Promise<number> {
    let purged = 0;
    for (const [stateHash, transaction] of this.authTransactions) {
      if (transaction.expiresAt.getTime() <= Date.now()) {
        this.authTransactions.delete(stateHash);
        purged += 1;
      }
    }
    return purged;
  }

  async purgeExpiredSessions(): Promise<number> {
    let purged = 0;
    const revokedBefore = Date.now() - 24 * 60 * 60_000;
    for (const [tokenHash, session] of this.sessions) {
      if (session.refresh_expires_at.getTime() <= Date.now()
        || (session.revoked_at?.getTime() ?? Number.POSITIVE_INFINITY) < revokedBefore) {
        this.sessions.delete(tokenHash);
        purged += 1;
      }
    }
    return purged;
  }

  async createSession(session: StoredSessionSecrets): Promise<void> {
    const user = this.identities.get(session.subject);
    if (!user) throw new Error('identity not found');
    this.sessions.set(session.tokenHash, {
      token_hash: session.tokenHash,
      subject: session.subject,
      client_id: session.clientId,
      access_token_ciphertext: session.accessTokenCiphertext,
      refresh_token_ciphertext: session.refreshTokenCiphertext,
      id_token_ciphertext: session.idTokenCiphertext,
      access_expires_at: session.accessExpiresAt,
      refresh_expires_at: session.refreshExpiresAt,
      revoked_at: null,
      issuer: user.issuer,
      modelcross_user_id: user.modelCrossUserId,
      email: user.email,
      email_verified: user.emailVerified,
      display_name: user.displayName,
      avatar_url: user.avatarUrl,
      roles: [...user.roles],
    });
  }

  async getSessionRow(tokenHash: string): Promise<RawSessionRow | null> {
    const row = this.sessions.get(tokenHash);
    if (!row || row.revoked_at || row.refresh_expires_at.getTime() <= Date.now()) return null;
    return row;
  }

  async refreshSessionAtomically(
    tokenHash: string,
    refreshBefore: Date,
    refresh: (row: RawSessionRow) => Promise<SessionRefreshUpdate>,
  ): Promise<RawSessionRow | null> {
    const previous = this.sessionRefreshTails.get(tokenHash) ?? Promise.resolve();
    let release = (): void => undefined;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const tail = previous.then(() => gate);
    this.sessionRefreshTails.set(tokenHash, tail);
    await previous;
    try {
      const row = this.sessions.get(tokenHash);
      if (!row || row.revoked_at || row.refresh_expires_at.getTime() <= Date.now()) return null;
      if (row.access_expires_at.getTime() > refreshBefore.getTime()) return row;
      let update: SessionRefreshUpdate;
      try {
        update = await refresh(row);
      } catch (error) {
        if (!(error instanceof SessionRefreshRejectedError)) throw error;
        row.revoked_at = new Date();
        return null;
      }
      if (update.user.subject !== row.subject || update.user.issuer !== row.issuer) {
        row.revoked_at = new Date();
        return null;
      }
      this.identities.set(update.user.subject, structuredClone(update.user));
      Object.assign(row, {
        access_token_ciphertext: update.accessTokenCiphertext,
        refresh_token_ciphertext: update.refreshTokenCiphertext,
        id_token_ciphertext: update.idTokenCiphertext,
        access_expires_at: update.accessExpiresAt,
        refresh_expires_at: update.refreshExpiresAt,
        issuer: update.user.issuer,
        modelcross_user_id: update.user.modelCrossUserId,
        email: update.user.email,
        email_verified: update.user.emailVerified,
        display_name: update.user.displayName,
        avatar_url: update.user.avatarUrl,
        roles: [...update.user.roles],
      });
      return row;
    } finally {
      release();
      if (this.sessionRefreshTails.get(tokenHash) === tail) this.sessionRefreshTails.delete(tokenHash);
    }
  }

  sessionUser(row: RawSessionRow): PlatformUser {
    return {
      subject: row.subject,
      issuer: row.issuer,
      modelCrossUserId: row.modelcross_user_id,
      email: row.email,
      emailVerified: row.email_verified,
      displayName: row.display_name,
      avatarUrl: row.avatar_url,
      roles: [...row.roles],
    };
  }

  async updateSessionTokens(tokenHash: string, patch: {
    accessTokenCiphertext: string;
    refreshTokenCiphertext: string;
    idTokenCiphertext: string | null;
    accessExpiresAt: Date;
    refreshExpiresAt: Date;
  }): Promise<boolean> {
    const row = this.sessions.get(tokenHash);
    if (!row || row.revoked_at) return false;
    Object.assign(row, {
      access_token_ciphertext: patch.accessTokenCiphertext,
      refresh_token_ciphertext: patch.refreshTokenCiphertext,
      id_token_ciphertext: patch.idTokenCiphertext,
      access_expires_at: patch.accessExpiresAt,
      refresh_expires_at: patch.refreshExpiresAt,
    });
    return true;
  }

  async revokeSession(tokenHash: string): Promise<void> {
    const row = this.sessions.get(tokenHash);
    if (row && !row.revoked_at) row.revoked_at = new Date();
  }
}

export const platformUser = (subject = 'user-a', roles: string[] = []): PlatformUser => ({
  subject,
  issuer: 'https://identity.test',
  modelCrossUserId: `mc-${subject}`,
  email: `${subject}@example.test`,
  emailVerified: true,
  displayName: `User ${subject}`,
  avatarUrl: null,
  roles,
});

export interface IsolatedPostgres {
  database: PlatformDatabase;
  schema: string;
  close(): Promise<void>;
}

/**
 * Gives every integration test file its own schema while still exercising a
 * real PostgreSQL parser, constraints, transactions, JSONB and row locking.
 * Tests opt in with TEST_DATABASE_URL and are skipped when it is absent.
 */
export async function isolatedPostgres(databaseUrl = process.env.TEST_DATABASE_URL): Promise<IsolatedPostgres> {
  if (!databaseUrl) throw new Error('TEST_DATABASE_URL is required');
  const administrativePool = new pg.Pool({ connectionString: databaseUrl, max: 1 });
  const schema = `museflow_test_${randomUUID().replaceAll('-', '')}`;
  await administrativePool.query(`CREATE SCHEMA "${schema}"`);

  // Use a real pool so integration tests exercise the same concurrent-query
  // and transaction isolation as production. PostgreSQL startup options apply
  // the test schema before a checked-out connection can execute any query.
  const isolatedPool = new pg.Pool({
    connectionString: databaseUrl,
    max: 6,
    options: `-c search_path=${schema}`,
  }) as unknown as PoolLike;
  const database = new PlatformDatabase(isolatedPool);
  const migrations = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../migrations');
  try {
    await database.migrate(migrations);
  } catch (error) {
    await database.close().catch(() => undefined);
    await administrativePool.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`).catch(() => undefined);
    await administrativePool.end().catch(() => undefined);
    throw error;
  }

  let closed = false;
  return {
    database,
    schema,
    async close(): Promise<void> {
      if (closed) return;
      closed = true;
      try {
        // pool.end waits for checked-out work, preventing teardown from
        // resetting a socket while an HTTP request is finishing its query.
        await database.close();
      } finally {
        try {
          await administrativePool.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
        } finally {
          await administrativePool.end();
        }
      }
    },
  };
}

export function asDatabaseClient(value: { query: DatabaseClient['query'] }): DatabaseClient {
  return value as DatabaseClient;
}

/**
 * Opens the same durable Provider boundary used by production services while
 * keeping integration fixtures billing-disabled.  Direct Repository tests
 * must never bypass claim-before-accept merely for convenient setup.
 */
export async function claimTestGenerationProviderSubmission(
  repository: PlatformRepository,
  ownerSubject: string,
  generationId: string,
): Promise<void> {
  await repository.database.query(`UPDATE generation_batches SET
    status='submitting',billing_status='disabled',updated_at=NOW()
    WHERE id=$1 AND owner_subject=$2`, [generationId, ownerSubject]);
  const claim = await repository.claimGenerationProviderSubmission(ownerSubject, generationId);
  if (claim !== 'claimed') throw new Error(`test generation Provider claim failed: ${claim}`);
}
