import { createHash, randomUUID } from 'node:crypto';
import type { QueryResultRow } from 'pg';
import type { GenerateRequest, MusicOperation, SoundGenerateRequest, TrackStatus, TrackStage } from '../types.js';
import type { NormalizedSunoTask } from '../suno.js';
import type { DatabaseClient } from './database.js';
import { PlatformDatabase } from './database.js';
import type {
  AiAssistResult,
  AuthenticatedSession,
  BillingReservation,
  GenerationIntent,
  MusicModelProfile,
  MusicProject,
  PlatformTrack,
  PlatformUser,
  PollableProviderTask,
  ProviderSubmissionClaim,
  ProviderSubmissionState,
  ReferenceAudioUpload,
  TrackAssetAction,
  TrackAssetJob,
} from './types.js';

export class IdempotencyConflictError extends Error {
  status = 409;
}

export class ResourceNotFoundError extends Error {
  status = 404;
}

export class ResourceStateConflictError extends Error {
  status = 409;
}

/** Signals that an upstream refresh credential is terminally invalid. */
export class SessionRefreshRejectedError extends Error {}

export class ConcurrencyLimitError extends Error {
  status = 429;
}

interface IdentityRow extends QueryResultRow {
  subject: string;
  issuer: string;
  modelcross_user_id: string | null;
  email: string | null;
  email_verified: boolean;
  display_name: string;
  avatar_url: string | null;
  roles: string[];
}

interface SessionRow extends QueryResultRow {
  token_hash: string;
  subject: string;
  client_id: string;
  access_token_ciphertext: string;
  refresh_token_ciphertext: string;
  id_token_ciphertext: string | null;
  access_expires_at: Date;
  refresh_expires_at: Date;
  revoked_at: Date | null;
  issuer: string;
  modelcross_user_id: string | null;
  email: string | null;
  email_verified: boolean;
  display_name: string;
  avatar_url: string | null;
  roles: string[];
}

interface GenerationRow extends QueryResultRow {
  id: string;
  owner_subject: string;
  project_id: string | null;
  operation: MusicOperation;
  source_track_id: string | null;
  reference_audio_id: string | null;
  model_profile_id: string;
  status: string;
  idempotency_key: string;
  request_json: GenerateRequest | SoundGenerateRequest;
  submission_options_json: Record<string, unknown> | null;
  price_version: string | null;
  estimated_credits: string | number;
  billing_operation_id: string | null;
  billing_reservation_id: string | null;
  billing_status: string;
  error: string | null;
  provider_submission_payload_digest: string | null;
  provider_submission_state: ProviderSubmissionState;
  created_at: Date;
}

interface TrackRow extends QueryResultRow {
  id: string;
  generation_id: string;
  project_id: string | null;
  take_index: number;
  source_track_id: string | null;
  title: string;
  mode: 'simple' | 'custom';
  operation: MusicOperation;
  description: string;
  style: string;
  lyrics: string;
  instrumental: boolean;
  model: string;
  negative_tags: string;
  vocal_gender: 'auto' | 'm' | 'f';
  style_weight: number;
  weirdness: number;
  sound_tempo: string | number | null;
  sound_key: string | null;
  sound_loop: boolean | null;
  status: TrackStatus;
  stage: TrackStage;
  progress: number;
  error: string | null;
  upstream_status: string | null;
  custom_id: string | null;
  provider_record_id: string | number | null;
  duration: number;
  format: 'mp3';
  points_cost: string | number | null;
  points_refunded: boolean | null;
  video_url: string | null;
  video_ready?: boolean;
  created_at: Date;
  finished_at: Date | null;
  upstream_task_id: string | null;
  audio_ready: boolean;
  cover_ready: boolean;
  billing_status: string;
  estimated_credits: string | number;
  settled_credits: string | number | null;
  reference_copyright_audio: boolean | null;
  reference_audio_available: boolean;
  reference_audio_duration_seconds: string | number | null;
}

interface ModelProfileRow extends QueryResultRow {
  id: string;
  display_name: string;
  provider: string;
  description: string;
  badge: string | null;
  enabled: boolean;
  sort_order: number;
  estimated_credits: string | number;
  price_version: string;
  capabilities_json: MusicModelProfile['capabilities'];
}

interface ReferenceAudioRow extends QueryResultRow {
  id: string;
  owner_subject: string;
  object_key: string;
  original_filename: string;
  mime_type: string;
  byte_size: string | number;
  duration_seconds: string | number;
  checksum_sha256: string;
  copyright_confirmed: boolean;
  copyright_audio: boolean;
  status: ReferenceAudioUpload['status'];
  error: string | null;
  created_at: Date;
  deleted_at: Date | null;
}

interface AssetJobRow extends QueryResultRow {
  id: string;
  track_id: string;
  owner_subject: string;
  action: TrackAssetAction;
  operation_code: string;
  idempotency_key: string;
  status: string;
  progress: number;
  upstream_task_id: string | null;
  provider_record_id: string | number | null;
  result_json: Record<string, unknown> | null;
  asset_id: string | null;
  asset_kind: string | null;
  price_version: string | null;
  estimated_credits: string | number;
  actual_credits: string | number | null;
  billing_status: string;
  error: string | null;
  created_at: Date;
  updated_at: Date;
  finished_at: Date | null;
}

export interface OutboxEvent {
  id: string;
  aggregateType: string;
  aggregateId: string;
  eventType: string;
  ownerSubject: string | null;
  payload: Record<string, unknown>;
  attempts: number;
}

const TRACK_SELECT = `
  SELECT t.*,
         pt.upstream_task_id,
         EXISTS(SELECT 1 FROM track_assets a WHERE a.track_id=t.id AND a.kind='audio' AND a.deleted_at IS NULL) AS audio_ready,
         EXISTS(SELECT 1 FROM track_assets a WHERE a.track_id=t.id AND a.kind='cover' AND a.deleted_at IS NULL) AS cover_ready,
         EXISTS(SELECT 1 FROM track_assets a WHERE a.track_id=t.id AND a.kind='video' AND a.status='ready' AND a.deleted_at IS NULL) AS video_ready,
         g.billing_status,
         g.estimated_credits,
         (
           SELECT b.settled_credits
             FROM billing_operation_mirrors b
            WHERE b.generation_id=g.id
              AND b.ai_run_id IS NULL
            ORDER BY b.updated_at DESC, b.id DESC
            LIMIT 1
         ) AS settled_credits,
         ra.copyright_audio AS reference_copyright_audio,
         (ra.id IS NOT NULL AND ra.deleted_at IS NULL AND ra.status='ready') AS reference_audio_available,
         ra.duration_seconds AS reference_audio_duration_seconds
    FROM tracks t
    JOIN generation_batches g ON g.id=t.generation_id
    LEFT JOIN reference_audio_uploads ra
      ON ra.id=g.reference_audio_id AND ra.owner_subject=t.owner_subject
    LEFT JOIN provider_tasks pt ON pt.track_id=t.id`;

// MXAPI always creates two provider tasks. A generation request may ask the
// product to keep only one result; the sibling remains internally tracked for
// reconciliation but is hidden from owner-facing library/track reads.
const VISIBLE_TRACK_CLAUSE = ` AND t.take_index < CASE
  WHEN g.request_json->>'outputCount' IN ('1','2') THEN (g.request_json->>'outputCount')::int
  ELSE 2 END`;

const ASSET_JOB_SELECT = `SELECT j.*,a.kind AS asset_kind
  FROM track_asset_jobs j LEFT JOIN track_assets a ON a.id=j.asset_id AND a.deleted_at IS NULL`;

const toIso = (value: Date | string | null): string | null => value ? new Date(value).toISOString() : null;
const numeric = (value: string | number | null | undefined): number => value === null || value === undefined ? 0 : Number(value);

const persistedAiBillingStatuses = new Set<AiAssistResult['billing']['status']>([
  'preview', 'reserved', 'captured', 'released', 'refunded', 'disabled', 'not_reserved',
  'reconcile_required', 'manual_review_required',
]);
const zeroChargeAiBillingStatuses = new Set<AiAssistResult['billing']['status']>([
  'released', 'refunded', 'disabled', 'not_reserved',
]);

function authoritativeAiResult(
  result: AiAssistResult,
  storedStatus: string | null,
  storedActualCredits: string | number | null,
): AiAssistResult {
  const status = persistedAiBillingStatuses.has(storedStatus as AiAssistResult['billing']['status'])
    ? storedStatus as AiAssistResult['billing']['status']
    : result.billing.status;
  const { actualCredits: _resultCredits, ...resultWithoutCredits } = result;
  const { actualCredits: _billingCredits, ...billingWithoutCredits } = result.billing;

  if (status === 'captured') {
    const actualCredits = storedActualCredits === null ? null : Number(storedActualCredits);
    if (actualCredits !== null && Number.isSafeInteger(actualCredits) && actualCredits >= 0) {
      return {
        ...resultWithoutCredits,
        actualCredits,
        billing: { ...billingWithoutCredits, status, actualCredits },
      };
    }
  }
  if (zeroChargeAiBillingStatuses.has(status)) {
    return {
      ...resultWithoutCredits,
      actualCredits: 0,
      billing: { ...billingWithoutCredits, status, actualCredits: 0 },
    };
  }
  if (status === 'preview') return result;
  return { ...resultWithoutCredits, billing: { ...billingWithoutCredits, status } };
}
const canonicalJson = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(canonicalJson);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>)
      .filter(([, entry]) => entry !== undefined)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => [key, canonicalJson(entry)]));
  }
  return value;
};
const digestJson = (value: unknown): string => createHash('sha256').update(JSON.stringify(canonicalJson(value))).digest('hex');

function userFromRow(row: IdentityRow | SessionRow): PlatformUser {
  return {
    subject: row.subject,
    issuer: row.issuer,
    modelCrossUserId: row.modelcross_user_id,
    email: row.email,
    emailVerified: row.email_verified,
    displayName: row.display_name,
    avatarUrl: row.avatar_url,
    roles: Array.isArray(row.roles) ? row.roles : [],
  };
}

function generationFromRow(row: GenerationRow): GenerationIntent {
  return {
    id: row.id,
    ownerSubject: row.owner_subject,
    projectId: row.project_id,
    operation: row.operation,
    sourceTrackId: row.source_track_id,
    referenceAudioId: row.reference_audio_id,
    modelProfileId: row.model_profile_id,
    status: row.status,
    idempotencyKey: row.idempotency_key,
    request: row.request_json,
    submissionOptions: row.submission_options_json ?? {},
    priceVersion: row.price_version,
    estimatedCredits: numeric(row.estimated_credits),
    billingOperationId: row.billing_operation_id,
    billingReservationId: row.billing_reservation_id,
    billingStatus: row.billing_status,
    error: row.error,
    createdAt: new Date(row.created_at).toISOString(),
  };
}

function trackFromRow(row: TrackRow): PlatformTrack {
  const audio = row.audio_ready ? `/api/tracks/${row.id}/audio` : null;
  const cover = row.cover_ready ? `/api/tracks/${row.id}/cover` : null;
  return {
    id: row.id,
    groupId: row.generation_id,
    generationId: row.generation_id,
    projectId: row.project_id,
    takeIndex: row.take_index,
    title: row.title,
    mode: row.mode,
    operation: row.operation,
    description: row.description,
    style: row.style,
    lyrics: row.lyrics,
    instrumental: row.instrumental,
    model: row.model,
    negativeTags: row.negative_tags,
    vocalGender: row.vocal_gender,
    styleWeight: Number(row.style_weight),
    weirdness: Number(row.weirdness),
    soundTempo: row.sound_tempo === null ? null : numeric(row.sound_tempo),
    soundKey: row.sound_key,
    soundLoop: row.sound_loop,
    status: row.status,
    progress: Number(row.progress),
    stage: row.stage,
    eta: null,
    elapsed: null,
    error: row.error,
    file: audio,
    coverFile: cover,
    audioUrl: audio,
    imageUrl: cover,
    videoUrl: row.video_ready ? `/api/tracks/${row.id}/video` : row.video_url,
    upstreamTaskId: row.upstream_task_id,
    customId: row.custom_id,
    providerRecordId: row.provider_record_id === null ? null : numeric(row.provider_record_id),
    duration: Number(row.duration),
    format: row.format,
    // MXAPI points are merchant-cost diagnostics, not the owner's ModelCross
    // wallet. Keep them in PostgreSQL for Provider reconciliation, but never
    // project them through owner-facing Track APIs.
    pointsCost: null,
    pointsRefunded: null,
    upstreamStatus: row.upstream_status,
    createdAt: new Date(row.created_at).toISOString(),
    finishedAt: toIso(row.finished_at),
    ...(row.source_track_id ? { sourceTrackId: row.source_track_id } : {}),
    copyrightAudio: row.operation === 'upload' ? row.reference_copyright_audio : null,
    referenceAudioAvailable: row.operation === 'upload' && row.reference_audio_available,
    referenceAudioDurationSeconds: row.operation === 'upload' && row.reference_audio_duration_seconds !== null
      ? numeric(row.reference_audio_duration_seconds)
      : null,
    audioAssetReady: row.audio_ready,
    coverAssetReady: row.cover_ready,
    billingStatus: row.billing_status,
    estimatedCredits: numeric(row.estimated_credits),
    settledCredits: row.settled_credits === null || row.settled_credits === undefined
      ? null
      : numeric(row.settled_credits),
  };
}

function profileFromRow(row: ModelProfileRow): MusicModelProfile {
  return {
    id: row.id,
    displayName: row.display_name,
    provider: row.provider,
    description: row.description,
    badge: row.badge,
    enabled: row.enabled,
    sortOrder: row.sort_order,
    estimatedCredits: numeric(row.estimated_credits),
    priceVersion: row.price_version,
    capabilities: row.capabilities_json,
  };
}

function referenceAudioFromRow(row: ReferenceAudioRow): ReferenceAudioUpload {
  return {
    id: row.id,
    ownerSubject: row.owner_subject,
    objectKey: row.object_key,
    originalFilename: row.original_filename,
    mimeType: row.mime_type,
    byteSize: numeric(row.byte_size),
    durationSeconds: numeric(row.duration_seconds),
    checksumSha256: row.checksum_sha256,
    copyrightConfirmed: row.copyright_confirmed,
    copyrightAudio: row.copyright_audio,
    status: row.status,
    error: row.error,
    createdAt: new Date(row.created_at).toISOString(),
  };
}

function assetJobFromRow(row: AssetJobRow): TrackAssetJob {
  return {
    id: row.id,
    trackId: row.track_id,
    ownerSubject: row.owner_subject,
    action: row.action,
    operationCode: row.operation_code,
    idempotencyKey: row.idempotency_key,
    status: row.status,
    progress: Number(row.progress),
    upstreamTaskId: row.upstream_task_id,
    providerRecordId: row.provider_record_id === null ? null : numeric(row.provider_record_id),
    result: row.result_json,
    assetKind: row.asset_kind,
    assetUrl: row.asset_kind ? `/api/tracks/${row.track_id}/${row.asset_kind.replace('_', '-')}` : null,
    priceVersion: row.price_version,
    estimatedCredits: numeric(row.estimated_credits),
    actualCredits: row.actual_credits === null ? null : numeric(row.actual_credits),
    billingStatus: row.billing_status,
    error: row.error,
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
    finishedAt: toIso(row.finished_at),
  };
}

export interface StoredSessionSecrets {
  tokenHash: string;
  subject: string;
  clientId: string;
  accessTokenCiphertext: string;
  refreshTokenCiphertext: string;
  idTokenCiphertext: string | null;
  accessExpiresAt: Date;
  refreshExpiresAt: Date;
  userAgentHash: string | null;
  ipHash: string | null;
}

export interface SessionRefreshUpdate {
  accessTokenCiphertext: string;
  refreshTokenCiphertext: string;
  idTokenCiphertext: string | null;
  accessExpiresAt: Date;
  refreshExpiresAt: Date;
  user: PlatformUser;
}

export interface AuthTransaction {
  stateHash: string;
  codeVerifierCiphertext: string;
  nonce: string;
  returnTo: string;
  expiresAt: Date;
}

export interface TrackAsset {
  id: string;
  trackId: string;
  ownerSubject: string;
  kind: 'audio' | 'cover' | 'video' | 'waveform' | 'wav' | 'mp3' | 'm4a' | 'aligned_lyrics';
  objectKey: string;
  mimeType: string;
  byteSize: number;
  etag: string | null;
  checksumSha256: string;
}

export interface PollableUploadExtendStage {
  id: string;
  generationId: string;
  ownerSubject: string;
  upstreamTaskId: string;
  attempts: number;
  terminalWaitStartedAt: Date | null;
  pollLeaseToken: string;
}

export interface UploadExtendContinuation {
  stageId: string;
  generation: GenerationIntent;
  customId: string;
  continueAt: number;
  /** Null when the target model has no V4.5+ control sliders. */
  audioWeight: number | null;
}

export interface PollableTrackAssetJob {
  id: string;
  trackId: string;
  ownerSubject: string;
  action: TrackAssetAction;
  upstreamTaskId: string;
  attempts: number;
  terminalWaitStartedAt: Date | null;
  pollLeaseToken: string;
}

async function upsertTrackAssetRecord(client: DatabaseClient, asset: TrackAsset): Promise<string> {
  const previous = await client.query<{ object_key: string }>(`SELECT object_key FROM track_assets
    WHERE track_id=$1 AND kind=$2 FOR UPDATE`, [asset.trackId, asset.kind]);
  const stored = await client.query<{ id: string }>(`INSERT INTO track_assets(
    id,track_id,owner_subject,kind,object_key,mime_type,byte_size,etag,checksum_sha256,status
  ) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,'ready')
  ON CONFLICT(track_id,kind) DO UPDATE SET object_key=EXCLUDED.object_key,mime_type=EXCLUDED.mime_type,
    byte_size=EXCLUDED.byte_size,etag=EXCLUDED.etag,checksum_sha256=EXCLUDED.checksum_sha256,
    status='ready',deleted_at=NULL RETURNING id`, [asset.id, asset.trackId, asset.ownerSubject, asset.kind,
    asset.objectKey, asset.mimeType, asset.byteSize, asset.etag, asset.checksumSha256]);
  const oldKey = previous.rows[0]?.object_key;
  if (oldKey && oldKey !== asset.objectKey) {
    await client.query(`INSERT INTO storage_tombstones(id,owner_subject,object_key,reason)
      VALUES($1,$2,$3,'asset_replaced') ON CONFLICT(object_key) DO NOTHING`, [
      randomUUID(), asset.ownerSubject, oldKey,
    ]);
  }
  return stored.rows[0]!.id;
}

export class PlatformRepository {
  constructor(readonly database: PlatformDatabase) {}

