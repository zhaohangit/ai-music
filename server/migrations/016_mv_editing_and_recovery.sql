ALTER TABLE mv_projects ADD COLUMN IF NOT EXISTS pause_requested BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE mv_projects ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ;
ALTER TABLE mv_projects ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
CREATE TABLE IF NOT EXISTS mv_audio_stems (
 id TEXT PRIMARY KEY, owner_subject TEXT NOT NULL REFERENCES identity_links(subject) ON DELETE CASCADE,
 track_id TEXT NOT NULL REFERENCES tracks(id) ON DELETE CASCADE, kind TEXT NOT NULL CHECK(kind IN ('vocals','instrumental')),
 object_key TEXT NOT NULL UNIQUE, name TEXT NOT NULL, duration DOUBLE PRECISION NOT NULL,
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), deleted_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS mv_audio_stems_owner ON mv_audio_stems(owner_subject,track_id);
