-- MXAPI/Suno does not contractually guarantee request-key idempotency.  Keep a
-- durable, local submission boundary so an API/worker replay can never issue a
-- second Provider mutation after the first attempt may have crossed the
-- network.  A stale `started` row is deliberately uncertain: it requires
-- operator reconciliation and must never be auto-resubmitted or auto-released.

ALTER TABLE generation_batches
  ADD COLUMN IF NOT EXISTS provider_submission_state TEXT NOT NULL DEFAULT 'not_started',
  ADD COLUMN IF NOT EXISTS provider_submission_started_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS provider_submission_finished_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS provider_submission_error TEXT,
  ADD COLUMN IF NOT EXISTS provider_submission_payload_digest TEXT;

ALTER TABLE track_asset_jobs
  ADD COLUMN IF NOT EXISTS provider_submission_state TEXT NOT NULL DEFAULT 'not_started',
  ADD COLUMN IF NOT EXISTS provider_submission_started_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS provider_submission_finished_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS provider_submission_error TEXT;

ALTER TABLE upload_extend_stages
  ADD COLUMN IF NOT EXISTS continuation_submission_state TEXT NOT NULL DEFAULT 'not_started',
  ADD COLUMN IF NOT EXISTS continuation_submission_started_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS continuation_submission_finished_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS continuation_submission_error TEXT;

-- Safely classify pre-ledger rows.  Durable task ids prove acceptance.  A
-- legacy process stopped in `submitting` cannot prove whether its POST reached
-- the Provider, so retain the hold for manual review instead of guessing.
UPDATE generation_batches g
SET provider_submission_state = 'accepted',
    provider_submission_started_at = COALESCE(g.submitted_at, g.updated_at, g.created_at),
    provider_submission_finished_at = COALESCE(g.submitted_at, g.updated_at, g.created_at)
WHERE EXISTS (SELECT 1 FROM provider_tasks pt WHERE pt.generation_id = g.id)
   OR EXISTS (SELECT 1 FROM upload_extend_stages us WHERE us.generation_id = g.id)
   OR g.submitted_at IS NOT NULL;

UPDATE generation_batches
SET provider_submission_state = 'uncertain',
    provider_submission_started_at = COALESCE(updated_at, created_at),
    provider_submission_finished_at = NOW(),
    provider_submission_error = 'legacy submitting generation has an unknown Provider outcome',
    status = 'failed',
    billing_status = CASE
      WHEN billing_status IN ('reserve_pending','reserved','capture_required','release_required','reconcile_required')
        THEN 'manual_review_required'
      ELSE billing_status
    END,
    error = COALESCE(error, 'legacy submitting generation requires Provider outcome review'),
    finished_at = COALESCE(finished_at, NOW()),
    updated_at = NOW()
WHERE provider_submission_state = 'not_started'
  AND status = 'submitting';

UPDATE generation_batches
SET provider_submission_state = 'rejected',
    provider_submission_started_at = COALESCE(updated_at, created_at),
    provider_submission_finished_at = COALESCE(finished_at, updated_at, created_at)
WHERE provider_submission_state = 'not_started'
  AND status = 'failed'
  AND billing_status IN ('released','disabled','not_reserved');

UPDATE generation_batches
SET provider_submission_state = 'uncertain',
    provider_submission_started_at = COALESCE(updated_at, created_at),
    provider_submission_finished_at = COALESCE(finished_at, NOW()),
    provider_submission_error = COALESCE(error, 'legacy failed generation has an unknown Provider outcome'),
    billing_status = 'manual_review_required',
    updated_at = NOW()
WHERE provider_submission_state = 'not_started'
  AND status = 'failed'
  AND billing_status NOT IN ('released','disabled','not_reserved');

UPDATE track_asset_jobs
SET provider_submission_state = 'accepted',
    provider_submission_started_at = COALESCE(updated_at, created_at),
    provider_submission_finished_at = COALESCE(updated_at, created_at)
WHERE upstream_task_id IS NOT NULL;

UPDATE track_asset_jobs
SET provider_submission_state = 'uncertain',
    provider_submission_started_at = COALESCE(updated_at, created_at),
    provider_submission_finished_at = NOW(),
    provider_submission_error = 'legacy submitting asset job has an unknown Provider outcome',
    status = 'failed',
    billing_status = CASE
      WHEN billing_status IN ('reserve_pending','reserved','capture_required','release_required','reconcile_required')
        THEN 'manual_review_required'
      ELSE billing_status
    END,
    error = COALESCE(error, 'legacy submitting asset job requires Provider outcome review'),
    finished_at = COALESCE(finished_at, NOW()),
    updated_at = NOW()
WHERE provider_submission_state = 'not_started'
  AND status = 'submitting';

