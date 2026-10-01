CREATE TABLE IF NOT EXISTS mv_references (
  id TEXT PRIMARY KEY, owner_subject TEXT NOT NULL REFERENCES identity_links(subject) ON DELETE CASCADE,
  name TEXT NOT NULL, object_key TEXT NOT NULL, mime_type TEXT NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS mv_projects (
  id TEXT PRIMARY KEY, owner_subject TEXT NOT NULL REFERENCES identity_links(subject) ON DELETE CASCADE,
  track_id TEXT NOT NULL REFERENCES tracks(id) ON DELETE CASCADE, data JSONB NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft', revision INTEGER NOT NULL DEFAULT 1,
  idempotency_key TEXT NOT NULL, request_digest TEXT NOT NULL,
  lease_token TEXT, lease_until TIMESTAMPTZ, next_poll_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(owner_subject,idempotency_key)
);
CREATE INDEX IF NOT EXISTS idx_mv_owner ON mv_projects(owner_subject,created_at DESC);
CREATE INDEX IF NOT EXISTS idx_mv_work ON mv_projects(status,next_poll_at);
