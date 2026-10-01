ALTER TABLE ai_assistant_runs ADD COLUMN IF NOT EXISTS billing_credential_ciphertext TEXT;
ALTER TABLE ai_assistant_runs ADD COLUMN IF NOT EXISTS billing_status TEXT NOT NULL DEFAULT 'draft';

CREATE INDEX IF NOT EXISTS idx_ai_runs_billing_reconcile
  ON ai_assistant_runs(billing_status, finished_at)
  WHERE billing_status IN ('reserved', 'reconcile_required');
