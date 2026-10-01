-- Preserve operation-specific fields that are not part of the normalized
-- GenerateRequest shape.  The digest protects idempotency, while this JSONB
-- column makes the exact user-selected Provider parameters auditable and
-- available to task/asset views after the request has been accepted.
ALTER TABLE generation_batches
  ADD COLUMN IF NOT EXISTS submission_options_json JSONB NOT NULL DEFAULT '{}'::jsonb;