  async upsertIdentity(user: PlatformUser): Promise<void> {
    await this.database.transaction(async (client) => {
      await client.query(`INSERT INTO identity_links(
          subject, issuer, modelcross_user_id, email, email_verified, display_name, avatar_url, roles
        ) VALUES($1,$2,$3,$4,$5,$6,$7,$8::jsonb)
        ON CONFLICT(subject) DO UPDATE SET
          issuer=EXCLUDED.issuer,
          modelcross_user_id=EXCLUDED.modelcross_user_id,
          email=EXCLUDED.email,
          email_verified=EXCLUDED.email_verified,
          display_name=EXCLUDED.display_name,
          avatar_url=EXCLUDED.avatar_url,
          roles=EXCLUDED.roles,
          updated_at=NOW(), last_seen_at=NOW()`, [
        user.subject, user.issuer, user.modelCrossUserId, user.email, user.emailVerified,
        user.displayName, user.avatarUrl, JSON.stringify(user.roles),
      ]);
      await client.query(`INSERT INTO workspaces(id, owner_subject, name)
        VALUES($1,$2,'个人空间') ON CONFLICT(owner_subject, name) DO NOTHING`, [randomUUID(), user.subject]);
    });
  }

  async getIdentity(subject: string): Promise<PlatformUser | null> {
    const result = await this.database.query<IdentityRow>('SELECT * FROM identity_links WHERE subject=$1', [subject]);
    return result.rows[0] ? userFromRow(result.rows[0]) : null;
  }

  async storeAuthTransaction(transaction: AuthTransaction): Promise<void> {
    await this.database.query(`INSERT INTO auth_transactions(
      state_hash, code_verifier_ciphertext, nonce, return_to, expires_at
    ) VALUES($1,$2,$3,$4,$5)`, [
      transaction.stateHash, transaction.codeVerifierCiphertext, transaction.nonce,
      transaction.returnTo, transaction.expiresAt,
    ]);
  }

  async takeAuthTransaction(stateHash: string): Promise<AuthTransaction | null> {
    const result = await this.database.query<{
      state_hash: string; code_verifier_ciphertext: string; nonce: string; return_to: string; expires_at: Date;
    }>(`DELETE FROM auth_transactions WHERE state_hash=$1 AND expires_at>NOW()
       RETURNING state_hash, code_verifier_ciphertext, nonce, return_to, expires_at`, [stateHash]);
    const row = result.rows[0];
    return row ? {
      stateHash: row.state_hash,
      codeVerifierCiphertext: row.code_verifier_ciphertext,
      nonce: row.nonce,
      returnTo: row.return_to,
      expiresAt: row.expires_at,
    } : null;
  }

  async purgeExpiredAuthTransactions(): Promise<number> {
    const result = await this.database.query('DELETE FROM auth_transactions WHERE expires_at<=NOW()');
    return result.rowCount ?? 0;
  }

  async purgeExpiredSessions(): Promise<number> {
    const result = await this.database.query(`DELETE FROM app_sessions
      WHERE refresh_expires_at<=NOW() OR revoked_at<NOW()-INTERVAL '24 hours'`);
    return result.rowCount ?? 0;
  }

  async consumeRateLimit(input: {
    scope: string;
    keyHash: string;
    windowStartedAt: Date;
    expiresAt: Date;
  }): Promise<number> {
    return this.database.transaction(async (client) => {
      await client.query('DELETE FROM api_rate_limit_buckets WHERE expires_at<=NOW()');
      const result = await client.query<{ request_count: number }>(`INSERT INTO api_rate_limit_buckets(
          scope,key_hash,window_started_at,request_count,expires_at
        ) VALUES($1,$2,$3,1,$4)
        ON CONFLICT(scope,key_hash,window_started_at) DO UPDATE SET
          request_count=api_rate_limit_buckets.request_count+1,
          expires_at=GREATEST(api_rate_limit_buckets.expires_at,EXCLUDED.expires_at)
        RETURNING request_count`, [input.scope, input.keyHash, input.windowStartedAt, input.expiresAt]);
      return result.rows[0]?.request_count ?? 1;
    });
  }

  async createSession(session: StoredSessionSecrets): Promise<void> {
    await this.database.query(`INSERT INTO app_sessions(
      token_hash, subject, client_id, access_token_ciphertext, refresh_token_ciphertext,
      id_token_ciphertext, access_expires_at, refresh_expires_at, user_agent_hash, ip_hash
    ) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`, [
      session.tokenHash, session.subject, session.clientId, session.accessTokenCiphertext,
      session.refreshTokenCiphertext, session.idTokenCiphertext, session.accessExpiresAt,
      session.refreshExpiresAt, session.userAgentHash, session.ipHash,
    ]);
  }

  async getSessionRow(tokenHash: string): Promise<SessionRow | null> {
    const result = await this.database.query<SessionRow>(`SELECT s.*, i.issuer, i.modelcross_user_id,
      i.email, i.email_verified, i.display_name, i.avatar_url, i.roles
      FROM app_sessions s JOIN identity_links i ON i.subject=s.subject
      WHERE s.token_hash=$1 AND s.revoked_at IS NULL AND s.refresh_expires_at>NOW()`, [tokenHash]);
    if (result.rows[0]) {
      await this.database.query('UPDATE app_sessions SET last_seen_at=NOW() WHERE token_hash=$1', [tokenHash]);
    }
    return result.rows[0] ?? null;
  }

  async refreshSessionAtomically(
    tokenHash: string,
    refreshBefore: Date,
    refresh: (row: RawSessionRow) => Promise<SessionRefreshUpdate>,
  ): Promise<SessionRow | null> {
    return this.database.transaction(async (client) => {
      const result = await client.query<SessionRow>(`SELECT s.*, i.issuer, i.modelcross_user_id,
        i.email, i.email_verified, i.display_name, i.avatar_url, i.roles
        FROM app_sessions s JOIN identity_links i ON i.subject=s.subject
        WHERE s.token_hash=$1 AND s.revoked_at IS NULL AND s.refresh_expires_at>NOW()
        FOR UPDATE OF s`, [tokenHash]);
      const row = result.rows[0];
      if (!row) return null;
      if (row.access_expires_at.getTime() > refreshBefore.getTime()) return row;

      let update: SessionRefreshUpdate;
      try {
        update = await refresh(row);
      } catch (error) {
        if (!(error instanceof SessionRefreshRejectedError)) throw error;
        await client.query(`UPDATE app_sessions SET revoked_at=NOW()
          WHERE token_hash=$1 AND revoked_at IS NULL`, [tokenHash]);
        return null;
      }
      if (update.user.subject !== row.subject || update.user.issuer !== row.issuer) {
        await client.query(`UPDATE app_sessions SET revoked_at=NOW()
          WHERE token_hash=$1 AND revoked_at IS NULL`, [tokenHash]);
        return null;
      }

      await client.query(`INSERT INTO identity_links(
          subject,issuer,modelcross_user_id,email,email_verified,display_name,avatar_url,roles
        ) VALUES($1,$2,$3,$4,$5,$6,$7,$8::jsonb)
        ON CONFLICT(subject) DO UPDATE SET
          issuer=EXCLUDED.issuer,
          modelcross_user_id=EXCLUDED.modelcross_user_id,
          email=EXCLUDED.email,
          email_verified=EXCLUDED.email_verified,
          display_name=EXCLUDED.display_name,
          avatar_url=EXCLUDED.avatar_url,
          roles=EXCLUDED.roles,
          updated_at=NOW(),last_seen_at=NOW()`, [
        update.user.subject, update.user.issuer, update.user.modelCrossUserId, update.user.email,
        update.user.emailVerified, update.user.displayName, update.user.avatarUrl,
        JSON.stringify(update.user.roles),
      ]);
      await client.query(`UPDATE app_sessions SET
        access_token_ciphertext=$2,refresh_token_ciphertext=$3,id_token_ciphertext=$4,
        access_expires_at=$5,refresh_expires_at=$6,last_seen_at=NOW()
        WHERE token_hash=$1 AND revoked_at IS NULL`, [
        tokenHash, update.accessTokenCiphertext, update.refreshTokenCiphertext,
        update.idTokenCiphertext, update.accessExpiresAt, update.refreshExpiresAt,
      ]);
      return {
        ...row,
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
      };
    });
  }

  sessionUser(row: SessionRow): PlatformUser {
    return userFromRow(row);
  }

  async updateSessionTokens(tokenHash: string, patch: {
    accessTokenCiphertext: string;
    refreshTokenCiphertext: string;
    idTokenCiphertext: string | null;
    accessExpiresAt: Date;
    refreshExpiresAt: Date;
  }): Promise<boolean> {
    const result = await this.database.query(`UPDATE app_sessions SET
      access_token_ciphertext=$2, refresh_token_ciphertext=$3, id_token_ciphertext=$4,
      access_expires_at=$5, refresh_expires_at=$6, last_seen_at=NOW()
      WHERE token_hash=$1 AND revoked_at IS NULL`, [tokenHash, patch.accessTokenCiphertext,
      patch.refreshTokenCiphertext, patch.idTokenCiphertext, patch.accessExpiresAt, patch.refreshExpiresAt]);
    return (result.rowCount ?? 0) === 1;
  }

  async revokeSession(tokenHash: string): Promise<void> {
    await this.database.query('UPDATE app_sessions SET revoked_at=NOW() WHERE token_hash=$1 AND revoked_at IS NULL', [tokenHash]);
  }

  async revokeAllSessions(subject: string): Promise<void> {
    await this.database.query('UPDATE app_sessions SET revoked_at=NOW() WHERE subject=$1 AND revoked_at IS NULL', [subject]);
  }

  async listProjects(ownerSubject: string): Promise<MusicProject[]> {
    const result = await this.database.query<QueryResultRow & {
      id: string; workspace_id: string; owner_subject: string; name: string; description: string;
      cover_object_key: string | null; status: string; track_count: string; created_at: Date; updated_at: Date;
    }>(`SELECT p.*, (COUNT(t.id) FILTER (WHERE t.take_index < CASE
        WHEN g.request_json->>'outputCount' IN ('1','2') THEN (g.request_json->>'outputCount')::int
        ELSE 2 END))::text AS track_count
      FROM music_projects p LEFT JOIN tracks t ON t.project_id=p.id
      LEFT JOIN generation_batches g ON g.id=t.generation_id
      WHERE p.owner_subject=$1 AND p.archived_at IS NULL
      GROUP BY p.id ORDER BY p.updated_at DESC`, [ownerSubject]);
    return result.rows.map((row) => ({
      id: row.id, workspaceId: row.workspace_id, ownerSubject: row.owner_subject,
      name: row.name, description: row.description, coverObjectKey: row.cover_object_key,
      status: row.status, trackCount: Number(row.track_count),
      createdAt: row.created_at.toISOString(), updatedAt: row.updated_at.toISOString(),
    }));
  }

  async createProject(ownerSubject: string, name: string, description: string): Promise<MusicProject> {
    const workspace = await this.database.query<{ id: string }>(
      'SELECT id FROM workspaces WHERE owner_subject=$1 ORDER BY created_at LIMIT 1', [ownerSubject],
    );
    if (!workspace.rows[0]) throw new ResourceNotFoundError('workspace not found');
    const id = randomUUID();
    const result = await this.database.query<QueryResultRow & {
      id: string; workspace_id: string; owner_subject: string; name: string; description: string;
      cover_object_key: string | null; status: string; created_at: Date; updated_at: Date;
    }>(`INSERT INTO music_projects(id,workspace_id,owner_subject,name,description)
      VALUES($1,$2,$3,$4,$5) RETURNING *`, [id, workspace.rows[0].id, ownerSubject, name, description]);
    const row = result.rows[0]!;
    return {
      id: row.id, workspaceId: row.workspace_id, ownerSubject: row.owner_subject,
      name: row.name, description: row.description, coverObjectKey: row.cover_object_key,
      status: row.status, trackCount: 0, createdAt: row.created_at.toISOString(), updatedAt: row.updated_at.toISOString(),
    };
  }

  async createProjectIdempotent(
    ownerSubject: string,
    name: string,
    description: string,
    idempotencyKey: string,
  ): Promise<{ project: MusicProject; replay: boolean }> {
    const requestDigest = digestJson({ name, description });
    return this.database.transaction(async (client) => {
      await client.query('SELECT pg_advisory_xact_lock(hashtext($1),hashtext($2))', [ownerSubject, `project.create:${idempotencyKey}`]);
      const existing = await client.query<{ request_digest: string; resource_id: string | null }>(
        `SELECT request_digest,resource_id FROM idempotency_keys
         WHERE owner_subject=$1 AND scope='project.create' AND idempotency_key=$2`,
        [ownerSubject, idempotencyKey],
      );
      if (existing.rows[0]) {
        if (existing.rows[0].request_digest !== requestDigest) {
          throw new IdempotencyConflictError('idempotency key was already used for a different project');
        }
        const replay = await client.query<QueryResultRow & {
          id: string; workspace_id: string; owner_subject: string; name: string; description: string;
          cover_object_key: string | null; status: string; track_count: string; created_at: Date; updated_at: Date;
        }>(`SELECT p.*,COUNT(t.id)::text AS track_count FROM music_projects p
          LEFT JOIN tracks t ON t.project_id=p.id WHERE p.id=$1 AND p.owner_subject=$2
          GROUP BY p.id`, [existing.rows[0].resource_id, ownerSubject]);
        const row = replay.rows[0];
        if (!row) throw new ResourceNotFoundError('idempotent project resource no longer exists');
        return { project: {
          id: row.id, workspaceId: row.workspace_id, ownerSubject: row.owner_subject,
          name: row.name, description: row.description, coverObjectKey: row.cover_object_key,
          status: row.status, trackCount: Number(row.track_count),
          createdAt: row.created_at.toISOString(), updatedAt: row.updated_at.toISOString(),
        }, replay: true };
      }
      const workspace = await client.query<{ id: string }>(
        'SELECT id FROM workspaces WHERE owner_subject=$1 ORDER BY created_at LIMIT 1', [ownerSubject],
      );
      if (!workspace.rows[0]) throw new ResourceNotFoundError('workspace not found');
      const id = randomUUID();
      const inserted = await client.query<QueryResultRow & {
        id: string; workspace_id: string; owner_subject: string; name: string; description: string;
        cover_object_key: string | null; status: string; created_at: Date; updated_at: Date;
      }>(`INSERT INTO music_projects(id,workspace_id,owner_subject,name,description)
        VALUES($1,$2,$3,$4,$5) RETURNING *`, [id, workspace.rows[0].id, ownerSubject, name, description]);
      await client.query(`INSERT INTO idempotency_keys(
        owner_subject,scope,idempotency_key,request_digest,resource_id,response_status,expires_at
      ) VALUES($1,'project.create',$2,$3,$4,201,NOW()+INTERVAL '24 hours')`, [
        ownerSubject, idempotencyKey, requestDigest, id,
      ]);
      const row = inserted.rows[0]!;
      return { project: {
        id: row.id, workspaceId: row.workspace_id, ownerSubject: row.owner_subject,
        name: row.name, description: row.description, coverObjectKey: row.cover_object_key,
        status: row.status, trackCount: 0,
        createdAt: row.created_at.toISOString(), updatedAt: row.updated_at.toISOString(),
      }, replay: false };
    });
  }

  async archiveProject(ownerSubject: string, id: string): Promise<boolean> {
    const result = await this.database.query(`UPDATE music_projects SET archived_at=NOW(), status='archived', updated_at=NOW()
      WHERE id=$1 AND owner_subject=$2 AND archived_at IS NULL`, [id, ownerSubject]);
    return (result.rowCount ?? 0) === 1;
  }

  async upsertModelProfiles(profiles: MusicModelProfile[]): Promise<void> {
    await this.database.transaction(async (client) => {
      for (const profile of profiles) {
        await client.query(`INSERT INTO music_model_profiles(
          id,display_name,provider,description,badge,enabled,sort_order,estimated_credits,price_version,capabilities_json
        ) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb)
        ON CONFLICT(id) DO UPDATE SET display_name=EXCLUDED.display_name, provider=EXCLUDED.provider,
          description=EXCLUDED.description, badge=EXCLUDED.badge, sort_order=EXCLUDED.sort_order,
          estimated_credits=EXCLUDED.estimated_credits, price_version=EXCLUDED.price_version,
          capabilities_json=EXCLUDED.capabilities_json, updated_at=NOW()`, [
          profile.id, profile.displayName, profile.provider, profile.description, profile.badge,
          profile.enabled, profile.sortOrder, profile.estimatedCredits, profile.priceVersion,
          JSON.stringify(profile.capabilities),
        ]);
      }
    });
  }

  async listModelProfiles(includeDisabled = false): Promise<MusicModelProfile[]> {
    const result = await this.database.query<ModelProfileRow>(`SELECT * FROM music_model_profiles
      ${includeDisabled ? '' : 'WHERE enabled=TRUE'} ORDER BY sort_order, display_name`);
    return result.rows.map(profileFromRow);
  }

  async getModelProfile(id: string): Promise<MusicModelProfile | null> {
    const result = await this.database.query<ModelProfileRow>('SELECT * FROM music_model_profiles WHERE id=$1 AND enabled=TRUE', [id]);
    return result.rows[0] ? profileFromRow(result.rows[0]) : null;
  }

  async registerReferenceAudioUpload(input: {
    id: string;
    ownerSubject: string;
    objectKey: string;
    originalFilename: string;
    mimeType: string;
    byteSize: number;
    durationSeconds: number;
    checksumSha256: string;
    copyrightConfirmed: boolean;
    copyrightAudio: boolean;
    idempotencyKey: string;
    maxTotalBytes: number;
  }): Promise<{ upload: ReferenceAudioUpload; replay: boolean }> {
    const requestDigest = digestJson({
      checksumSha256: input.checksumSha256,
      byteSize: input.byteSize,
      durationSeconds: input.durationSeconds,
      mimeType: input.mimeType,
      copyrightConfirmed: input.copyrightConfirmed,
      copyrightAudio: input.copyrightAudio,
    });
    return this.database.transaction(async (client) => {
      await client.query('SELECT pg_advisory_xact_lock(hashtext($1),hashtext($2))', [
        input.ownerSubject, `reference.audio:${input.idempotencyKey}`,
      ]);
      const existing = await client.query<ReferenceAudioRow>(`SELECT * FROM reference_audio_uploads
        WHERE owner_subject=$1 AND idempotency_key=$2 FOR UPDATE`, [input.ownerSubject, input.idempotencyKey]);
      if (existing.rows[0]) {
        if (existing.rows[0].request_digest !== requestDigest || existing.rows[0].deleted_at) {
          throw new IdempotencyConflictError('idempotency key was already used for a different audio upload');
        }
        return { upload: referenceAudioFromRow(existing.rows[0]), replay: true };
      }
      await client.query('SELECT pg_advisory_xact_lock(hashtext($1),hashtext($2))', [
        input.ownerSubject, 'reference.audio.quota',
      ]);
      const used = await client.query<{ bytes: string }>(`SELECT COALESCE(SUM(byte_size),0)::text AS bytes
        FROM reference_audio_uploads WHERE owner_subject=$1 AND deleted_at IS NULL
          AND status IN('storing','ready')`, [input.ownerSubject]);
      if (Number(used.rows[0]?.bytes ?? 0) + input.byteSize > input.maxTotalBytes) {
        throw new ResourceStateConflictError('reference audio storage quota exceeded');
      }
      const created = await client.query<ReferenceAudioRow>(`INSERT INTO reference_audio_uploads(
        id,owner_subject,object_key,original_filename,mime_type,byte_size,duration_seconds,checksum_sha256,
        copyright_confirmed,copyright_audio,idempotency_key,request_digest,status
      ) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,'storing') RETURNING *`, [
        input.id, input.ownerSubject, input.objectKey, input.originalFilename, input.mimeType,
        input.byteSize, input.durationSeconds, input.checksumSha256, input.copyrightConfirmed, input.copyrightAudio,
        input.idempotencyKey, requestDigest,
      ]);
      return { upload: referenceAudioFromRow(created.rows[0]!), replay: false };
    });
  }

