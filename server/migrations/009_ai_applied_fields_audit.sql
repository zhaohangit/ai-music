ALTER TABLE ai_assistant_runs
  ADD COLUMN IF NOT EXISTS accepted_fields JSONB;

ALTER TABLE prompt_revisions
  ADD COLUMN IF NOT EXISTS applied_fields JSONB NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE prompt_revisions
  DROP CONSTRAINT IF EXISTS chk_prompt_revisions_applied_fields_array;

ALTER TABLE prompt_revisions
  ADD CONSTRAINT chk_prompt_revisions_applied_fields_array
  CHECK (jsonb_typeof(applied_fields) = 'array');
