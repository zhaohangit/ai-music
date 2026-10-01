-- Durable terminal-result grace windows let workers distinguish a Provider
-- that is still publishing assets from one that completed with no usable
-- result. These timestamps survive worker restarts and concurrent consumers.
ALTER TABLE provider_tasks
  ADD COLUMN IF NOT EXISTS terminal_wait_started_at TIMESTAMPTZ;

ALTER TABLE upload_extend_stages
  ADD COLUMN IF NOT EXISTS terminal_wait_started_at TIMESTAMPTZ;

ALTER TABLE track_asset_jobs
  ADD COLUMN IF NOT EXISTS terminal_wait_started_at TIMESTAMPTZ;

-- Migration 006 assigned 0.5 to every upload-extend row before audio_weight
-- became optional in migration 010. Models older than V4.5 cannot accept that
-- advanced control, so clear only the legacy default for those generations.
UPDATE upload_extend_stages s
SET audio_weight=NULL,updated_at=NOW()
FROM generation_batches g
WHERE g.id=s.generation_id
  AND s.audio_weight=0.5
  AND COALESCE(g.request_json->>'model','') NOT IN (
    'chirp-fenix','chirp-crow','chirp-bluejay','chirp-auk','chirp-auk-turbo'
  );