  async finishReferenceAudioUpload(
    ownerSubject: string,
    id: string,
    status: 'ready' | 'failed',
    error?: string,
  ): Promise<ReferenceAudioUpload> {
    const result = await this.database.query<ReferenceAudioRow>(`UPDATE reference_audio_uploads
      SET status=$3,error=$4,updated_at=NOW() WHERE id=$1 AND owner_subject=$2 AND deleted_at IS NULL
      RETURNING *`, [id, ownerSubject, status, error?.slice(0, 1000) ?? null]);
    if (!result.rows[0]) throw new ResourceNotFoundError('reference audio not found');
    return referenceAudioFromRow(result.rows[0]);
  }

  async getReferenceAudio(ownerSubject: string, id: string): Promise<ReferenceAudioUpload | null> {
    const result = await this.database.query<ReferenceAudioRow>(`SELECT * FROM reference_audio_uploads
      WHERE id=$1 AND owner_subject=$2 AND deleted_at IS NULL`, [id, ownerSubject]);
    return result.rows[0] ? referenceAudioFromRow(result.rows[0]) : null;
  }

  async listReferenceAudio(ownerSubject: string, limit = 100): Promise<ReferenceAudioUpload[]> {
    const boundedLimit = Math.min(200, Math.max(1, Math.floor(limit)));
    const result = await this.database.query<ReferenceAudioRow>(`SELECT * FROM reference_audio_uploads
      WHERE owner_subject=$1 AND deleted_at IS NULL
      ORDER BY created_at DESC LIMIT $2`, [ownerSubject, boundedLimit]);
    return result.rows.map(referenceAudioFromRow);
  }

  async deleteReferenceAudio(ownerSubject: string, id: string): Promise<boolean> {
    return this.database.transaction(async (client) => {
      const result = await client.query<ReferenceAudioRow>(`SELECT * FROM reference_audio_uploads
        WHERE id=$1 AND owner_subject=$2 AND deleted_at IS NULL FOR UPDATE`, [id, ownerSubject]);
      const row = result.rows[0];
      if (!row) return false;
      const active = await client.query<{ count: string }>(`SELECT COUNT(*)::text AS count
        FROM generation_batches WHERE reference_audio_id=$1
          AND status IN('draft','submitting','queued','running')`, [id]);
      if (Number(active.rows[0]?.count ?? 0) > 0) {
        throw new ResourceStateConflictError('reference audio cannot be deleted while a music operation is active');
      }
      await client.query(`UPDATE reference_audio_uploads SET status='deleted',deleted_at=NOW(),updated_at=NOW()
        WHERE id=$1`, [id]);
      await client.query(`INSERT INTO storage_tombstones(id,owner_subject,object_key,reason)
        VALUES($1,$2,$3,'reference_audio_deleted') ON CONFLICT(object_key) DO NOTHING`, [
        randomUUID(), ownerSubject, row.object_key,
      ]);
      return true;
    });
  }

  async createGenerationIntent(input: {
    ownerSubject: string;
    projectId: string | null;
    operation: MusicOperation;
    sourceTrackId: string | null;
    referenceAudioId?: string | null;
    modelProfileId: string;
    idempotencyKey: string;
    request: GenerateRequest | SoundGenerateRequest;
    /** Effective Provider-only parameters omitted from GenerateRequest. */
    submissionOptions?: Record<string, unknown>;
    estimatedCredits: number;
    priceVersion: string;
    maxConcurrent?: number;
  }): Promise<{ intent: GenerationIntent; replay: boolean }> {
    const providerSubmissionPayloadDigest = digestJson({
      operation: input.operation,
      projectId: input.projectId,
      sourceTrackId: input.sourceTrackId,
      referenceAudioId: input.referenceAudioId ?? null,
      modelProfileId: input.modelProfileId,
      request: input.request,
      submissionOptions: input.submissionOptions ?? {},
    });
    return this.database.transaction(async (client) => {
      await client.query('SELECT pg_advisory_xact_lock(hashtext($1),hashtext($2))', [
        input.ownerSubject, `music.generate:${input.idempotencyKey}`,
      ]);
      const existing = await client.query<GenerationRow>(
        'SELECT * FROM generation_batches WHERE owner_subject=$1 AND idempotency_key=$2 FOR UPDATE',
        [input.ownerSubject, input.idempotencyKey],
      );
      if (existing.rows[0]) {
        if ((existing.rows[0].provider_submission_payload_digest !== null
            && existing.rows[0].provider_submission_payload_digest !== providerSubmissionPayloadDigest)
          || (existing.rows[0].provider_submission_payload_digest === null
            && digestJson(existing.rows[0].request_json) !== digestJson(input.request))
          || existing.rows[0].operation !== input.operation
          || existing.rows[0].project_id !== input.projectId
          || existing.rows[0].source_track_id !== input.sourceTrackId
          || existing.rows[0].reference_audio_id !== (input.referenceAudioId ?? null)
          || existing.rows[0].model_profile_id !== input.modelProfileId) {
          throw new IdempotencyConflictError('idempotency key was already used for a different request');
        }
        return { intent: generationFromRow(existing.rows[0]), replay: true };
      }
      if (input.projectId) {
        const project = await client.query('SELECT id FROM music_projects WHERE id=$1 AND owner_subject=$2 AND archived_at IS NULL', [
          input.projectId, input.ownerSubject,
        ]);
        if (!project.rows[0]) throw new ResourceNotFoundError('project not found');
      }
      if (input.referenceAudioId) {
        const reference = await client.query(`SELECT id FROM reference_audio_uploads
          WHERE id=$1 AND owner_subject=$2 AND status='ready' AND deleted_at IS NULL`, [
          input.referenceAudioId, input.ownerSubject,
        ]);
        if (!reference.rows[0]) throw new ResourceNotFoundError('reference audio not found');
      }
      await client.query('SELECT pg_advisory_xact_lock(hashtext($1),hashtext($2))', [
        input.ownerSubject, 'music.concurrent',
      ]);
      const active = await client.query<{ count: string }>(`SELECT COUNT(*)::text AS count
        FROM generation_batches
        WHERE owner_subject=$1 AND status IN('draft','submitting','queued','running')`, [input.ownerSubject]);
      if (Number(active.rows[0]?.count ?? 0) >= (input.maxConcurrent ?? 2)) {
        throw new ConcurrencyLimitError('concurrent music generation limit exceeded');
      }
      const id = randomUUID();
      const result = await client.query<GenerationRow>(`INSERT INTO generation_batches(
        id,owner_subject,project_id,operation,source_track_id,model_profile_id,status,idempotency_key,
        request_json,submission_options_json,price_version,estimated_credits,billing_status,reference_audio_id,
        provider_submission_payload_digest
      ) VALUES($1,$2,$3,$4,$5,$6,'draft',$7,$8::jsonb,$9::jsonb,$10,$11,'draft',$12,$13) RETURNING *`, [
        id, input.ownerSubject, input.projectId, input.operation, input.sourceTrackId,
        input.modelProfileId, input.idempotencyKey, JSON.stringify(input.request),
        JSON.stringify(input.submissionOptions ?? {}), input.priceVersion, input.estimatedCredits, input.referenceAudioId ?? null,
        providerSubmissionPayloadDigest,
      ]);
      await client.query(`INSERT INTO idempotency_keys(owner_subject,scope,idempotency_key,request_digest,resource_id,expires_at)
        VALUES($1,'music.generate',$2,$3,$4,NOW()+INTERVAL '24 hours')`, [
        input.ownerSubject, input.idempotencyKey, providerSubmissionPayloadDigest, id,
      ]);
      return { intent: generationFromRow(result.rows[0]!), replay: false };
    });
  }

  async setGenerationReservation(
    ownerSubject: string,
    generationId: string,
    operationId: string,
    reservationId: string,
    operationCode: string,
    priceVersion: string,
    reservedCredits: number,
    billingStatus: BillingReservation['status'] | 'manual_review_required' = 'reserved',
  ): Promise<void> {
    await this.database.transaction(async (client) => {
      const updated = await client.query(`UPDATE generation_batches SET billing_operation_id=$3,
        billing_reservation_id=$4,price_version=$5,estimated_credits=$6,
        billing_status=$7,status=CASE WHEN status='draft' THEN 'submitting' ELSE status END,updated_at=NOW()
        WHERE id=$1 AND owner_subject=$2`, [
        generationId, ownerSubject, operationId, reservationId, priceVersion, reservedCredits, billingStatus,
      ]);
      if ((updated.rowCount ?? 0) !== 1) throw new ResourceNotFoundError('generation not found');
      const mirror = await client.query<{ id: string }>(`INSERT INTO billing_operation_mirrors(
        id,owner_subject,generation_id,remote_operation_id,remote_reservation_id,operation_code,
        idempotency_key,price_version,reserved_credits,status
      ) SELECT $1,owner_subject,id,$2,$3,$4,'music:'||idempotency_key,price_version,estimated_credits,$6
        FROM generation_batches WHERE id=$5
        ON CONFLICT(owner_subject,idempotency_key) DO UPDATE SET
          remote_operation_id=EXCLUDED.remote_operation_id,
          remote_reservation_id=EXCLUDED.remote_reservation_id,
          operation_code=EXCLUDED.operation_code,
          price_version=EXCLUDED.price_version,
          reserved_credits=EXCLUDED.reserved_credits,
          status=EXCLUDED.status,updated_at=NOW()
        WHERE billing_operation_mirrors.generation_id=EXCLUDED.generation_id
          AND billing_operation_mirrors.ai_run_id IS NULL
        RETURNING billing_operation_mirrors.id`, [
        randomUUID(), operationId, reservationId, operationCode, generationId, billingStatus,
      ]);
      if ((mirror.rowCount ?? 0) !== 1) {
        throw new IdempotencyConflictError('billing mirror key is already bound to another resource');
      }
    });
  }

  async claimGenerationProviderSubmission(
    ownerSubject: string,
    generationId: string,
  ): Promise<ProviderSubmissionClaim> {
    return this.database.transaction(async (client) => {
      const claimed = await client.query<{ id: string }>(`UPDATE generation_batches SET
        provider_submission_state='started',provider_submission_started_at=NOW(),
        provider_submission_finished_at=NULL,provider_submission_error=NULL,updated_at=NOW()
        WHERE id=$1 AND owner_subject=$2 AND provider_submission_state='not_started'
          AND status='submitting' AND billing_status IN('reserved','disabled')
        RETURNING id`, [generationId, ownerSubject]);
      if (claimed.rows[0]) return 'claimed';

      const current = await client.query<QueryResultRow & {
        provider_submission_state: ProviderSubmissionState;
        stale_started: boolean;
      }>(`SELECT provider_submission_state,
          (provider_submission_state='started'
            AND provider_submission_started_at<NOW()-INTERVAL '10 minutes') AS stale_started
        FROM generation_batches WHERE id=$1 AND owner_subject=$2 FOR UPDATE`, [generationId, ownerSubject]);
      const row = current.rows[0];
      if (!row) throw new ResourceNotFoundError('generation not found');
      if (row.stale_started) {
        const message = 'stale Provider submission has an unknown outcome; automatic retry and release are disabled';
        await client.query(`UPDATE generation_batches SET
          provider_submission_state='uncertain',provider_submission_finished_at=NOW(),
          provider_submission_error=$3,status='failed',billing_status='manual_review_required',
          error=$3,finished_at=COALESCE(finished_at,NOW()),updated_at=NOW()
          WHERE id=$1 AND owner_subject=$2 AND provider_submission_state='started'`, [
          generationId, ownerSubject, message,
        ]);
        await client.query(`UPDATE billing_operation_mirrors SET
          status='manual_review_required',last_error=$3,updated_at=NOW()
          WHERE generation_id=$1 AND owner_subject=$2`, [generationId, ownerSubject, message]);
        return 'uncertain';
      }
      if (row.provider_submission_state === 'not_started') {
        throw new ResourceStateConflictError('generation Provider submission requires a durable billing reservation');
      }
      return row.provider_submission_state === 'started'
        ? 'already_started'
        : row.provider_submission_state;
    });
  }

  async markGenerationProviderSubmissionRejected(
    ownerSubject: string,
    generationId: string,
    error: string,
  ): Promise<ProviderSubmissionState> {
    const message = error.slice(0, 1000);
    return this.database.transaction(async (client) => {
      const updated = await client.query<{ provider_submission_state: ProviderSubmissionState }>(`UPDATE generation_batches SET
        provider_submission_state='rejected',provider_submission_finished_at=NOW(),
        provider_submission_error=$3,updated_at=NOW()
        WHERE id=$1 AND owner_subject=$2 AND provider_submission_state='started'
        RETURNING provider_submission_state`, [generationId, ownerSubject, message]);
      if (updated.rows[0]) return updated.rows[0].provider_submission_state;
      const current = await client.query<{ provider_submission_state: ProviderSubmissionState }>(`SELECT provider_submission_state
        FROM generation_batches WHERE id=$1 AND owner_subject=$2`, [generationId, ownerSubject]);
      if (!current.rows[0]) throw new ResourceNotFoundError('generation not found');
      return current.rows[0].provider_submission_state;
    });
  }

  async markGenerationProviderSubmissionUncertain(
    ownerSubject: string,
    generationId: string,
    error: string,
  ): Promise<ProviderSubmissionState> {
    const message = error.slice(0, 1000);
    return this.database.transaction(async (client) => {
      const updated = await client.query<{ provider_submission_state: ProviderSubmissionState }>(`UPDATE generation_batches SET
        provider_submission_state='uncertain',provider_submission_finished_at=NOW(),
        provider_submission_error=$3,status='failed',billing_status='manual_review_required',
        error=$3,finished_at=COALESCE(finished_at,NOW()),updated_at=NOW()
        WHERE id=$1 AND owner_subject=$2 AND provider_submission_state='started'
        RETURNING provider_submission_state`, [generationId, ownerSubject, message]);
      if (updated.rows[0]) {
        await client.query(`UPDATE billing_operation_mirrors SET
          status='manual_review_required',last_error=$3,updated_at=NOW()
          WHERE generation_id=$1 AND owner_subject=$2`, [generationId, ownerSubject, message]);
        return updated.rows[0].provider_submission_state;
      }
      const current = await client.query<{ provider_submission_state: ProviderSubmissionState }>(`SELECT provider_submission_state
        FROM generation_batches WHERE id=$1 AND owner_subject=$2`, [generationId, ownerSubject]);
      if (!current.rows[0]) throw new ResourceNotFoundError('generation not found');
      return current.rows[0].provider_submission_state;
    });
  }

  async setGenerationCredential(ownerSubject: string, generationId: string, ciphertext: string): Promise<void> {
    const result = await this.database.query(`UPDATE generation_batches SET billing_credential_ciphertext=$3,
      billing_status='reserve_pending',status=CASE WHEN status='draft' THEN 'submitting' ELSE status END,updated_at=NOW()
      WHERE id=$1 AND owner_subject=$2`, [generationId, ownerSubject, ciphertext]);
    if ((result.rowCount ?? 0) !== 1) throw new ResourceNotFoundError('generation not found');
  }

  async generationCredential(generationId: string): Promise<{ ownerSubject: string; ciphertext: string | null; operationId: string | null; reservationId: string | null; modelProfileId: string; idempotencyKey: string } | null> {
    const result = await this.database.query<QueryResultRow & {
      owner_subject: string; billing_credential_ciphertext: string | null; billing_operation_id: string | null;
      billing_reservation_id: string | null; model_profile_id: string; idempotency_key: string;
    }>(`SELECT owner_subject,billing_credential_ciphertext,billing_operation_id,billing_reservation_id,
      model_profile_id,idempotency_key FROM generation_batches WHERE id=$1`, [generationId]);
    const row = result.rows[0];
    return row ? {
      ownerSubject: row.owner_subject,
      ciphertext: row.billing_credential_ciphertext,
      operationId: row.billing_operation_id,
      reservationId: row.billing_reservation_id,
      modelProfileId: row.model_profile_id,
      idempotencyKey: row.idempotency_key,
    } : null;
  }

  async acceptGeneration(
    generationId: string,
    ownerSubject: string,
    taskIds: string[],
    expectedTaskCount: 1 | 2 = 2,
    continuationStageId?: string,
  ): Promise<PlatformTrack[]> {
    if (taskIds.length !== expectedTaskCount || taskIds.some((id) => !id)) {
      throw new Error(`provider must return exactly ${expectedTaskCount} task id${expectedTaskCount === 1 ? '' : 's'}`);
    }
    return this.database.transaction(async (client) => {
      const generation = await client.query<GenerationRow>(
        'SELECT * FROM generation_batches WHERE id=$1 AND owner_subject=$2 FOR UPDATE', [generationId, ownerSubject],
      );
      const row = generation.rows[0];
      if (!row) throw new ResourceNotFoundError('generation not found');
      if (!['started', 'accepted'].includes(row.provider_submission_state)) {
        throw new ResourceStateConflictError('generation has not crossed the durable Provider submission boundary');
      }
      if (continuationStageId) {
        const stage = await client.query<{ continuation_submission_state: ProviderSubmissionState }>(`SELECT continuation_submission_state
          FROM upload_extend_stages
          WHERE id=$1 AND generation_id=$2 AND owner_subject=$3 FOR UPDATE`, [
          continuationStageId, generationId, ownerSubject,
        ]);
        if (!stage.rows[0]
          || !['started', 'accepted'].includes(stage.rows[0].continuation_submission_state)) {
          throw new ResourceStateConflictError('upload-extend continuation is not in a durable submission state');
        }
      }
      const existing = await client.query<{ take_index: number; upstream_task_id: string }>(`SELECT
        t.take_index,pt.upstream_task_id FROM tracks t
        JOIN provider_tasks pt ON pt.track_id=t.id
        WHERE t.generation_id=$1 ORDER BY t.take_index`, [generationId]);
      if (existing.rows.length > 0) {
        const sameAcceptance = existing.rows.length === taskIds.length
          && existing.rows.every((task, index) => task.take_index === index && task.upstream_task_id === taskIds[index]);
        if (!sameAcceptance) {
          throw new ResourceStateConflictError('generation Provider task ids conflict with its durable acceptance');
        }
      } else {
        for (let takeIndex = 0; takeIndex < taskIds.length; takeIndex += 1) {
          const trackId = randomUUID();
          const request = row.request_json;
          const soundRequest = 'kind' in request && request.kind === 'sound' ? request : null;
          await client.query(`INSERT INTO tracks(
            id,generation_id,owner_subject,project_id,take_index,source_track_id,title,mode,operation,
            description,style,lyrics,instrumental,model,negative_tags,vocal_gender,style_weight,weirdness,
            sound_tempo,sound_key,sound_loop,status,stage,progress
          ) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,'queued','queued',0)`, [
            trackId, generationId, ownerSubject, row.project_id, takeIndex, row.source_track_id,
            request.title, request.mode, row.operation, request.description, request.style, request.lyrics,
            request.instrumental, request.model, request.negativeTags, request.vocalGender,
            request.styleWeight, request.weirdness,
            soundRequest?.soundTempo ?? null, soundRequest?.soundKey || null, soundRequest?.soundLoop ?? null,
          ]);
          await client.query(`INSERT INTO provider_tasks(
            id,generation_id,track_id,owner_subject,provider,upstream_task_id,status,stage,progress
          ) VALUES($1,$2,$3,$4,'mxapi-suno',$5,'queued','queued',0)`, [
            randomUUID(), generationId, trackId, ownerSubject, taskIds[takeIndex],
          ]);
        }
      }
      const accepted = await client.query(`UPDATE generation_batches SET status='queued',submitted_at=COALESCE(submitted_at,NOW()),
        provider_submission_state='accepted',provider_submission_finished_at=COALESCE(provider_submission_finished_at,NOW()),
        provider_submission_error=NULL,updated_at=NOW()
        WHERE id=$1 AND owner_subject=$2 AND provider_submission_state IN('started','accepted')`, [generationId, ownerSubject]);
      if ((accepted.rowCount ?? 0) !== 1) {
        throw new ResourceStateConflictError('generation acceptance conflicts with its durable submission state');
      }
      if (continuationStageId) {
        const completed = await client.query(`UPDATE upload_extend_stages SET
          status='done',stage='done',last_error=NULL,
          continuation_submission_state='accepted',continuation_submission_finished_at=NOW(),
          continuation_submission_error=NULL,finished_at=NOW(),updated_at=NOW()
          WHERE id=$1 AND generation_id=$2 AND owner_subject=$3
            AND continuation_submission_state IN('started','accepted')`, [
          continuationStageId, generationId, ownerSubject,
        ]);
        if ((completed.rowCount ?? 0) !== 1) {
          throw new ResourceStateConflictError('upload-extend continuation acceptance conflicts with its durable state');
        }
      }
      if (existing.rows.length === 0) {
        await client.query(`INSERT INTO outbox_events(id,aggregate_type,aggregate_id,event_type,payload_json)
          VALUES($1,'generation',$2,'generation.submitted',$3::jsonb)`, [
          randomUUID(), generationId, JSON.stringify({ generationId, ownerSubject }),
        ]);
      }
      const tracks = await client.query<TrackRow>(`${TRACK_SELECT}
        WHERE t.owner_subject=$1 AND t.generation_id=$2 ORDER BY t.take_index`, [ownerSubject, generationId]);
      return tracks.rows.map(trackFromRow);
    });
  }

