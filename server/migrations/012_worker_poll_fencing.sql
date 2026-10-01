-- A lease timestamp prevents concurrent polling only while it remains valid.
-- The token additionally fences a worker that resumes after its lease was
-- reclaimed, so it cannot overwrite results committed by the new owner.
ALTER TABLE provider_tasks
  ADD COLUMN IF NOT EXISTS poll_lease_token UUID;

ALTER TABLE upload_extend_stages
  ADD COLUMN IF NOT EXISTS poll_lease_token UUID;

ALTER TABLE track_asset_jobs
  ADD COLUMN IF NOT EXISTS poll_lease_token UUID;
