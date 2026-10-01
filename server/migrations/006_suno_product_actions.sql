-- Suno product actions are persisted product resources, never stateless
-- provider passthroughs. Every statement is safe to re-run against an older
-- installation while schema_migrations remains the normal once-only gate.

CREATE TABLE IF NOT EXISTS reference_audio_uploads (
  id TEXT PRIMARY KEY,
  owner_subject TEXT NOT NULL REFERENCES identity_links(subject) ON DELETE CASCADE,
  object_key TEXT NOT NULL UNIQUE,
  original_filename TEXT NOT NULL DEFAULT '',
  mime_type TEXT NOT NULL,
  byte_size BIGINT NOT NULL,
  checksum_sha256 TEXT NOT NULL,
  copyright_confirmed BOOLEAN NOT NULL,
  copyright_audio BOOLEAN NOT NULL DEFAULT FALSE,
  idempotency_key TEXT NOT NULL,
  request_digest TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'storing',
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  UNIQUE(owner_subject, idempotency_key)
);
CREATE INDEX IF NOT EXISTS idx_reference_audio_owner
  ON reference_audio_uploads(owner_subject, created_at DESC) WHERE deleted_at IS NULL;

ALTER TABLE generation_batches
  ADD COLUMN IF NOT EXISTS reference_audio_id TEXT REFERENCES reference_audio_uploads(id) ON DELETE SET NULL;

ALTER TABLE tracks ADD COLUMN IF NOT EXISTS provider_record_id BIGINT;
ALTER TABLE provider_tasks ADD COLUMN IF NOT EXISTS provider_record_id BIGINT;

CREATE TABLE IF NOT EXISTS upload_extend_stages (
  id TEXT PRIMARY KEY,
  generation_id TEXT NOT NULL UNIQUE REFERENCES generation_batches(id) ON DELETE CASCADE,
  owner_subject TEXT NOT NULL REFERENCES identity_links(subject) ON DELETE CASCADE,
  reference_audio_id TEXT REFERENCES reference_audio_uploads(id) ON DELETE SET NULL,
  upstream_task_id TEXT NOT NULL UNIQUE,
  provider_record_id BIGINT,
  custom_id TEXT,
  continue_at DOUBLE PRECISION NOT NULL DEFAULT 0,
  audio_weight DOUBLE PRECISION NOT NULL DEFAULT 0.5,
  status TEXT NOT NULL DEFAULT 'queued',
  stage TEXT NOT NULL DEFAULT 'uploading',
  progress DOUBLE PRECISION NOT NULL DEFAULT 0,
  attempts INTEGER NOT NULL DEFAULT 0,
  next_poll_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_polled_at TIMESTAMPTZ,
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  finished_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_upload_extend_stages_poll
  ON upload_extend_stages(status, next_poll_at)
  WHERE status IN ('queued','running','continuation_ready','continuation_submitting');

CREATE TABLE IF NOT EXISTS track_asset_jobs (
  id TEXT PRIMARY KEY,
  track_id TEXT NOT NULL REFERENCES tracks(id) ON DELETE CASCADE,
  owner_subject TEXT NOT NULL REFERENCES identity_links(subject) ON DELETE CASCADE,
  action TEXT NOT NULL,
  operation_code TEXT NOT NULL,
  idempotency_key TEXT NOT NULL,
  request_digest TEXT NOT NULL,
  request_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'draft',
  progress DOUBLE PRECISION NOT NULL DEFAULT 0,
  upstream_task_id TEXT,
  provider_record_id BIGINT,
  result_json JSONB,
  asset_id TEXT REFERENCES track_assets(id) ON DELETE SET NULL,
  price_version TEXT,
  estimated_credits BIGINT NOT NULL DEFAULT 0,
  actual_credits BIGINT,
  billing_operation_id TEXT,
  billing_reservation_id TEXT,
  billing_credential_ciphertext TEXT,
  billing_status TEXT NOT NULL DEFAULT 'draft',
  attempts INTEGER NOT NULL DEFAULT 0,
  next_poll_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_polled_at TIMESTAMPTZ,
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  finished_at TIMESTAMPTZ,
  UNIQUE(owner_subject, idempotency_key)
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_track_asset_jobs_upstream
  ON track_asset_jobs(upstream_task_id) WHERE upstream_task_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_track_asset_jobs_poll
  ON track_asset_jobs(status, next_poll_at)
  WHERE status IN ('queued','running');
CREATE INDEX IF NOT EXISTS idx_track_asset_jobs_billing_reconcile
  ON track_asset_jobs(billing_status, updated_at)
  WHERE billing_status IN ('reserve_pending','reserved','capture_required','release_required','reconcile_required');
CREATE INDEX IF NOT EXISTS idx_track_asset_jobs_track
  ON track_asset_jobs(owner_subject, track_id, created_at DESC);

ALTER TABLE billing_operation_mirrors ADD COLUMN IF NOT EXISTS asset_job_id TEXT;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'billing_operation_mirrors_asset_job_id_fkey'
      AND conrelid = 'billing_operation_mirrors'::regclass
  ) THEN
    ALTER TABLE billing_operation_mirrors
      ADD CONSTRAINT billing_operation_mirrors_asset_job_id_fkey
      FOREIGN KEY(asset_job_id) REFERENCES track_asset_jobs(id) ON DELETE SET NULL;
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS idx_billing_mirrors_asset_job
  ON billing_operation_mirrors(asset_job_id) WHERE asset_job_id IS NOT NULL;