  async acceptUploadExtendStage(
    generationId: string,
    ownerSubject: string,
    referenceAudioId: string,
    upstreamTaskId: string,
    continueAt: number,
    audioWeight: number | null,
  ): Promise<void> {
    await this.database.transaction(async (client) => {
      const generation = await client.query<GenerationRow>(`SELECT * FROM generation_batches
        WHERE id=$1 AND owner_subject=$2 AND operation='upload_extend' FOR UPDATE`, [generationId, ownerSubject]);
      if (!generation.rows[0]) throw new ResourceNotFoundError('upload-extend generation not found');
      if (!['started', 'accepted'].includes(generation.rows[0].provider_submission_state)) {
        throw new ResourceStateConflictError('upload-extend has not crossed the durable Provider submission boundary');
      }
      const existing = await client.query<QueryResultRow & {
        owner_subject: string; reference_audio_id: string | null; upstream_task_id: string;
        continue_at: string | number; audio_weight: string | number | null;
      }>(`SELECT owner_subject,reference_audio_id,upstream_task_id,continue_at,audio_weight
        FROM upload_extend_stages WHERE generation_id=$1 FOR UPDATE`, [generationId]);
      if (existing.rows[0]) {
        const row = existing.rows[0];
        if (row.owner_subject !== ownerSubject
          || row.reference_audio_id !== referenceAudioId
          || row.upstream_task_id !== upstreamTaskId
          || Number(row.continue_at) !== continueAt
          || (row.audio_weight === null ? null : Number(row.audio_weight)) !== audioWeight) {
          throw new ResourceStateConflictError('upload-extend Provider task conflicts with its durable acceptance');
        }
      } else {
        await client.query(`INSERT INTO upload_extend_stages(
          id,generation_id,owner_subject,reference_audio_id,upstream_task_id,continue_at,audio_weight,status,stage
        ) VALUES($1,$2,$3,$4,$5,$6,$7,'queued','uploading')`, [
          randomUUID(), generationId, ownerSubject, referenceAudioId, upstreamTaskId, continueAt, audioWeight,
        ]);
      }
      const accepted = await client.query(`UPDATE generation_batches SET status='queued',submitted_at=COALESCE(submitted_at,NOW()),
        provider_submission_state='accepted',provider_submission_finished_at=COALESCE(provider_submission_finished_at,NOW()),
        provider_submission_error=NULL,updated_at=NOW()
        WHERE id=$1 AND owner_subject=$2 AND provider_submission_state IN('started','accepted')`, [generationId, ownerSubject]);
      if ((accepted.rowCount ?? 0) !== 1) {
        throw new ResourceStateConflictError('upload-extend acceptance conflicts with its durable submission state');
      }
      if (!existing.rows[0]) {
        await client.query(`INSERT INTO outbox_events(id,aggregate_type,aggregate_id,event_type,payload_json)
          VALUES($1,'generation',$2,'generation.upload.started',$3::jsonb)`, [
          randomUUID(), generationId, JSON.stringify({ generationId, ownerSubject, referenceAudioId }),
        ]);
      }
    });
  }

  async listPollableUploadExtendStages(
    limit = 50,
    generationId: string | null = null,
    leaseMs = 15 * 60_000,
  ): Promise<PollableUploadExtendStage[]> {
    const boundedLimit = Math.min(100, Math.max(1, limit));
    const boundedLease = Math.min(60 * 60_000, Math.max(30_000, leaseMs));
    const pollLeaseToken = randomUUID();
    return this.database.transaction(async (client) => {
      const result = await client.query<QueryResultRow & {
        id: string; generation_id: string; owner_subject: string; upstream_task_id: string; attempts: number;
        terminal_wait_started_at: Date | null; poll_lease_token: string;
      }>(`WITH candidates AS (
          SELECT id FROM upload_extend_stages
          WHERE status IN('queued','running') AND next_poll_at<=NOW()
            AND ($2::text IS NULL OR generation_id=$2)
          ORDER BY next_poll_at
          FOR UPDATE SKIP LOCKED
          LIMIT $1
        ), leased AS (
          UPDATE upload_extend_stages s
          SET next_poll_at=NOW()+($3::text || ' milliseconds')::interval,
            poll_lease_token=$4::uuid,updated_at=NOW()
          FROM candidates c WHERE s.id=c.id
          RETURNING s.id,s.generation_id,s.owner_subject,s.upstream_task_id,s.attempts,
            s.terminal_wait_started_at,s.poll_lease_token
        ) SELECT * FROM leased`, [boundedLimit, generationId, boundedLease, pollLeaseToken]);
      return result.rows.map((row) => ({
        id: row.id,
        generationId: row.generation_id,
        ownerSubject: row.owner_subject,
        upstreamTaskId: row.upstream_task_id,
        attempts: row.attempts,
        terminalWaitStartedAt: row.terminal_wait_started_at,
        pollLeaseToken: row.poll_lease_token,
      }));
    });
  }

  async applyUploadExtendStageResult(
    stage: PollableUploadExtendStage,
    result: NormalizedSunoTask,
    nextPollMs: number,
  ): Promise<'pending' | 'ready' | 'error' | 'stale'> {
    const ready = Boolean(result.customId)
      && (result.upstreamStatus === 'completed' || result.providerStatus === 3 || result.progress >= 1);
    const status = result.status === 'error' ? 'error' : ready ? 'continuation_ready' : 'running';
    const terminalResultMissing = !ready
      && (result.upstreamStatus === 'completed' || result.providerStatus === 3);
    const applied = await this.database.transaction(async (client) => {
      const updated = await client.query<{ id: string }>(`UPDATE upload_extend_stages SET
        provider_record_id=COALESCE($2,provider_record_id),custom_id=COALESCE($3,custom_id),
        status=$4,stage=CASE WHEN $4='continuation_ready' THEN 'continuation' WHEN $4='error' THEN 'error' ELSE 'uploading' END,
        progress=$5,attempts=attempts+1,last_polled_at=NOW(),
        next_poll_at=NOW()+($6::text || ' milliseconds')::interval,last_error=$7,updated_at=NOW(),
        terminal_wait_started_at=CASE WHEN $9 THEN COALESCE(terminal_wait_started_at,NOW()) ELSE NULL END,
        finished_at=CASE WHEN $4='error' THEN NOW() ELSE finished_at END
        WHERE id=$1 AND owner_subject=$8 AND poll_lease_token=$10::uuid
          AND status IN('queued','running')
        RETURNING id`, [
        stage.id, result.providerRecordId, result.customId, status, result.progress,
        nextPollMs, result.error, stage.ownerSubject, terminalResultMissing, stage.pollLeaseToken,
      ]);
      if (!updated.rows[0]) return false;
      await client.query(`UPDATE generation_batches SET
        status=CASE WHEN $2='error' THEN 'failed' ELSE 'running' END,
        error=CASE WHEN $2='error' THEN $3 ELSE error END,
        finished_at=CASE WHEN $2='error' THEN NOW() ELSE finished_at END,updated_at=NOW()
        WHERE id=$1 AND owner_subject=$4`, [stage.generationId, status, result.error, stage.ownerSubject]);
      return true;
    });
    if (!applied) return 'stale';
    return status === 'continuation_ready' ? 'ready' : status === 'error' ? 'error' : 'pending';
  }

  async markUploadExtendStagePollFailure(
    stage: PollableUploadExtendStage,
    error: string,
    nextPollMs: number,
    terminal: boolean,
    releaseSafe = false,
  ): Promise<boolean> {
    return this.database.transaction(async (client) => {
      const updated = await client.query<{ id: string }>(`UPDATE upload_extend_stages SET attempts=attempts+1,last_polled_at=NOW(),
        next_poll_at=NOW()+($2::text || ' milliseconds')::interval,last_error=$3,
        status=CASE WHEN $4 THEN 'error' ELSE status END,
        stage=CASE WHEN $4 THEN 'error' ELSE stage END,
        finished_at=CASE WHEN $4 THEN NOW() ELSE finished_at END,updated_at=NOW()
        WHERE id=$1 AND owner_subject=$6 AND poll_lease_token=$5::uuid AND status IN('queued','running') RETURNING id`, [
        stage.id, nextPollMs, error.slice(0, 1000), terminal, stage.pollLeaseToken, stage.ownerSubject,
      ]);
      if (!updated.rows[0]) return false;
      if (terminal) {
        await client.query(`UPDATE generation_batches SET status='failed',error=$2,
          billing_status=CASE
            WHEN $3 AND billing_status='reserved' THEN 'release_required'
            WHEN NOT $3 AND billing_status IN('reserved','reserve_pending','reconcile_required') THEN 'manual_review_required'
            ELSE billing_status END,
          finished_at=NOW(),updated_at=NOW() WHERE id=$1 AND owner_subject=$4`, [
          stage.generationId, error.slice(0, 1000), releaseSafe, stage.ownerSubject,
        ]);
        if (!releaseSafe) {
          await client.query(`UPDATE billing_operation_mirrors SET status='manual_review_required',
            last_error=$2,updated_at=NOW() WHERE generation_id=$1 AND owner_subject=$3`, [
            stage.generationId, error.slice(0, 1000), stage.ownerSubject,
          ]);
        }
      }
      return true;
    });
  }

  async claimUploadExtendContinuation(
    stageId: string,
    pollLeaseToken: string | null = null,
  ): Promise<UploadExtendContinuation | null> {
    return this.database.transaction(async (client) => {
      const result = await client.query<QueryResultRow & {
        id: string; custom_id: string | null; status: string;
        continuation_submission_state: ProviderSubmissionState;
        generation_id: string; continue_at: number; audio_weight: number | null;
      }>(`SELECT id,generation_id,custom_id,status,continuation_submission_state,continue_at,audio_weight
        FROM upload_extend_stages
        WHERE id=$1 AND ($2::uuid IS NULL OR poll_lease_token=$2::uuid) FOR UPDATE`, [stageId, pollLeaseToken]);
      const stage = result.rows[0];
      if (!stage?.custom_id) return null;
      if (stage.status !== 'continuation_ready' || stage.continuation_submission_state !== 'not_started') return null;
      const generation = await client.query<GenerationRow>('SELECT * FROM generation_batches WHERE id=$1 FOR UPDATE', [stage.generation_id]);
      if (!generation.rows[0] || ['succeeded','partial','failed'].includes(generation.rows[0].status)) return null;
      await client.query(`UPDATE upload_extend_stages SET status='continuation_submitting',stage='continuation',
        continuation_submission_state='started',continuation_submission_started_at=NOW(),
        continuation_submission_finished_at=NULL,continuation_submission_error=NULL,
        updated_at=NOW(),next_poll_at=NOW()+INTERVAL '10 minutes' WHERE id=$1`, [stageId]);
      return {
        stageId,
        generation: generationFromRow(generation.rows[0]),
        customId: stage.custom_id,
        continueAt: Number(stage.continue_at),
        audioWeight: stage.audio_weight === null ? null : Number(stage.audio_weight),
      };
    });
  }

  async listRecoverableUploadExtendContinuations(limit = 50): Promise<string[]> {
    const result = await this.database.query<{ id: string }>(`SELECT id FROM upload_extend_stages
      WHERE status='continuation_ready' AND continuation_submission_state='not_started'
      ORDER BY updated_at LIMIT $1`, [Math.min(100, Math.max(1, limit))]);
    return result.rows.map((row) => row.id);
  }

  async failUploadExtendContinuation(
    stageId: string,
    error: string,
    outcome: 'rejected' | 'uncertain',
  ): Promise<ProviderSubmissionState> {
    const message = error.slice(0, 1000);
    return this.database.transaction(async (client) => {
      const updated = await client.query<QueryResultRow & {
        generation_id: string;
        owner_subject: string;
        continuation_submission_state: ProviderSubmissionState;
      }>(`UPDATE upload_extend_stages SET
        status=CASE WHEN $3='uncertain' THEN 'manual_review_required' ELSE 'error' END,
        stage='error',last_error=$2,
        continuation_submission_state=$3,continuation_submission_finished_at=NOW(),
        continuation_submission_error=$2,finished_at=NOW(),updated_at=NOW()
        WHERE id=$1 AND continuation_submission_state='started'
        RETURNING generation_id,owner_subject,continuation_submission_state`, [stageId, message, outcome]);
      const row = updated.rows[0];
      if (row) {
        await client.query(`UPDATE generation_batches SET status='failed',
          billing_status=CASE WHEN $3='uncertain' THEN 'manual_review_required'
            WHEN billing_status IN('reserved','reserve_pending','reconcile_required') THEN 'release_required'
            ELSE billing_status END,
          error=$2,finished_at=COALESCE(finished_at,NOW()),updated_at=NOW()
          WHERE id=$1 AND owner_subject=$4`, [row.generation_id, message, outcome, row.owner_subject]);
        if (outcome === 'uncertain') {
          await client.query(`UPDATE billing_operation_mirrors SET
            status='manual_review_required',last_error=$3,updated_at=NOW()
            WHERE generation_id=$1 AND owner_subject=$2`, [row.generation_id, row.owner_subject, message]);
        }
        return row.continuation_submission_state;
      }
      const current = await client.query<{ continuation_submission_state: ProviderSubmissionState }>(`SELECT continuation_submission_state
        FROM upload_extend_stages WHERE id=$1`, [stageId]);
      if (!current.rows[0]) throw new ResourceNotFoundError('upload-extend stage not found');
      return current.rows[0].continuation_submission_state;
    });
  }

  async markStaleUploadExtendContinuationsUncertain(limit = 50): Promise<number> {
    const message = 'stale upload-extend continuation has an unknown Provider outcome; automatic retry and release are disabled';
    return this.database.transaction(async (client) => {
      const stale = await client.query<QueryResultRow & { id: string; generation_id: string; owner_subject: string }>(`SELECT
        id,generation_id,owner_subject FROM upload_extend_stages
        WHERE continuation_submission_state='started'
          AND continuation_submission_started_at<NOW()-INTERVAL '10 minutes'
        ORDER BY continuation_submission_started_at
        LIMIT $1 FOR UPDATE SKIP LOCKED`, [Math.min(100, Math.max(1, limit))]);
      for (const stage of stale.rows) {
        await client.query(`UPDATE upload_extend_stages SET
          status='manual_review_required',stage='error',last_error=$2,
          continuation_submission_state='uncertain',continuation_submission_finished_at=NOW(),
          continuation_submission_error=$2,finished_at=COALESCE(finished_at,NOW()),updated_at=NOW()
          WHERE id=$1 AND continuation_submission_state='started'`, [stage.id, message]);
        await client.query(`UPDATE generation_batches SET status='failed',billing_status='manual_review_required',
          error=$2,finished_at=COALESCE(finished_at,NOW()),updated_at=NOW()
          WHERE id=$1 AND owner_subject=$3`, [stage.generation_id, message, stage.owner_subject]);
        await client.query(`UPDATE billing_operation_mirrors SET
          status='manual_review_required',last_error=$3,updated_at=NOW()
          WHERE generation_id=$1 AND owner_subject=$2`, [stage.generation_id, stage.owner_subject, message]);
      }
      return stale.rows.length;
    });
  }

  async failGeneration(ownerSubject: string, generationId: string, error: string, billingStatus = 'release_required'): Promise<void> {
    await this.database.query(`UPDATE generation_batches SET status='failed',billing_status=$3,error=$4,
      finished_at=NOW(),updated_at=NOW() WHERE id=$1 AND owner_subject=$2`, [generationId, ownerSubject, billingStatus, error]);
  }

  async getGeneration(ownerSubject: string, id: string): Promise<GenerationIntent | null> {
    const result = await this.database.query<GenerationRow>('SELECT * FROM generation_batches WHERE id=$1 AND owner_subject=$2', [id, ownerSubject]);
    return result.rows[0] ? generationFromRow(result.rows[0]) : null;
  }

  async tracksForGeneration(ownerSubject: string, generationId: string): Promise<PlatformTrack[]> {
    const result = await this.database.query<TrackRow>(`${TRACK_SELECT}
      WHERE t.owner_subject=$1 AND t.generation_id=$2${VISIBLE_TRACK_CLAUSE} ORDER BY t.take_index`, [ownerSubject, generationId]);
    return result.rows.map(trackFromRow);
  }

