ALTER TABLE ai_assistant_runs ADD COLUMN IF NOT EXISTS idempotency_key TEXT;
ALTER TABLE ai_assistant_runs ADD COLUMN IF NOT EXISTS request_digest TEXT;
ALTER TABLE ai_assistant_runs ADD COLUMN IF NOT EXISTS result_json JSONB;

CREATE UNIQUE INDEX IF NOT EXISTS idx_ai_runs_owner_idempotency
  ON ai_assistant_runs(owner_subject, idempotency_key)
  WHERE idempotency_key IS NOT NULL;