UPDATE track_asset_jobs
SET provider_submission_state = 'rejected',
    provider_submission_started_at = COALESCE(updated_at, created_at),
    provider_submission_finished_at = COALESCE(finished_at, updated_at, created_at)
WHERE provider_submission_state = 'not_started'
  AND status = 'failed'
  AND billing_status IN ('released','disabled','not_reserved');

UPDATE track_asset_jobs
SET provider_submission_state = 'uncertain',
    provider_submission_started_at = COALESCE(updated_at, created_at),
    provider_submission_finished_at = COALESCE(finished_at, NOW()),
    provider_submission_error = COALESCE(error, 'legacy failed asset job has an unknown Provider outcome'),
    billing_status = 'manual_review_required',
    updated_at = NOW()
WHERE provider_submission_state = 'not_started'
  AND status = 'failed'
  AND billing_status NOT IN ('released','disabled','not_reserved');

UPDATE upload_extend_stages s
SET continuation_submission_state = 'accepted',
    continuation_submission_started_at = COALESCE(s.updated_at, s.created_at),
    continuation_submission_finished_at = COALESCE(s.finished_at, s.updated_at, s.created_at)
WHERE s.status = 'done'
   OR EXISTS (SELECT 1 FROM tracks t WHERE t.generation_id = s.generation_id);

UPDATE upload_extend_stages
SET continuation_submission_state = 'uncertain',
    continuation_submission_started_at = COALESCE(updated_at, created_at),
    continuation_submission_finished_at = NOW(),
    continuation_submission_error = 'legacy continuation submission has an unknown Provider outcome',
    status = 'manual_review_required',
    stage = 'error',
    last_error = COALESCE(last_error, 'legacy continuation submission requires Provider outcome review'),
    finished_at = COALESCE(finished_at, NOW()),
    updated_at = NOW()
WHERE continuation_submission_state = 'not_started'
  AND status = 'continuation_submitting';

UPDATE generation_batches g
SET status = 'failed',
    billing_status = 'manual_review_required',
    error = COALESCE(g.error, 'legacy continuation submission requires Provider outcome review'),
    finished_at = COALESCE(g.finished_at, NOW()),
    updated_at = NOW()
WHERE EXISTS (
  SELECT 1 FROM upload_extend_stages s
  WHERE s.generation_id = g.id
    AND s.continuation_submission_state = 'uncertain'
);

UPDATE billing_operation_mirrors b
SET status = 'manual_review_required',
    last_error = COALESCE(b.last_error, 'Provider submission outcome requires manual review'),
    updated_at = NOW()
WHERE EXISTS (
  SELECT 1 FROM generation_batches g
  WHERE g.id = b.generation_id
    AND g.provider_submission_state = 'uncertain'
)
OR EXISTS (
  SELECT 1 FROM track_asset_jobs j
  WHERE j.id = b.asset_job_id
    AND j.provider_submission_state = 'uncertain'
)
OR EXISTS (
  SELECT 1
  FROM upload_extend_stages s
  WHERE s.generation_id = b.generation_id
    AND s.continuation_submission_state = 'uncertain'
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'generation_batches_provider_submission_state_check'
      AND conrelid = 'generation_batches'::regclass
  ) THEN
    ALTER TABLE generation_batches
      ADD CONSTRAINT generation_batches_provider_submission_state_check
      CHECK (provider_submission_state IN ('not_started','started','accepted','rejected','uncertain'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'track_asset_jobs_provider_submission_state_check'
      AND conrelid = 'track_asset_jobs'::regclass
  ) THEN
    ALTER TABLE track_asset_jobs
      ADD CONSTRAINT track_asset_jobs_provider_submission_state_check
      CHECK (provider_submission_state IN ('not_started','started','accepted','rejected','uncertain'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'upload_extend_stages_continuation_submission_state_check'
      AND conrelid = 'upload_extend_stages'::regclass
  ) THEN
    ALTER TABLE upload_extend_stages
      ADD CONSTRAINT upload_extend_stages_continuation_submission_state_check
      CHECK (continuation_submission_state IN ('not_started','started','accepted','rejected','uncertain'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_generation_provider_submission_review
  ON generation_batches(provider_submission_state, provider_submission_started_at)
  WHERE provider_submission_state IN ('started','uncertain');

CREATE INDEX IF NOT EXISTS idx_track_asset_provider_submission_review
  ON track_asset_jobs(provider_submission_state, provider_submission_started_at)
  WHERE provider_submission_state IN ('started','uncertain');

CREATE INDEX IF NOT EXISTS idx_upload_extend_continuation_submission_review
  ON upload_extend_stages(continuation_submission_state, continuation_submission_started_at)
  WHERE continuation_submission_state IN ('started','uncertain');