  async listTracks(ownerSubject: string, options: { projectId?: string; limit?: number; offset?: number } = {}): Promise<PlatformTrack[]> {
    const values: unknown[] = [ownerSubject];
    let projectClause = '';
    if (options.projectId) {
      values.push(options.projectId);
      projectClause = ` AND t.project_id=$${values.length}`;
    }
    values.push(Math.min(200, Math.max(1, options.limit ?? 100)));
    const limitIndex = values.length;
    values.push(Math.max(0, options.offset ?? 0));
    const result = await this.database.query<TrackRow>(`${TRACK_SELECT}
      WHERE t.owner_subject=$1${projectClause}${VISIBLE_TRACK_CLAUSE} ORDER BY t.created_at DESC LIMIT $${limitIndex} OFFSET $${values.length}`, values);
    return result.rows.map(trackFromRow);
  }

  async getTrack(ownerSubject: string, id: string): Promise<PlatformTrack | null> {
    const result = await this.database.query<TrackRow>(`${TRACK_SELECT} WHERE t.owner_subject=$1 AND t.id=$2${VISIBLE_TRACK_CLAUSE}`, [ownerSubject, id]);
    return result.rows[0] ? trackFromRow(result.rows[0]) : null;
  }

  async deleteTrack(ownerSubject: string, id: string): Promise<TrackAsset[] | null> {
    return this.database.transaction(async (client) => {
      const found = await client.query<{
        id: string; generation_status: string; billing_status: string;
      }>(`SELECT t.id,g.status AS generation_status,g.billing_status
          FROM tracks t JOIN generation_batches g ON g.id=t.generation_id
          WHERE t.id=$1 AND t.owner_subject=$2
          FOR UPDATE OF t,g`, [id, ownerSubject]);
      const row = found.rows[0];
      if (!row) return null;
      const linkedMv = await client.query('SELECT id FROM mv_projects WHERE track_id=$1 AND owner_subject=$2 AND deleted_at IS NULL LIMIT 1', [id, ownerSubject]);
      if (linkedMv.rowCount) throw new ResourceStateConflictError('此歌曲仍有关联的 MV 项目，请先删除对应 MV 项目后再删除源歌曲');
      const generationTerminal = ['succeeded', 'partial', 'failed'].includes(row.generation_status);
      const billingTerminal = ['captured', 'partially_captured', 'settled', 'released', 'refunded', 'disabled', 'not_reserved']
        .includes(row.billing_status);
      if (!generationTerminal || !billingTerminal) {
        throw new ResourceStateConflictError('track cannot be deleted until its generation and billing are terminal');
      }
      const activeAssets = await client.query<{ count: string }>(`SELECT COUNT(*)::text AS count
        FROM track_asset_jobs WHERE track_id=$1
          AND (status NOT IN('succeeded','failed')
            OR billing_status NOT IN('captured','partially_captured','settled','released','refunded','disabled','not_reserved'))`, [id]);
      if (Number(activeAssets.rows[0]?.count ?? 0) > 0) {
        throw new ResourceStateConflictError('track cannot be deleted until all asset jobs and billing are terminal');
      }
      const assets = await client.query<QueryResultRow & {
        id: string; track_id: string; owner_subject: string; kind: TrackAsset['kind']; object_key: string;
        mime_type: string; byte_size: string; etag: string | null; checksum_sha256: string;
      }>('SELECT * FROM track_assets WHERE track_id=$1 AND deleted_at IS NULL', [id]);
      for (const asset of assets.rows) {
        await client.query(`INSERT INTO storage_tombstones(id,owner_subject,object_key,reason)
          VALUES($1,$2,$3,'track_deleted') ON CONFLICT(object_key) DO NOTHING`, [randomUUID(), ownerSubject, asset.object_key]);
      }
      const stems = await client.query<{object_key:string}>('SELECT object_key FROM mv_audio_stems WHERE track_id=$1 AND owner_subject=$2',[id,ownerSubject]);
      for (const stem of stems.rows) await client.query("INSERT INTO storage_tombstones(id,owner_subject,object_key,reason) VALUES($1,$2,$3,'track_stem_deleted') ON CONFLICT(object_key) DO NOTHING",[randomUUID(),ownerSubject,stem.object_key]);
      await client.query('DELETE FROM tracks WHERE id=$1 AND owner_subject=$2' , [id, ownerSubject]);
      return assets.rows.map((asset) => ({
        id: asset.id, trackId: asset.track_id, ownerSubject: asset.owner_subject, kind: asset.kind,
        objectKey: asset.object_key, mimeType: asset.mime_type, byteSize: Number(asset.byte_size),
        etag: asset.etag, checksumSha256: asset.checksum_sha256,
      }));
    });
  }

  async listPollableTasks(
    limit = 50,
    generationId: string | null = null,
    leaseMs = 15 * 60_000,
  ): Promise<PollableProviderTask[]> {
    const boundedLimit = Math.min(100, Math.max(1, limit));
    const boundedLease = Math.min(60 * 60_000, Math.max(30_000, leaseMs));
    const pollLeaseToken = randomUUID();
    return this.database.transaction(async (client) => {
      const result = await client.query<QueryResultRow & {
        id: string; generation_id: string; track_id: string; owner_subject: string; upstream_task_id: string; attempts: number;
        terminal_wait_started_at: Date | null; poll_lease_token: string;
      }>(`WITH candidates AS (
          SELECT id FROM provider_tasks
          WHERE status IN('queued','running') AND next_poll_at<=NOW()
            AND ($2::text IS NULL OR generation_id=$2)
          ORDER BY next_poll_at
          FOR UPDATE SKIP LOCKED
          LIMIT $1
        ), leased AS (
          UPDATE provider_tasks p
          SET next_poll_at=NOW()+($3::text || ' milliseconds')::interval,
            poll_lease_token=$4::uuid,updated_at=NOW()
          FROM candidates c WHERE p.id=c.id
          RETURNING p.id,p.generation_id,p.track_id,p.owner_subject,p.upstream_task_id,p.attempts,
            p.terminal_wait_started_at,p.poll_lease_token
        ) SELECT * FROM leased`, [boundedLimit, generationId, boundedLease, pollLeaseToken]);
      return result.rows.map((row) => ({
        id: row.id, generationId: row.generation_id, trackId: row.track_id,
        ownerSubject: row.owner_subject, upstreamTaskId: row.upstream_task_id, attempts: row.attempts,
        terminalWaitStartedAt: row.terminal_wait_started_at,
        pollLeaseToken: row.poll_lease_token,
      }));
    });
  }

  async applyProviderResult(task: PollableProviderTask, result: NormalizedSunoTask, nextPollMs: number): Promise<boolean> {
    const terminalResultMissing = !result.audioUrl
      && (result.upstreamStatus === 'completed' || result.providerStatus === 3);
    return this.database.transaction(async (client) => {
      const updated = await client.query<{ id: string }>(`UPDATE provider_tasks SET custom_id=COALESCE($2,custom_id),provider_record_id=COALESCE($8,provider_record_id),status=$3,stage=$4,progress=$5,
        attempts=attempts+1,last_polled_at=NOW(),next_poll_at=NOW()+($6::text || ' milliseconds')::interval,
        last_error=$7,terminal_wait_started_at=CASE WHEN $9 THEN COALESCE(terminal_wait_started_at,NOW()) ELSE NULL END,
        updated_at=NOW() WHERE id=$1 AND poll_lease_token=$10::uuid
          AND status IN('queued','running') RETURNING id`, [
        task.id, result.customId, result.status, result.stage, result.progress, nextPollMs, result.error,
        result.providerRecordId, terminalResultMissing, task.pollLeaseToken,
      ]);
      if (!updated.rows[0]) return false;
      await client.query(`UPDATE tracks SET title=COALESCE($2,title),style=COALESCE($3,style),lyrics=COALESCE($4,lyrics),
        instrumental=COALESCE($5,instrumental),model=COALESCE($6,model),status=$7,stage=$8,progress=$9,
        custom_id=COALESCE($10,custom_id),duration=COALESCE($11,duration),points_cost=COALESCE($12,points_cost),
        points_refunded=COALESCE($13,points_refunded),upstream_status=$14,error=$15,
        provider_record_id=COALESCE($17,provider_record_id),
        finished_at=CASE WHEN $7='error' THEN COALESCE(finished_at,NOW()) ELSE finished_at END,updated_at=NOW()
        WHERE id=$1 AND owner_subject=$16`, [
        task.trackId, result.title, result.style, result.lyrics, result.instrumental, result.model,
        result.status, result.stage, result.progress, result.customId, result.duration,
        result.pointsCost, result.pointsRefunded, result.upstreamStatus, result.error, task.ownerSubject,
        result.providerRecordId,
      ]);
      await client.query(`UPDATE generation_batches SET status=CASE WHEN status IN('queued','submitting') THEN 'running' ELSE status END,
        updated_at=NOW() WHERE id=$1`, [task.generationId]);
      return true;
    });
  }

  async markTaskPollFailure(
    task: PollableProviderTask,
    error: string,
    nextPollMs: number,
    terminal: boolean,
    releaseSafe = false,
  ): Promise<boolean> {
    return this.database.transaction(async (client) => {
      const updated = await client.query<{ id: string }>(`UPDATE provider_tasks SET attempts=attempts+1,last_polled_at=NOW(),
        next_poll_at=NOW()+($2::text || ' milliseconds')::interval,last_error=$3,
        status=CASE WHEN $4 THEN 'error' ELSE status END,stage=CASE WHEN $4 THEN 'error' ELSE stage END,updated_at=NOW()
        WHERE id=$1 AND poll_lease_token=$5::uuid AND status IN('queued','running') RETURNING id`, [
        task.id, nextPollMs, error, terminal, task.pollLeaseToken,
      ]);
      if (!updated.rows[0]) return false;
      if (terminal) {
        await client.query(`UPDATE tracks SET status='error',stage='error',progress=1,error=$2,finished_at=NOW(),updated_at=NOW()
          WHERE id=$1 AND owner_subject=$3`, [task.trackId, error, task.ownerSubject]);
        await client.query(`UPDATE generation_batches SET billing_status=CASE
            WHEN $4 AND billing_status='reserved' THEN 'release_required'
            WHEN NOT $4 AND billing_status IN('reserved','reserve_pending','capture_required','release_required','reconcile_required')
              THEN 'manual_review_required'
            ELSE billing_status END,
          error=$2,updated_at=NOW() WHERE id=$1 AND owner_subject=$3
            AND billing_status IN('reserved','reserve_pending','capture_required','release_required','reconcile_required')`, [
          task.generationId, error.slice(0, 1000), task.ownerSubject, releaseSafe,
        ]);
        if (!releaseSafe) {
          await client.query(`UPDATE billing_operation_mirrors SET status='manual_review_required',
            last_error=$3,updated_at=NOW() WHERE generation_id=$1 AND owner_subject=$2`, [
            task.generationId, task.ownerSubject, error.slice(0, 1000),
          ]);
        }
      }
      return true;
    });
  }

  async upsertAsset(asset: TrackAsset, client?: DatabaseClient): Promise<string> {
    return client ? upsertTrackAssetRecord(client, asset) : this.database.transaction((transaction) => upsertTrackAssetRecord(transaction, asset));
  }

  async getAsset(ownerSubject: string, trackId: string, kind: TrackAsset['kind']): Promise<TrackAsset | null> {
    const result = await this.database.query<QueryResultRow & {
      id: string; track_id: string; owner_subject: string; kind: TrackAsset['kind']; object_key: string;
      mime_type: string; byte_size: string; etag: string | null; checksum_sha256: string;
    }>(`SELECT * FROM track_assets WHERE owner_subject=$1 AND track_id=$2 AND kind=$3 AND deleted_at IS NULL`, [
      ownerSubject, trackId, kind,
    ]);
    const row = result.rows[0];
    return row ? {
      id: row.id, trackId: row.track_id, ownerSubject: row.owner_subject, kind: row.kind,
      objectKey: row.object_key, mimeType: row.mime_type, byteSize: Number(row.byte_size),
      etag: row.etag, checksumSha256: row.checksum_sha256,
    } : null;
  }

  async createTrackAssetJob(input: {
    id: string;
    ownerSubject: string;
    trackId: string;
    action: TrackAssetAction;
    operationCode: string;
    idempotencyKey: string;
    request: Record<string, unknown>;
    estimatedCredits: number;
    maxConcurrent?: number;
  }): Promise<{ job: TrackAssetJob; replay: boolean }> {
    const requestDigest = digestJson({
      trackId: input.trackId,
      action: input.action,
      operationCode: input.operationCode,
      request: input.request,
    });
    return this.database.transaction(async (client) => {
      await client.query('SELECT pg_advisory_xact_lock(hashtext($1),hashtext($2))', [
        input.ownerSubject, `music.asset:${input.idempotencyKey}`,
      ]);
      const idempotency = await client.query<{ request_digest: string; resource_id: string | null }>(`SELECT request_digest,resource_id
        FROM idempotency_keys WHERE owner_subject=$1 AND scope='music.asset' AND idempotency_key=$2`, [
        input.ownerSubject, input.idempotencyKey,
      ]);
      if (idempotency.rows[0]) {
        if (idempotency.rows[0].request_digest !== requestDigest) {
          throw new IdempotencyConflictError('idempotency key was already used for a different track asset request');
        }
        const replay = await client.query<AssetJobRow>(`${ASSET_JOB_SELECT}
          WHERE j.id=$1 AND j.owner_subject=$2`, [idempotency.rows[0].resource_id, input.ownerSubject]);
        if (!replay.rows[0]) throw new IdempotencyConflictError('idempotent track asset result is no longer available');
        return { job: assetJobFromRow(replay.rows[0]), replay: true };
      }
      const track = await client.query(`SELECT id FROM tracks
        WHERE id=$1 AND owner_subject=$2 AND status='done' FOR SHARE`, [input.trackId, input.ownerSubject]);
      if (!track.rows[0]) throw new ResourceNotFoundError('completed source track not found');
      await client.query('SELECT pg_advisory_xact_lock(hashtext($1),hashtext($2))', [
        input.ownerSubject, 'music.asset.concurrent',
      ]);
      const active = await client.query<{ count: string }>(`SELECT COUNT(*)::text AS count FROM track_asset_jobs
        WHERE owner_subject=$1 AND status IN('draft','submitting','queued','running')`, [input.ownerSubject]);
      if (Number(active.rows[0]?.count ?? 0) >= (input.maxConcurrent ?? 4)) {
        throw new ConcurrencyLimitError('concurrent track asset job limit exceeded');
      }
      const created = await client.query<AssetJobRow>(`INSERT INTO track_asset_jobs(
        id,track_id,owner_subject,action,operation_code,idempotency_key,request_digest,
        request_json,status,estimated_credits,billing_status
      ) VALUES($1,$2,$3,$4,$5,$6,$7,$8::jsonb,'draft',$9,'draft') RETURNING *,NULL::text AS asset_kind`, [
        input.id, input.trackId, input.ownerSubject, input.action, input.operationCode,
        input.idempotencyKey, requestDigest, JSON.stringify(input.request), input.estimatedCredits,
      ]);
      await client.query(`INSERT INTO idempotency_keys(
        owner_subject,scope,idempotency_key,request_digest,resource_id,expires_at
      ) VALUES($1,'music.asset',$2,$3,$4,NOW()+INTERVAL '30 days')`, [
        input.ownerSubject, input.idempotencyKey, requestDigest, input.id,
      ]);
      return { job: assetJobFromRow(created.rows[0]!), replay: false };
    });
  }

  async getTrackAssetJob(ownerSubject: string, id: string): Promise<TrackAssetJob | null> {
    const result = await this.database.query<AssetJobRow>(`${ASSET_JOB_SELECT}
      WHERE j.id=$1 AND j.owner_subject=$2`, [id, ownerSubject]);
    return result.rows[0] ? assetJobFromRow(result.rows[0]) : null;
  }

  async listTrackAssetJobs(ownerSubject: string, trackId: string, limit = 100): Promise<TrackAssetJob[]> {
    const result = await this.database.query<AssetJobRow>(`${ASSET_JOB_SELECT}
      WHERE j.owner_subject=$1 AND j.track_id=$2 ORDER BY j.created_at DESC LIMIT $3`, [
      ownerSubject, trackId, Math.min(200, Math.max(1, limit)),
    ]);
    return result.rows.map(assetJobFromRow);
  }

  async setTrackAssetJobCredential(ownerSubject: string, id: string, ciphertext: string): Promise<void> {
    const result = await this.database.query(`UPDATE track_asset_jobs SET
      billing_credential_ciphertext=$3,billing_status='reserve_pending',status='submitting',updated_at=NOW()
      WHERE id=$1 AND owner_subject=$2`, [id, ownerSubject, ciphertext]);
    if ((result.rowCount ?? 0) !== 1) throw new ResourceNotFoundError('track asset job not found');
  }

  async setTrackAssetJobReservation(input: {
    id: string;
    ownerSubject: string;
    operationId: string;
    reservationId: string;
    operationCode: string;
    priceVersion: string;
    reservedCredits: number;
    status: BillingReservation['status'] | 'manual_review_required';
  }): Promise<void> {
    await this.database.transaction(async (client) => {
      const updated = await client.query(`UPDATE track_asset_jobs SET
        billing_operation_id=$3,billing_reservation_id=$4,operation_code=$5,price_version=$6,
        estimated_credits=$7,billing_status=$8,status=CASE WHEN status='draft' THEN 'submitting' ELSE status END,
        updated_at=NOW() WHERE id=$1 AND owner_subject=$2`, [
        input.id, input.ownerSubject, input.operationId, input.reservationId, input.operationCode,
        input.priceVersion, input.reservedCredits, input.status,
      ]);
      if ((updated.rowCount ?? 0) !== 1) throw new ResourceNotFoundError('track asset job not found');
      const mirror = await client.query<{ id: string }>(`INSERT INTO billing_operation_mirrors(
        id,owner_subject,asset_job_id,remote_operation_id,remote_reservation_id,operation_code,
        idempotency_key,price_version,reserved_credits,status
      ) SELECT $1,owner_subject,id,$2,$3,$4,'asset:'||idempotency_key,$5,$6,$7
        FROM track_asset_jobs WHERE id=$8
      ON CONFLICT(owner_subject,idempotency_key) DO UPDATE SET
        remote_operation_id=EXCLUDED.remote_operation_id,remote_reservation_id=EXCLUDED.remote_reservation_id,
        operation_code=EXCLUDED.operation_code,price_version=EXCLUDED.price_version,
        reserved_credits=EXCLUDED.reserved_credits,status=EXCLUDED.status,updated_at=NOW()
      WHERE billing_operation_mirrors.asset_job_id=EXCLUDED.asset_job_id
        AND billing_operation_mirrors.generation_id IS NULL
        AND billing_operation_mirrors.ai_run_id IS NULL
      RETURNING billing_operation_mirrors.id`, [
        randomUUID(), input.operationId, input.reservationId, input.operationCode,
        input.priceVersion, input.reservedCredits, input.status, input.id,
      ]);
      if ((mirror.rowCount ?? 0) !== 1) {
        throw new IdempotencyConflictError('billing mirror key is already bound to another resource');
      }
    });
  }

