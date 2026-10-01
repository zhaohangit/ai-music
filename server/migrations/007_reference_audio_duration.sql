-- Duration is derived by the API from the uploaded media bytes. It is stored
-- with the private reference object so later upload_extend requests can be
-- bounded by trusted server state instead of browser metadata.

ALTER TABLE reference_audio_uploads
  ADD COLUMN IF NOT EXISTS duration_seconds DOUBLE PRECISION;

UPDATE reference_audio_uploads
SET duration_seconds = 0
WHERE duration_seconds IS NULL;

ALTER TABLE reference_audio_uploads
  ALTER COLUMN duration_seconds SET DEFAULT 0,
  ALTER COLUMN duration_seconds SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'reference_audio_uploads_duration_seconds_check'
      AND conrelid = 'reference_audio_uploads'::regclass
  ) THEN
    ALTER TABLE reference_audio_uploads
      ADD CONSTRAINT reference_audio_uploads_duration_seconds_check
      CHECK (duration_seconds >= 0 AND duration_seconds <= 600);
  END IF;
END $$;
