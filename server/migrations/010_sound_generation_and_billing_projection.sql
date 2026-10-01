-- Persist the optional MXAPI Sound controls separately from ordinary song
-- generation fields. NULL means the caller omitted the Provider parameter.
ALTER TABLE tracks
  ADD COLUMN IF NOT EXISTS sound_tempo DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS sound_key TEXT,
  ADD COLUMN IF NOT EXISTS sound_loop BOOLEAN;

-- audio_weight is conditional on V4.5+ control-slider support. Older models
-- retain upload_extend but persist NULL so the Worker omits the Provider field.
ALTER TABLE upload_extend_stages
  ALTER COLUMN audio_weight DROP NOT NULL,
  ALTER COLUMN audio_weight DROP DEFAULT;