  async claimTrackAssetProviderSubmission(
    ownerSubject: string,
    id: string,
  ): Promise<ProviderSubmissionClaim> {
    return this.database.transaction(async (client) => {
      const claimed = await client.query<{ id: string }>(`UPDATE track_asset_jobs SET
        provider_submission_state='started',provider_submission_started_at=NOW(),
        provider_submission_finished_at=NULL,provider_submission_error=NULL,updated_at=NOW()
        WHERE id=$1 AND owner_subject=$2 AND provider_submission_state='not_started'
          AND status='submitting' AND billing_status IN('reserved','disabled')
        RETURNING id`, [id, ownerSubject]);
      if (claimed.rows[0]) return 'claimed';

      const current = await client.query<QueryResultRow & {
        provider_submission_state: ProviderSubmissionState;
        stale_started: boolean;
      }>(`SELECT provider_submission_state,
          (provider_submission_state='started'
            AND provider_submission_started_at<NOW()-INTERVAL '10 minutes') AS stale_started
        FROM track_asset_jobs WHERE id=$1 AND owner_subject=$2 FOR UPDATE`, [id, ownerSubject]);
      const row = current.rows[0];
      if (!row) throw new ResourceNotFoundError('track asset job not found');
      if (row.stale_started) {
        const message = 'stale asset Provider submission has an unknown outcome; automatic retry and release are disabled';
        await client.query(`UPDATE track_asset_jobs SET
          provider_submission_state='uncertain',provider_submission_finished_at=NOW(),
          provider_submission_error=$3,status='failed',billing_status='manual_review_required',
          error=$3,finished_at=COALESCE(finished_at,NOW()),updated_at=NOW()
          WHERE id=$1 AND owner_subject=$2 AND provider_submission_state='started'`, [id, ownerSubject, message]);
        await client.query(`UPDATE billing_operation_mirrors SET
          status='manual_review_required',last_error=$3,updated_at=NOW()
          WHERE asset_job_id=$1 AND owner_subject=$2`, [id, ownerSubject, message]);
        return 'uncertain';
      }
      if (row.provider_submission_state === 'not_started') {
        throw new ResourceStateConflictError('asset Provider submission requires a durable billing reservation');
      }
      return row.provider_submission_state === 'started'
        ? 'already_started'
        : row.provider_submission_state;
    });
  }

  async markTrackAssetProviderSubmissionRejected(
    ownerSubject: string,
    id: string,
    error: string,
  ): Promise<ProviderSubmissionState> {
    const message = error.slice(0, 1000);
    return this.database.transaction(async (client) => {
      const updated = await client.query<{ provider_submission_state: ProviderSubmissionState }>(`UPDATE track_asset_jobs SET
        provider_submission_state='rejected',provider_submission_finished_at=NOW(),
        provider_submission_error=$3,updated_at=NOW()
        WHERE id=$1 AND owner_subject=$2 AND provider_submission_state='started'
        RETURNING provider_submission_state`, [id, ownerSubject, message]);
      if (updated.rows[0]) return updated.rows[0].provider_submission_state;
      const current = await client.query<{ provider_submission_state: ProviderSubmissionState }>(`SELECT provider_submission_state
        FROM track_asset_jobs WHERE id=$1 AND owner_subject=$2`, [id, ownerSubject]);
      if (!current.rows[0]) throw new ResourceNotFoundError('track asset job not found');
      return current.rows[0].provider_submission_state;
    });
  }

  async markTrackAssetProviderSubmissionUncertain(
    ownerSubject: string,
    id: string,
    error: string,
  ): Promise<ProviderSubmissionState> {
    const message = error.slice(0, 1000);
    return this.database.transaction(async (client) => {
      const updated = await client.query<{ provider_submission_state: ProviderSubmissionState }>(`UPDATE track_asset_jobs SET
        provider_submission_state='uncertain',provider_submission_finished_at=NOW(),
        provider_submission_error=$3,status='failed',billing_status='manual_review_required',
        error=$3,finished_at=COALESCE(finished_at,NOW()),updated_at=NOW()
        WHERE id=$1 AND owner_subject=$2 AND provider_submission_state='started'
        RETURNING provider_submission_state`, [id, ownerSubject, message]);
      if (updated.rows[0]) {
        await client.query(`UPDATE billing_operation_mirrors SET
          status='manual_review_required',last_error=$3,updated_at=NOW()
          WHERE asset_job_id=$1 AND owner_subject=$2`, [id, ownerSubject, message]);
        return updated.rows[0].provider_submission_state;
      }
      const current = await client.query<{ provider_submission_state: ProviderSubmissionState }>(`SELECT provider_submission_state
        FROM track_asset_jobs WHERE id=$1 AND owner_subject=$2`, [id, ownerSubject]);
      if (!current.rows[0]) throw new ResourceNotFoundError('track asset job not found');
      return current.rows[0].provider_submission_state;
    });
  }

  async acceptTrackAssetJob(ownerSubject: string, id: string, upstreamTaskId: string): Promise<TrackAssetJob> {
    const result = await this.database.query<AssetJobRow>(`UPDATE track_asset_jobs SET
      upstream_task_id=COALESCE(upstream_task_id,$3),status='queued',progress=0,
      provider_submission_state='accepted',provider_submission_finished_at=COALESCE(provider_submission_finished_at,NOW()),
      provider_submission_error=NULL,updated_at=NOW()
      WHERE id=$1 AND owner_subject=$2
        AND provider_submission_state IN('started','accepted')
        AND (upstream_task_id IS NULL OR upstream_task_id=$3)
      RETURNING *,NULL::text AS asset_kind`, [id, ownerSubject, upstreamTaskId]);
    if (!result.rows[0]) throw new ResourceStateConflictError('track asset job provider task conflicts with its durable state');
    return assetJobFromRow(result.rows[0]);
  }

  async listPollableTrackAssetJobs(
    limit = 50,
    assetJobId: string | null = null,
    leaseMs = 15 * 60_000,
  ): Promise<PollableTrackAssetJob[]> {
    const boundedLimit = Math.min(100, Math.max(1, limit));
    const boundedLease = Math.min(60 * 60_000, Math.max(30_000, leaseMs));
    const pollLeaseToken = randomUUID();
    return this.database.transaction(async (client) => {
      const result = await client.query<QueryResultRow & {
        id: string; track_id: string; owner_subject: string; action: TrackAssetAction;
        upstream_task_id: string; attempts: number; terminal_wait_started_at: Date | null;
        poll_lease_token: string;
      }>(`WITH candidates AS (
          SELECT id FROM track_asset_jobs
          WHERE status IN('queued','running') AND upstream_task_id IS NOT NULL AND next_poll_at<=NOW()
            AND ($2::text IS NULL OR id=$2)
          ORDER BY next_poll_at
          FOR UPDATE SKIP LOCKED
          LIMIT $1
        ), leased AS (
          UPDATE track_asset_jobs j
          SET next_poll_at=NOW()+($3::text || ' milliseconds')::interval,
            poll_lease_token=$4::uuid,updated_at=NOW()
          FROM candidates c WHERE j.id=c.id
          RETURNING j.id,j.track_id,j.owner_subject,j.action,j.upstream_task_id,j.attempts,
            j.terminal_wait_started_at,j.poll_lease_token
        ) SELECT * FROM leased`, [boundedLimit, assetJobId, boundedLease, pollLeaseToken]);
      return result.rows.map((row) => ({
        id: row.id, trackId: row.track_id, ownerSubject: row.owner_subject,
        action: row.action, upstreamTaskId: row.upstream_task_id, attempts: row.attempts,
        terminalWaitStartedAt: row.terminal_wait_started_at,
        pollLeaseToken: row.poll_lease_token,
      }));
    });
  }

  async applyTrackAssetJobResult(
    job: PollableTrackAssetJob,
    result: NormalizedSunoTask,
    nextPollMs: number,
    terminalResultMissing = false,
  ): Promise<boolean> {
    const updated = await this.database.query<{ id: string }>(`UPDATE track_asset_jobs SET
      provider_record_id=COALESCE($2,provider_record_id),status=CASE WHEN $3='error' THEN 'failed' ELSE 'running' END,
      progress=$4,attempts=attempts+1,last_polled_at=NOW(),
      next_poll_at=NOW()+($5::text || ' milliseconds')::interval,error=$6,
      terminal_wait_started_at=CASE WHEN $8 THEN COALESCE(terminal_wait_started_at,NOW()) ELSE NULL END,
      updated_at=NOW(),
      finished_at=CASE WHEN $3='error' THEN NOW() ELSE finished_at END,
      billing_status=CASE WHEN $3='error' AND billing_status='reserved' THEN 'release_required' ELSE billing_status END
      WHERE id=$1 AND owner_subject=$7 AND poll_lease_token=$9::uuid
        AND status IN('queued','running') RETURNING id`, [
      job.id, result.providerRecordId, result.status, result.progress, nextPollMs,
      result.error?.slice(0, 1000) ?? null, job.ownerSubject, terminalResultMissing, job.pollLeaseToken,
    ]);
    return Boolean(updated.rows[0]);
  }

  async markTrackAssetJobPollFailure(
    job: PollableTrackAssetJob,
    error: string,
    nextPollMs: number,
    terminal: boolean,
    releaseSafe = false,
  ): Promise<boolean> {
    return this.database.transaction(async (client) => {
      const updated = await client.query<{ id: string }>(`UPDATE track_asset_jobs SET attempts=attempts+1,last_polled_at=NOW(),
        next_poll_at=NOW()+($2::text || ' milliseconds')::interval,error=$3,
        status=CASE WHEN $4 THEN 'failed' ELSE status END,
        billing_status=CASE
          WHEN $4 AND $5 AND billing_status='reserved' THEN 'release_required'
          WHEN $4 AND NOT $5 AND billing_status IN('reserved','reserve_pending','reconcile_required')
            THEN 'manual_review_required'
          ELSE billing_status END,
        finished_at=CASE WHEN $4 THEN NOW() ELSE finished_at END,updated_at=NOW()
        WHERE id=$1 AND poll_lease_token=$6::uuid AND status IN('queued','running') RETURNING id`, [
        job.id, nextPollMs, error.slice(0, 1000), terminal, releaseSafe, job.pollLeaseToken,
      ]);
      if (!updated.rows[0]) return false;
      if (terminal && !releaseSafe) {
        await client.query(`UPDATE billing_operation_mirrors SET status='manual_review_required',
          last_error=$3,updated_at=NOW() WHERE asset_job_id=$1 AND owner_subject=$2`, [
          job.id, job.ownerSubject, error.slice(0, 1000),
        ]);
      }
      return true;
    });
  }

  async completeTrackAssetJob(input: {
    id: string;
    ownerSubject: string;
    result: Record<string, unknown>;
    asset: TrackAsset;
    pollLeaseToken: string;
  }): Promise<boolean> {
    return this.database.transaction(async (client) => {
      const owned = await client.query<{ track_id: string }>(`SELECT track_id FROM track_asset_jobs
        WHERE id=$1 AND owner_subject=$2 AND poll_lease_token=$3::uuid
          AND status IN('queued','running') FOR UPDATE`, [input.id, input.ownerSubject, input.pollLeaseToken]);
      const trackId = owned.rows[0]?.track_id;
      if (!trackId) return false;
      if (input.asset.trackId !== trackId || input.asset.ownerSubject !== input.ownerSubject) {
        throw new ResourceStateConflictError('track asset materialization does not match its fenced job');
      }
      const assetId = await upsertTrackAssetRecord(client, input.asset);
      const updated = await client.query<{ track_id: string }>(`UPDATE track_asset_jobs SET
        status='succeeded',progress=1,result_json=$3::jsonb,asset_id=$4,
        billing_status=CASE WHEN billing_status='reserved' THEN 'capture_required' ELSE billing_status END,
        error=NULL,finished_at=NOW(),updated_at=NOW() WHERE id=$1 AND owner_subject=$2
          AND poll_lease_token=$5::uuid AND status IN('queued','running')
        RETURNING track_id`, [
        input.id, input.ownerSubject, JSON.stringify(input.result), assetId, input.pollLeaseToken,
      ]);
      if (!updated.rows[0]) throw new ResourceStateConflictError('track asset lease changed while locked');
      await client.query(`INSERT INTO outbox_events(id,aggregate_type,aggregate_id,event_type,payload_json)
        VALUES($1,'track_asset_job',$2,'track.asset.completed',$3::jsonb)`, [
        randomUUID(), input.id, JSON.stringify({
          ownerSubject: input.ownerSubject, jobId: input.id, trackId,
        }),
      ]);
      return true;
    });
  }

  async failTrackAssetJob(
    ownerSubject: string,
    id: string,
    error: string,
    billingStatus = 'release_required',
  ): Promise<void> {
    await this.database.transaction(async (client) => {
      const updated = await client.query<{ track_id: string }>(`UPDATE track_asset_jobs SET
        status='failed',billing_status=$3,error=$4,finished_at=NOW(),updated_at=NOW()
        WHERE id=$1 AND owner_subject=$2 RETURNING track_id`, [id, ownerSubject, billingStatus, error.slice(0, 1000)]);
      const trackId = updated.rows[0]?.track_id;
      if (!trackId) throw new ResourceNotFoundError('track asset job not found');
      await client.query(`INSERT INTO outbox_events(id,aggregate_type,aggregate_id,event_type,payload_json)
        VALUES($1,'track_asset_job',$2,'track.asset.failed',$3::jsonb)`, [
        randomUUID(), id, JSON.stringify({ ownerSubject, jobId: id, trackId, error: 'asset job failed' }),
      ]);
    });
  }

  async trackAssetJobCredential(id: string): Promise<{
    ownerSubject: string;
    ciphertext: string | null;
    operationId: string | null;
    reservationId: string | null;
    operationCode: string;
    idempotencyKey: string;
    jobStatus: string;
  } | null> {
    const result = await this.database.query<QueryResultRow & {
      owner_subject: string; billing_credential_ciphertext: string | null;
      billing_operation_id: string | null; billing_reservation_id: string | null;
      operation_code: string; idempotency_key: string; status: string;
    }>(`SELECT owner_subject,billing_credential_ciphertext,billing_operation_id,
      billing_reservation_id,operation_code,idempotency_key,status FROM track_asset_jobs WHERE id=$1`, [id]);
    const row = result.rows[0];
    return row ? {
      ownerSubject: row.owner_subject,
      ciphertext: row.billing_credential_ciphertext,
      operationId: row.billing_operation_id,
      reservationId: row.billing_reservation_id,
      operationCode: row.operation_code,
      idempotencyKey: row.idempotency_key,
      jobStatus: row.status,
    } : null;
  }

  async settleTrackAssetJobBilling(
    id: string,
    ownerSubject: string,
    billingStatus: string,
    actualCredits: number,
    error?: string,
  ): Promise<void> {
    await this.database.transaction(async (client) => {
      await client.query(`UPDATE track_asset_jobs SET billing_status=$3,actual_credits=$4,
        error=COALESCE($5,error),updated_at=NOW() WHERE id=$1 AND owner_subject=$2`, [
        id, ownerSubject, billingStatus, actualCredits, error?.slice(0, 1000) ?? null,
      ]);
      await client.query(`UPDATE billing_operation_mirrors SET status=$3,settled_credits=$4,
        last_error=$5,updated_at=NOW() WHERE asset_job_id=$1 AND owner_subject=$2`, [
        id, ownerSubject, billingStatus, actualCredits, error?.slice(0, 1000) ?? null,
      ]);
    });
  }

  async listTrackAssetBillingReconcileJobs(limit = 100): Promise<Array<{
    id: string;
    ownerSubject: string;
    jobStatus: string;
    billingStatus: string;
    providerSubmissionState: ProviderSubmissionState;
    upstreamTaskId: string | null;
    createdAt: Date;
  }>> {
    const result = await this.database.query<QueryResultRow & {
      id: string; owner_subject: string; status: string; billing_status: string;
      provider_submission_state: ProviderSubmissionState; upstream_task_id: string | null; created_at: Date;
    }>(`SELECT id,owner_subject,status,billing_status,provider_submission_state,upstream_task_id,created_at
      FROM track_asset_jobs
      WHERE billing_status IN('reserve_pending','reserved','capture_required','release_required','reconcile_required')
        AND (status IN('succeeded','failed')
          OR (status='submitting' AND updated_at<NOW()-INTERVAL '10 minutes'))
      ORDER BY updated_at LIMIT $1`, [Math.min(500, Math.max(1, limit))]);
    return result.rows.map((row) => ({
      id: row.id, ownerSubject: row.owner_subject, jobStatus: row.status,
      billingStatus: row.billing_status, providerSubmissionState: row.provider_submission_state,
      upstreamTaskId: row.upstream_task_id, createdAt: row.created_at,
    }));
  }

  async markTrackMaterialized(
    task: PollableProviderTask,
    result: NormalizedSunoTask,
    assets: TrackAsset[],
  ): Promise<boolean> {
    return this.database.transaction(async (client) => {
      const updated = await client.query<{ id: string }>(`UPDATE provider_tasks SET status='done',stage='done',progress=1,
        custom_id=COALESCE($2,custom_id),provider_record_id=COALESCE($3,provider_record_id),updated_at=NOW()
        WHERE id=$1 AND poll_lease_token=$4::uuid AND status IN('queued','running') RETURNING id`, [
        task.id, result.customId, result.providerRecordId, task.pollLeaseToken,
      ]);
      if (!updated.rows[0]) return false;
      if (!assets.some((asset) => asset.kind === 'audio')) {
        throw new ResourceStateConflictError('provider task materialization requires an audio asset');
      }
      for (const asset of assets) {
        if (asset.trackId !== task.trackId || asset.ownerSubject !== task.ownerSubject) {
          throw new ResourceStateConflictError('provider task materialization contains a mismatched asset');
        }
        await upsertTrackAssetRecord(client, asset);
      }
      await client.query(`UPDATE tracks SET status='done',stage='done',progress=1,error=NULL,
        custom_id=COALESCE($2,custom_id),duration=COALESCE($3,duration),
        provider_record_id=COALESCE($5,provider_record_id),finished_at=NOW(),updated_at=NOW()
        WHERE id=$1 AND owner_subject=$4`, [task.trackId, result.customId, result.duration, task.ownerSubject, result.providerRecordId]);
      return true;
    });
  }

  async generationOutcome(generationId: string): Promise<{ ownerSubject: string; total: number; done: number; error: number; billingStatus: string; reservationId: string | null } | null> {
    const result = await this.database.query<QueryResultRow & {
      owner_subject: string; total: string; done: string; error: string; billing_status: string; billing_reservation_id: string | null;
    }>(`SELECT g.owner_subject,g.billing_status,g.billing_reservation_id,COUNT(t.id)::text AS total,
      COUNT(t.id) FILTER(WHERE t.status='done')::text AS done,
      COUNT(t.id) FILTER(WHERE t.status='error')::text AS error
      FROM generation_batches g LEFT JOIN tracks t ON t.generation_id=g.id WHERE g.id=$1
      GROUP BY g.id`, [generationId]);
    const row = result.rows[0];
    return row ? {
      ownerSubject: row.owner_subject, total: Number(row.total), done: Number(row.done), error: Number(row.error),
      billingStatus: row.billing_status, reservationId: row.billing_reservation_id,
    } : null;
  }

  async listBillingReconcileGenerations(limit = 100): Promise<Array<{
    id: string; ownerSubject: string; status: string; total: number; done: number; error: number;
    providerSubmissionState: ProviderSubmissionState;
  }>> {
    const result = await this.database.query<QueryResultRow & {
      id: string; owner_subject: string; status: string; total: string; done: string; error: string;
      provider_submission_state: ProviderSubmissionState;
    }>(`SELECT g.id,g.owner_subject,g.status,g.provider_submission_state,COUNT(t.id)::text AS total,
      COUNT(t.id) FILTER(WHERE t.status='done')::text AS done,
      COUNT(t.id) FILTER(WHERE t.status='error')::text AS error
      FROM generation_batches g LEFT JOIN tracks t ON t.generation_id=g.id
      WHERE g.billing_status IN('reserve_pending','reserved','capture_required','release_required','reconcile_required')
      GROUP BY g.id
      HAVING (COUNT(t.id)=0 AND (g.status='failed'
          OR (g.status='submitting' AND MIN(g.updated_at)<NOW()-INTERVAL '10 minutes')))
        OR (COUNT(t.id)>0 AND COUNT(t.id)=COUNT(t.id) FILTER(WHERE t.status IN('done','error')))
      ORDER BY MIN(g.updated_at) LIMIT $1`, [Math.min(500, Math.max(1, limit))]);
    return result.rows.map((row) => ({
      id: row.id, ownerSubject: row.owner_subject, status: row.status,
      total: Number(row.total), done: Number(row.done), error: Number(row.error),
      providerSubmissionState: row.provider_submission_state,
    }));
  }

  async markBillingReconcileError(
    generationId: string,
    error: string,
    billingStatus: 'reconcile_required' | 'manual_review_required' = 'reconcile_required',
  ): Promise<void> {
    await this.database.transaction(async (client) => {
      await client.query(`UPDATE generation_batches SET billing_status=$3,
        status=CASE WHEN NOT EXISTS(SELECT 1 FROM tracks WHERE generation_id=$1) THEN 'failed' ELSE status END,
        finished_at=CASE WHEN NOT EXISTS(SELECT 1 FROM tracks WHERE generation_id=$1) THEN COALESCE(finished_at,NOW()) ELSE finished_at END,
        error=$2,updated_at=NOW()
        WHERE id=$1`, [generationId, error.slice(0, 1000), billingStatus]);
      await client.query(`UPDATE billing_operation_mirrors SET status=$3,last_error=$2,updated_at=NOW()
        WHERE generation_id=$1`, [generationId, error.slice(0, 1000), billingStatus]);
    });
  }

  async finalizeGeneration(generationId: string, status: 'succeeded' | 'partial' | 'failed', billingStatus: string, settledCredits = 0): Promise<void> {
    await this.database.transaction(async (client) => {
      const generation = await client.query<{ owner_subject: string }>(`UPDATE generation_batches
        SET status=$2,billing_status=$3,finished_at=NOW(),updated_at=NOW()
        WHERE id=$1 RETURNING owner_subject`, [generationId, status, billingStatus]);
      const ownerSubject = generation.rows[0]?.owner_subject;
      if (!ownerSubject) throw new ResourceNotFoundError('generation not found');
      await client.query(`UPDATE billing_operation_mirrors SET status=$2,settled_credits=$3,updated_at=NOW()
        WHERE generation_id=$1`, [generationId, billingStatus, settledCredits]);
      await client.query(`INSERT INTO outbox_events(id,aggregate_type,aggregate_id,event_type,payload_json)
        VALUES($1,'generation',$2,$3,$4::jsonb)`, [randomUUID(), generationId, `generation.${status}`,
        JSON.stringify({ generationId, ownerSubject, status, billingStatus })]);
    });
  }

  async listTasks(
    ownerSubject: string,
    limit = 100,
    options: { upstreamTaskIds?: readonly string[]; offset?: number } = {},
  ): Promise<Array<Record<string, unknown>>> {
    const boundedLimit = Math.min(200, Math.max(1, limit));
    const offset = Math.max(0, Math.floor(options.offset ?? 0));
    // The public route caps page and size at 200. Each task family must
    // contribute through offset + size before the global sort can be paged.
    const fetchLimit = Math.min(40_000, offset + boundedLimit);
    const requestedIds = [...new Set((options.upstreamTaskIds ?? []).map((id) => id.trim()).filter(Boolean))];
    // Apply the Provider-id filter before LIMIT/OFFSET. Filtering only after a
    // broad recent-task LIMIT can incorrectly return an empty page when a
    // perfectly valid requested task is older than that window.
    const generationValues: readonly unknown[] = requestedIds.length
      ? [ownerSubject, requestedIds, fetchLimit]
      : [ownerSubject, fetchLimit];
    const generationLimitPlaceholder = requestedIds.length ? '$3' : '$2';
    const result = await this.database.query<QueryResultRow & Record<string, unknown>>(`WITH generation_task_rows AS (
      SELECT
        pt.id,pt.generation_id,pt.track_id,pt.upstream_task_id,pt.status,pt.stage,pt.progress,
        pt.attempts,pt.last_error,pt.created_at,pt.updated_at,t.take_index,t.title,t.operation,t.model,pt.provider_record_id,
        COUNT(*) OVER (PARTITION BY pt.generation_id) AS generation_task_count,
        ROW_NUMBER() OVER (PARTITION BY pt.generation_id ORDER BY t.take_index,pt.id) AS generation_task_position,
        COUNT(*) FILTER (WHERE pt.status='done') OVER (PARTITION BY pt.generation_id) AS successful_task_count,
        COUNT(*) FILTER (WHERE pt.status='done') OVER (
          PARTITION BY pt.generation_id ORDER BY t.take_index,pt.id
          ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
        ) AS successful_task_position
      FROM provider_tasks pt JOIN tracks t ON t.id=pt.track_id
      WHERE pt.owner_subject=$1
    )
    SELECT
      tr.id,tr.generation_id,tr.track_id,tr.upstream_task_id,tr.status,tr.stage,tr.progress,
      tr.attempts,tr.last_error,tr.created_at,tr.updated_at,tr.title,tr.operation,tr.model,tr.provider_record_id,
      tr.generation_task_count,tr.generation_task_position,tr.successful_task_count,tr.successful_task_position,
      g.submission_options_json,
      g.billing_status,g.estimated_credits,
      (SELECT b.settled_credits FROM billing_operation_mirrors b
        WHERE b.generation_id=g.id ORDER BY b.updated_at DESC,b.id DESC LIMIT 1) AS settled_credits
      FROM generation_task_rows tr JOIN generation_batches g ON g.id=tr.generation_id
      WHERE TRUE${requestedIds.length ? ' AND tr.upstream_task_id = ANY($2::text[])' : ''}
      ORDER BY tr.created_at DESC LIMIT ${generationLimitPlaceholder}`, generationValues);
    const generationTasks = result.rows.map((row) => {
      const taskCount = Math.max(1, Number(row.generation_task_count ?? 1));
      const taskPosition = Math.max(1, Number(row.generation_task_position ?? 1));
      const estimatedTotal = Math.max(0, Number(row.estimated_credits ?? 0));
      const estimatedBase = Math.floor(estimatedTotal / taskCount);
      const estimatedRemainder = estimatedTotal - estimatedBase * taskCount;
      const estimatedCredits = estimatedBase + (taskPosition <= estimatedRemainder ? 1 : 0);
      let settledCredits: number | null = null;
      if (row.settled_credits !== null && row.settled_credits !== undefined) {
        const settledTotal = Math.max(0, Number(row.settled_credits));
        if (row.status === 'done') {
          const successfulTaskCount = Math.max(1, Number(row.successful_task_count ?? 1));
          const successfulTaskPosition = Math.max(1, Number(row.successful_task_position ?? 1));
          const settledBase = Math.floor(settledTotal / successfulTaskCount);
          const settledRemainder = settledTotal - settledBase * successfulTaskCount;
          settledCredits = settledBase + (successfulTaskPosition <= settledRemainder ? 1 : 0);
        } else {
          settledCredits = 0;
        }
      }
      return {
      id: row.id, generationId: row.generation_id, trackId: row.track_id,
      upstreamTaskId: row.upstream_task_id, status: row.status, stage: row.stage,
      providerRecordId: row.provider_record_id === null || row.provider_record_id === undefined
        ? null : Number(row.provider_record_id),
      submissionOptions: row.submission_options_json ?? {},
      progress: Number(row.progress), attempts: row.attempts, error: row.last_error,
      title: row.title, operation: row.operation, model: row.model, billingStatus: row.billing_status,
      estimatedCredits,
      settledCredits,
      createdAt: toIso(row.created_at as Date), updatedAt: toIso(row.updated_at as Date),
      taskType: 'generation',
      };
    });
    const assetIdClause = requestedIds.length ? ' AND j.upstream_task_id = ANY($2::text[])' : '';
    const secondaryValues: readonly unknown[] = requestedIds.length
      ? [ownerSubject, requestedIds, fetchLimit]
      : [ownerSubject, fetchLimit];
    const secondaryLimitPlaceholder = requestedIds.length ? '$3' : '$2';
    const assetResult = await this.database.query<QueryResultRow & Record<string, unknown>>(`SELECT
      j.id,j.track_id,j.upstream_task_id,j.provider_record_id,j.request_json,j.status,
      CASE WHEN j.status='succeeded' THEN 'done' WHEN j.status='failed' THEN 'error'
        WHEN j.status='queued' THEN 'queued' ELSE 'generating' END AS stage,
      j.progress,j.attempts,j.error,j.created_at,j.updated_at,t.generation_id,t.title,t.model,
      j.action AS operation,j.billing_status,j.estimated_credits,j.actual_credits
      FROM track_asset_jobs j JOIN tracks t ON t.id=j.track_id
      WHERE j.owner_subject=$1${assetIdClause} ORDER BY j.created_at DESC
      LIMIT ${secondaryLimitPlaceholder}`, secondaryValues);
    const assetTasks = assetResult.rows.map((row) => ({
      id: row.id, generationId: row.generation_id, trackId: row.track_id,
      upstreamTaskId: row.upstream_task_id ?? null,
      providerRecordId: row.provider_record_id === null || row.provider_record_id === undefined
        ? null : Number(row.provider_record_id),
      submissionOptions: row.request_json ?? {},
      status: row.status, stage: row.stage, progress: Number(row.progress), attempts: row.attempts,
      error: row.error, title: row.title, operation: row.operation, model: row.model,
      billingStatus: row.billing_status, estimatedCredits: Number(row.estimated_credits ?? 0),
      settledCredits: row.actual_credits === null || row.actual_credits === undefined ? null : Number(row.actual_credits),
      createdAt: toIso(row.created_at as Date), updatedAt: toIso(row.updated_at as Date),
      taskType: 'track_asset',
    }));
    const uploadIdClause = requestedIds.length ? ' AND s.upstream_task_id = ANY($2::text[])' : '';
    const uploadResult = await this.database.query<QueryResultRow & Record<string, unknown>>(`SELECT
      s.id,s.generation_id,s.upstream_task_id,s.provider_record_id,s.status,s.stage,s.progress,s.attempts,
      s.last_error,s.created_at,s.updated_at,g.request_json->>'title' AS title,g.operation,
      g.model_profile_id AS model,g.billing_status,g.estimated_credits,g.submission_options_json,
      (SELECT b.settled_credits FROM billing_operation_mirrors b
        WHERE b.generation_id=g.id ORDER BY b.updated_at DESC,b.id DESC LIMIT 1) AS settled_credits
      FROM upload_extend_stages s JOIN generation_batches g ON g.id=s.generation_id
      WHERE s.owner_subject=$1${uploadIdClause} ORDER BY s.created_at DESC
      LIMIT ${secondaryLimitPlaceholder}`, secondaryValues);
    const uploadTasks = uploadResult.rows.map((row) => ({
      id: row.id, generationId: row.generation_id, trackId: null,
      upstreamTaskId: row.upstream_task_id ?? null,
      providerRecordId: row.provider_record_id === null || row.provider_record_id === undefined
        ? null : Number(row.provider_record_id),
      submissionOptions: row.submission_options_json ?? {},
      status: row.status, stage: row.stage, progress: Number(row.progress), attempts: row.attempts,
      error: row.last_error, title: row.title, operation: row.operation, model: row.model,
      billingStatus: row.billing_status, estimatedCredits: Number(row.estimated_credits ?? 0),
      settledCredits: row.settled_credits === null || row.settled_credits === undefined ? null : Number(row.settled_credits),
      createdAt: toIso(row.created_at as Date), updatedAt: toIso(row.updated_at as Date),
      taskType: 'reference_upload_stage',
    }));
    let merged = [...generationTasks, ...assetTasks, ...uploadTasks]
      .sort((left, right) => String(right.createdAt).localeCompare(String(left.createdAt))
        || String(left.taskType).localeCompare(String(right.taskType))
        || String(left.id).localeCompare(String(right.id)));
    const ids = new Set(requestedIds);
    if (ids.size) merged = merged.filter((task) => typeof task.upstreamTaskId === 'string' && ids.has(task.upstreamTaskId));
    return merged.slice(offset, offset + boundedLimit);
  }

  async billingStats(ownerSubject: string): Promise<{ monthSpent: number; monthGeneratedTracks: number; pendingReservations: number }> {
    const result = await this.database.query<QueryResultRow & {
      month_spent: string; month_tracks: string; pending_reservations: string;
    }>(`SELECT
      COALESCE((SELECT SUM(settled_credits) FROM billing_operation_mirrors
        WHERE owner_subject=$1 AND created_at>=DATE_TRUNC('month',NOW())
          AND status IN('captured','partially_captured','settled')),0)::text AS month_spent,
      COALESCE((SELECT COUNT(*) FROM tracks
        WHERE owner_subject=$1 AND created_at>=DATE_TRUNC('month',NOW()) AND status='done'),0)::text AS month_tracks,
      COALESCE((SELECT COUNT(*) FROM billing_operation_mirrors
        WHERE owner_subject=$1 AND status IN('reserved','capture_required','release_required','reconcile_required','manual_review_required')),0)::text AS pending_reservations`, [ownerSubject]);
    return {
      monthSpent: Number(result.rows[0]?.month_spent ?? 0),
      monthGeneratedTracks: Number(result.rows[0]?.month_tracks ?? 0),
      pendingReservations: Number(result.rows[0]?.pending_reservations ?? 0),
    };
  }

  async listPaymentOrders(ownerSubject: string, limit = 100): Promise<Array<Record<string, unknown>>> {
    const boundedLimit = Math.min(200, Math.max(1, limit));
    const result = await this.database.query<QueryResultRow & {
      id: string; provider: string; amount_minor: string; currency: string; status: string; created_at: Date;
    }>(`SELECT * FROM payment_order_mirrors WHERE owner_subject=$1 ORDER BY created_at DESC LIMIT $2`, [
      ownerSubject, boundedLimit,
    ]);
    const payments = result.rows.map((row) => {
      const amountMinor = Number(row.amount_minor);
      return {
        id: row.id,
        kind: 'topup',
        description: `${row.provider} 充值`,
        amount: amountMinor,
        amountMinor,
        credits: null,
        status: row.status,
        createdAt: row.created_at.toISOString(),
        currency: row.currency,
      };
    });
    const usageResult = await this.database.query<QueryResultRow & {
      id: string; operation_code: string; reserved_credits: string; settled_credits: string;
      status: string; created_at: Date;
    }>(`SELECT id,operation_code,reserved_credits::text,settled_credits::text,status,created_at
        FROM billing_operation_mirrors WHERE owner_subject=$1
        ORDER BY created_at DESC LIMIT $2`, [ownerSubject, boundedLimit]);
    const operationName = (code: string): string => ({
      generation_pair: '双版本音乐生成', extend_pair: '音乐续写', cover_pair: '翻唱生成', remaster_pair: '高清重制',
      upload_single: '参考音频导入', upload_copyright_single: '版权参考音频导入',
      upload_extend_pair: '参考音频续作', upload_copyright_extend_pair: '版权参考音频续作',
      whole_song_single: '整曲合并', crop_single: '音频裁剪', speed_single: '速度调整',
      aligned_lyrics_single: '逐字歌词对齐', video_single: '音乐视频生成', convert_wav_single: 'WAV 转换',
      lyrics_generate: 'AI 歌词生成', lyrics_rewrite: 'AI 歌词处理', prompt_optimize: 'AI 创作优化',
    } as Record<string, string>)[code] ?? code;
    const usage = usageResult.rows.map((row) => {
      const captured = ['captured', 'partially_captured', 'settled'].includes(row.status);
      const partiallyCaptured = row.status === 'partially_captured';
      const released = ['released', 'refunded', 'disabled'].includes(row.status);
      const settled = Number(row.settled_credits ?? 0);
      return {
        id: row.id,
        kind: row.status === 'refunded' ? 'refund' : 'usage',
        description: row.status === 'disabled'
          ? `${operationName(row.operation_code)}（安全预览）`
          : partiallyCaptured ? `${operationName(row.operation_code)}（部分成功）`
            : released ? `${operationName(row.operation_code)}（预留已释放）` : operationName(row.operation_code),
        amount: 0,
        credits: captured ? -settled : row.status === 'refunded' ? settled : 0,
        status: captured ? 'paid' : released ? 'refunded' : row.status === 'failed' ? 'failed' : 'pending',
        createdAt: row.created_at.toISOString(),
        currency: 'credits',
      };
    });
    return [...payments, ...usage]
      .sort((left, right) => String(right.createdAt).localeCompare(String(left.createdAt)))
      .slice(0, boundedLimit);
  }

  async healthCounts(): Promise<{ active: number; queued: number }> {
    const result = await this.database.query<{ active: string; queued: string }>(`SELECT
      COUNT(*) FILTER(WHERE status='running')::text AS active,
      COUNT(*) FILTER(WHERE status='queued')::text AS queued
      FROM provider_tasks WHERE status IN('queued','running')`);
    return { active: Number(result.rows[0]?.active ?? 0), queued: Number(result.rows[0]?.queued ?? 0) };
  }

  async replayAiRun(
    ownerSubject: string,
    idempotencyKey: string,
    requestDigest: string,
  ): Promise<AiAssistResult | null> {
    const result = await this.database.query<{
      request_digest: string;
      status: string | null;
      billing_status: string | null;
      actual_credits: string | number | null;
      result_json: AiAssistResult | null;
    }>(`SELECT i.request_digest,a.status,a.billing_status,a.actual_credits,a.result_json
      FROM idempotency_keys i
      LEFT JOIN ai_assistant_runs a ON a.id=i.resource_id AND a.owner_subject=i.owner_subject
      WHERE i.owner_subject=$1 AND i.scope='ai.assist' AND i.idempotency_key=$2`, [
      ownerSubject, idempotencyKey,
    ]);
    const existing = result.rows[0];
    if (!existing) return null;
    if (existing.request_digest !== requestDigest) {
      throw new IdempotencyConflictError('idempotency key was already used for a different AI request');
    }
    if (existing.status === 'succeeded' && existing.result_json) {
      return authoritativeAiResult(existing.result_json, existing.billing_status, existing.actual_credits);
    }
    throw new IdempotencyConflictError(`AI request is already ${existing.status ?? 'registered'}`);
  }

  async createAiRun(input: {
    id: string; ownerSubject: string; projectId: string | null; capabilityKey: string; modelAlias: string;
    promptVersion: string; original: string; estimatedCredits: number;
    idempotencyKey: string; requestDigest: string; maxConcurrent?: number;
  }): Promise<AiAssistResult | null> {
    return this.database.transaction(async (client) => {
      await client.query('SELECT pg_advisory_xact_lock(hashtext($1),hashtext($2))', [
        input.ownerSubject, `ai.assist:${input.idempotencyKey}`,
      ]);
      const existing = await client.query<{ request_digest: string; resource_id: string | null }>(
        `SELECT request_digest,resource_id FROM idempotency_keys
         WHERE owner_subject=$1 AND scope='ai.assist' AND idempotency_key=$2`,
        [input.ownerSubject, input.idempotencyKey],
      );
      if (existing.rows[0]) {
        if (existing.rows[0].request_digest !== input.requestDigest) {
          throw new IdempotencyConflictError('idempotency key was already used for a different AI request');
        }
        const replay = await client.query<{
          status: string;
          billing_status: string;
          actual_credits: string | number | null;
          result_json: AiAssistResult | null;
        }>(
          'SELECT status,billing_status,actual_credits,result_json FROM ai_assistant_runs WHERE id=$1 AND owner_subject=$2',
          [existing.rows[0].resource_id, input.ownerSubject],
        );
        if (replay.rows[0]?.status === 'succeeded' && replay.rows[0].result_json) {
          return authoritativeAiResult(
            replay.rows[0].result_json,
            replay.rows[0].billing_status,
            replay.rows[0].actual_credits,
          );
        }
        throw new IdempotencyConflictError(`AI request is already ${replay.rows[0]?.status ?? 'registered'}`);
      }
      if (input.projectId) {
        const project = await client.query<{ id: string }>(`SELECT id FROM music_projects
          WHERE id=$1 AND owner_subject=$2 AND archived_at IS NULL`, [input.projectId, input.ownerSubject]);
        if (!project.rows[0]) throw new ResourceNotFoundError('project not found');
      }
      await client.query('SELECT pg_advisory_xact_lock(hashtext($1),hashtext($2))', [
        input.ownerSubject, 'ai.concurrent',
      ]);
      const active = await client.query<{ count: string }>(`SELECT COUNT(*)::text AS count
        FROM ai_assistant_runs WHERE owner_subject=$1 AND status='running'`, [input.ownerSubject]);
      if (Number(active.rows[0]?.count ?? 0) >= (input.maxConcurrent ?? 4)) {
        throw new ConcurrencyLimitError('concurrent AI run limit exceeded');
      }
      await client.query(`INSERT INTO ai_assistant_runs(
        id,owner_subject,project_id,capability_key,model_alias,prompt_version,input_digest,
        original_text,estimated_credits,status,idempotency_key,request_digest
      ) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,'running',$10,$11)`, [
        input.id, input.ownerSubject, input.projectId, input.capabilityKey, input.modelAlias,
        input.promptVersion, createHash('sha256').update(input.original).digest('hex'),
        input.original, input.estimatedCredits, input.idempotencyKey, input.requestDigest,
      ]);
      await client.query(`INSERT INTO idempotency_keys(
        owner_subject,scope,idempotency_key,request_digest,resource_id,expires_at
      ) VALUES($1,'ai.assist',$2,$3,$4,NOW()+INTERVAL '24 hours')`, [
        input.ownerSubject, input.idempotencyKey, input.requestDigest, input.id,
      ]);
      return null;
    });
  }

  async setAiRunCredential(id: string, ownerSubject: string, ciphertext: string): Promise<void> {
    const result = await this.database.query(`UPDATE ai_assistant_runs
      SET billing_credential_ciphertext=$3,billing_status='reserve_pending'
      WHERE id=$1 AND owner_subject=$2`, [id, ownerSubject, ciphertext]);
    if ((result.rowCount ?? 0) !== 1) throw new ResourceNotFoundError('AI run not found');
  }

  async setAiRunReservation(input: {
    id: string; ownerSubject: string; operationCode: string; idempotencyKey: string;
    operationId: string; reservationId: string; priceVersion: string; reservedCredits: number;
    status: BillingReservation['status'] | 'manual_review_required';
  }): Promise<void> {
    await this.database.transaction(async (client) => {
      const updated = await client.query(`UPDATE ai_assistant_runs SET estimated_credits=$3,billing_status=$4
        WHERE id=$1 AND owner_subject=$2`, [input.id, input.ownerSubject, input.reservedCredits, input.status]);
      if ((updated.rowCount ?? 0) !== 1) throw new ResourceNotFoundError('AI run not found');
      const mirror = await client.query<{ id: string }>(`INSERT INTO billing_operation_mirrors(
        id,owner_subject,ai_run_id,remote_operation_id,remote_reservation_id,operation_code,
        idempotency_key,price_version,reserved_credits,status
      ) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
      ON CONFLICT(owner_subject,idempotency_key) DO UPDATE SET
        remote_operation_id=EXCLUDED.remote_operation_id,
        remote_reservation_id=EXCLUDED.remote_reservation_id,
        operation_code=EXCLUDED.operation_code,
        price_version=EXCLUDED.price_version,
        reserved_credits=EXCLUDED.reserved_credits,
        status=EXCLUDED.status,updated_at=NOW()
      WHERE billing_operation_mirrors.ai_run_id=EXCLUDED.ai_run_id
        AND billing_operation_mirrors.generation_id IS NULL
      RETURNING billing_operation_mirrors.id`, [
        randomUUID(), input.ownerSubject, input.id, input.operationId, input.reservationId,
        input.operationCode, `ai:${input.idempotencyKey}`, input.priceVersion, input.reservedCredits, input.status,
      ]);
      if ((mirror.rowCount ?? 0) !== 1) {
        throw new IdempotencyConflictError('billing mirror key is already bound to another resource');
      }
    });
  }

  async settleAiRunBilling(id: string, ownerSubject: string, status: string, settledCredits: number, error?: string): Promise<void> {
    if (!Number.isSafeInteger(settledCredits) || settledCredits < 0) {
      throw new Error('AI settled credits must be a non-negative safe integer');
    }
    const authoritativeCredits = status === 'captured' ? settledCredits : 0;
    await this.database.transaction(async (client) => {
      const updated = await client.query<{ result_json: AiAssistResult | null }>(`UPDATE ai_assistant_runs SET billing_status=$3,
        status=CASE WHEN status='running' AND $3 IN('released','refunded','disabled','not_reserved') THEN 'failed' ELSE status END,
        error=CASE WHEN status='running' AND $3 IN('released','refunded','disabled','not_reserved') THEN COALESCE($4,error) ELSE error END,
        finished_at=CASE WHEN status='running' AND $3 IN('released','refunded','disabled','not_reserved') THEN COALESCE(finished_at,NOW()) ELSE finished_at END,
        actual_credits=CASE
          WHEN $3='captured' THEN $5
          WHEN $3 IN('released','refunded','disabled','not_reserved') THEN 0
          ELSE NULL
        END,
        result_json=CASE
          WHEN result_json IS NULL THEN NULL
          WHEN $3='captured' THEN
            (result_json || jsonb_build_object('actualCredits',$5::bigint))
            || jsonb_build_object('billing',
              COALESCE(result_json->'billing','{}'::jsonb)
              || jsonb_build_object('status',$3,'actualCredits',$5::bigint))
          WHEN $3 IN('released','refunded','disabled','not_reserved') THEN
            (result_json || jsonb_build_object('actualCredits',0))
            || jsonb_build_object('billing',
              COALESCE(result_json->'billing','{}'::jsonb)
              || jsonb_build_object('status',$3,'actualCredits',0))
          ELSE
            (result_json - 'actualCredits')
            || jsonb_build_object('billing',
              (COALESCE(result_json->'billing','{}'::jsonb) - 'actualCredits')
              || jsonb_build_object('status',$3))
        END
        WHERE id=$1 AND owner_subject=$2
        RETURNING result_json`, [id, ownerSubject, status, error ?? null, authoritativeCredits]);
      if ((updated.rowCount ?? 0) !== 1) throw new ResourceNotFoundError('AI run not found');
      await client.query(`UPDATE billing_operation_mirrors SET status=$3,settled_credits=$4,last_error=$5,updated_at=NOW()
        WHERE ai_run_id=$1 AND owner_subject=$2`, [id, ownerSubject, status, authoritativeCredits, error ?? null]);
      if (updated.rows[0]?.result_json) {
        await client.query(`UPDATE idempotency_keys SET response_json=$3::jsonb
          WHERE owner_subject=$1 AND scope='ai.assist' AND resource_id=$2`, [
          ownerSubject, id, JSON.stringify(updated.rows[0].result_json),
        ]);
      }
    });
  }

  async listAiBillingReconcileRuns(limit = 100): Promise<Array<{
    id: string; ownerSubject: string; runStatus: string; credentialCiphertext: string;
    operationId: string | null; reservationId: string | null; idempotencyKey: string;
  }>> {
    const result = await this.database.query<QueryResultRow & {
      id: string; owner_subject: string; status: string; billing_credential_ciphertext: string;
      remote_operation_id: string | null; remote_reservation_id: string | null; idempotency_key: string;
    }>(`SELECT a.id,a.owner_subject,a.status,a.billing_credential_ciphertext,
      b.remote_operation_id,b.remote_reservation_id,a.idempotency_key
      FROM ai_assistant_runs a LEFT JOIN billing_operation_mirrors b
        ON b.ai_run_id=a.id AND b.idempotency_key='ai:'||a.idempotency_key
      WHERE a.billing_status IN('reserve_pending','reserved','reconcile_required')
        AND a.billing_credential_ciphertext IS NOT NULL
        AND (a.status IN('succeeded','failed') OR (a.status='running' AND a.created_at<NOW()-INTERVAL '10 minutes'))
      ORDER BY a.created_at LIMIT $1`, [Math.min(500, Math.max(1, limit))]);
    return result.rows.map((row) => ({
      id: row.id, ownerSubject: row.owner_subject, runStatus: row.status,
      credentialCiphertext: row.billing_credential_ciphertext,
      operationId: row.remote_operation_id, reservationId: row.remote_reservation_id,
      idempotencyKey: row.idempotency_key,
    }));
  }

  async completeAiRun(id: string, ownerSubject: string, result: {
    completed: AiAssistResult; requestId: string | null;
  }): Promise<void> {
    await this.database.transaction(async (client) => {
      await client.query(`UPDATE ai_assistant_runs SET suggestion_text=$3,summary=$4,modelcross_request_id=$5,
        actual_credits=$6,result_json=$7::jsonb,status='succeeded',finished_at=NOW()
        WHERE id=$1 AND owner_subject=$2`, [
        id, ownerSubject, result.completed.suggestion, result.completed.summary, result.requestId,
        result.completed.actualCredits ?? null, JSON.stringify(result.completed),
      ]);
      await client.query(`UPDATE idempotency_keys SET response_status=201,response_json=$3::jsonb
        WHERE owner_subject=$1 AND scope='ai.assist' AND resource_id=$2`, [
        ownerSubject, id, JSON.stringify(result.completed),
      ]);
    });
  }

  async failAiRun(id: string, ownerSubject: string, error: string): Promise<void> {
    await this.database.query(`UPDATE ai_assistant_runs SET status='failed',error=$3,finished_at=NOW()
      WHERE id=$1 AND owner_subject=$2`, [id, ownerSubject, error]);
  }

  async acceptAiRevision(
    ownerSubject: string,
    runId: string,
    projectId: string | null,
    kind: string,
    title: string,
    appliedFields: string[],
  ): Promise<{ documentId: string; revisionId: string }> {
    return this.database.transaction(async (client) => {
      const run = await client.query<{ suggestion_text: string; summary: string; accepted_at: Date | null }>(
        `SELECT suggestion_text,summary,accepted_at FROM ai_assistant_runs
         WHERE id=$1 AND owner_subject=$2 AND status='succeeded' FOR UPDATE`,
        [runId, ownerSubject],
      );
      if (!run.rows[0]?.suggestion_text) throw new ResourceNotFoundError('AI result not found');
      const existing = await client.query<{
        document_id: string;
        id: string;
        applied_fields: unknown;
        project_id: string | null;
        kind: string;
        title: string;
      }>(
        `SELECT r.document_id,r.id,r.applied_fields,d.project_id,d.kind,d.title
         FROM prompt_revisions r
         JOIN prompt_documents d ON d.id=r.document_id AND d.owner_subject=r.owner_subject
         WHERE r.ai_run_id=$1 AND r.owner_subject=$2 AND r.accepted=TRUE
         ORDER BY r.created_at LIMIT 1`, [runId, ownerSubject],
      );
      if (existing.rows[0]) {
        const prior = existing.rows[0];
        const persistedFields = Array.isArray(prior.applied_fields)
          ? prior.applied_fields.filter((field): field is string => typeof field === 'string')
          : [];
        // A lost response may be retried safely, but a changed acceptance request must not be
        // acknowledged as if its different field selection or destination had been persisted.
        // Empty applied_fields is retained as a compatibility case for revisions created before
        // the field-level acceptance audit migration.
        if (prior.project_id !== projectId
          || prior.kind !== kind
          || prior.title !== title
          || (persistedFields.length > 0 && JSON.stringify(persistedFields) !== JSON.stringify(appliedFields))) {
          throw new IdempotencyConflictError('AI suggestion was already accepted with different fields or revision metadata');
        }
        return { documentId: existing.rows[0].document_id, revisionId: existing.rows[0].id };
      }
      if (projectId) {
        const project = await client.query<{ id: string }>(
          `SELECT id FROM music_projects WHERE id=$1 AND owner_subject=$2 AND status='active'`,
          [projectId, ownerSubject],
        );
        if (!project.rows[0]) throw new ResourceNotFoundError('project not found');
      }
      const documentId = randomUUID();
      const revisionId = randomUUID();
      await client.query(`INSERT INTO prompt_documents(id,owner_subject,project_id,kind,title,current_revision_id)
        VALUES($1,$2,$3,$4,$5,$6)`, [documentId, ownerSubject, projectId, kind, title, revisionId]);
      await client.query(`INSERT INTO prompt_revisions(
        id,document_id,owner_subject,source,content,summary,ai_run_id,accepted,applied_fields
      ) VALUES($1,$2,$3,'ai',$4,$5,$6,TRUE,$7::jsonb)`, [
        revisionId, documentId, ownerSubject, run.rows[0].suggestion_text, run.rows[0].summary, runId,
        JSON.stringify(appliedFields),
      ]);
      await client.query(`UPDATE ai_assistant_runs SET accepted_at=NOW(),accepted_fields=$2::jsonb
        WHERE id=$1 AND owner_subject=$3`, [runId, JSON.stringify(appliedFields), ownerSubject]);
      return { documentId, revisionId };
    });
  }

  async audit(input: {
    ownerSubject?: string | null; actorSubject?: string | null; action: string; resourceType: string;
    resourceId?: string | null; requestId?: string | null; ipHash?: string | null; userAgentHash?: string | null;
    metadata?: Record<string, unknown>;
  }): Promise<void> {
    await this.database.query(`INSERT INTO audit_events(
      id,owner_subject,actor_subject,action,resource_type,resource_id,request_id,ip_hash,user_agent_hash,metadata_json
    ) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb)`, [
      randomUUID(), input.ownerSubject ?? null, input.actorSubject ?? null, input.action,
      input.resourceType, input.resourceId ?? null, input.requestId ?? null, input.ipHash ?? null,
      input.userAgentHash ?? null, JSON.stringify(input.metadata ?? {}),
    ]);
  }

  /**
   * Atomically leases pending transactional-outbox rows. The lease makes
   * multiple workers safe while still allowing a crashed dispatcher to be
   * retried later. Publishing remains at-least-once by design, so consumers
   * receive the stable event id for optional de-duplication.
   */
  async claimOutboxEvents(limit = 100, leaseSeconds = 300): Promise<OutboxEvent[]> {
    const boundedLimit = Math.min(500, Math.max(1, limit));
    const boundedLease = Math.min(3600, Math.max(30, leaseSeconds));
    return this.database.transaction(async (client) => {
      const result = await client.query<QueryResultRow & {
        id: string; aggregate_type: string; aggregate_id: string; event_type: string;
        payload_json: Record<string, unknown>; attempts: number; owner_subject: string | null;
      }>(`WITH claimed AS (
          SELECT id FROM outbox_events
          WHERE processed_at IS NULL AND available_at<=NOW()
          ORDER BY created_at
          FOR UPDATE SKIP LOCKED
          LIMIT $1
        ), leased AS (
          UPDATE outbox_events o
          SET attempts=o.attempts+1,available_at=NOW()+($2::text || ' seconds')::interval
          FROM claimed c WHERE o.id=c.id
          RETURNING o.*
        )
        SELECT l.id,l.aggregate_type,l.aggregate_id,l.event_type,l.payload_json,l.attempts,
          COALESCE(NULLIF(l.payload_json->>'ownerSubject',''),g.owner_subject) AS owner_subject
        FROM leased l
        LEFT JOIN generation_batches g
          ON l.aggregate_type='generation' AND g.id=l.aggregate_id
        ORDER BY l.created_at`, [boundedLimit, boundedLease]);
      return result.rows.map((row) => ({
        id: row.id,
        aggregateType: row.aggregate_type,
        aggregateId: row.aggregate_id,
        eventType: row.event_type,
        ownerSubject: row.owner_subject,
        payload: row.payload_json ?? {},
        attempts: row.attempts,
      }));
    });
  }

  async finishOutboxEvent(id: string, error?: string): Promise<void> {
    if (!error) {
      await this.database.query(`UPDATE outbox_events
        SET processed_at=NOW(),last_error=NULL WHERE id=$1 AND processed_at IS NULL`, [id]);
      return;
    }
    await this.database.query(`UPDATE outbox_events
      SET last_error=$2,
        available_at=NOW()+((LEAST(3600,POWER(2,LEAST(attempts,11)))::text || ' seconds')::interval)
      WHERE id=$1 AND processed_at IS NULL`, [id, error.slice(0, 1000)]);
  }

  async pendingStorageTombstones(limit = 100): Promise<Array<{ id: string; objectKey: string; ownerSubject: string; attempts: number }>> {
    const result = await this.database.query<{ id: string; object_key: string; owner_subject: string; attempts: number }>(
      `SELECT id,object_key,owner_subject,attempts FROM storage_tombstones
       WHERE deleted_at IS NULL AND next_attempt_at<=NOW() ORDER BY created_at LIMIT $1`, [limit],
    );
    return result.rows.map((row) => ({ id: row.id, objectKey: row.object_key, ownerSubject: row.owner_subject, attempts: row.attempts }));
  }

  async finishStorageTombstone(id: string, error?: string): Promise<void> {
    if (!error) {
      await this.database.query('UPDATE storage_tombstones SET deleted_at=NOW(),last_error=NULL WHERE id=$1', [id]);
      return;
    }
    await this.database.query(`UPDATE storage_tombstones SET attempts=attempts+1,last_error=$2,
      next_attempt_at=NOW()+((LEAST(3600,POWER(2,LEAST(attempts,10)))::text || ' seconds')::interval)
      WHERE id=$1`, [id, error]);
  }
}

export type RawSessionRow = SessionRow;
