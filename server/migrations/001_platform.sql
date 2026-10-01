CREATE TABLE IF NOT EXISTS schema_migrations (
  name TEXT PRIMARY KEY,
  checksum TEXT NOT NULL,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS identity_links (
  subject TEXT PRIMARY KEY,
  issuer TEXT NOT NULL,
  modelcross_user_id TEXT,
  email TEXT,
  email_verified BOOLEAN NOT NULL DEFAULT FALSE,
  display_name TEXT NOT NULL,
  avatar_url TEXT,
  roles JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS app_sessions (
  token_hash TEXT PRIMARY KEY,
  subject TEXT NOT NULL REFERENCES identity_links(subject) ON DELETE CASCADE,
  client_id TEXT NOT NULL,
  access_token_ciphertext TEXT NOT NULL,
  refresh_token_ciphertext TEXT NOT NULL,
  id_token_ciphertext TEXT,
  access_expires_at TIMESTAMPTZ NOT NULL,
  refresh_expires_at TIMESTAMPTZ NOT NULL,
  user_agent_hash TEXT,
  ip_hash TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  revoked_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_app_sessions_subject ON app_sessions(subject, created_at DESC);

CREATE TABLE IF NOT EXISTS auth_transactions (
  state_hash TEXT PRIMARY KEY,
  code_verifier_ciphertext TEXT NOT NULL,
  nonce TEXT NOT NULL,
  return_to TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS workspaces (
  id TEXT PRIMARY KEY,
  owner_subject TEXT NOT NULL REFERENCES identity_links(subject) ON DELETE CASCADE,
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_workspaces_default_name ON workspaces(owner_subject, name);

CREATE TABLE IF NOT EXISTS music_projects (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  owner_subject TEXT NOT NULL REFERENCES identity_links(subject) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  cover_object_key TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  archived_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_music_projects_owner ON music_projects(owner_subject, updated_at DESC);

CREATE TABLE IF NOT EXISTS generation_batches (
  id TEXT PRIMARY KEY,
  owner_subject TEXT NOT NULL REFERENCES identity_links(subject) ON DELETE CASCADE,
  project_id TEXT REFERENCES music_projects(id) ON DELETE SET NULL,
  operation TEXT NOT NULL,
  source_track_id TEXT,
  model_profile_id TEXT NOT NULL,
  status TEXT NOT NULL,
  idempotency_key TEXT NOT NULL,
  request_json JSONB NOT NULL,
  price_version TEXT,
  estimated_credits BIGINT NOT NULL DEFAULT 0,
  billing_operation_id TEXT,
  billing_reservation_id TEXT,
  billing_credential_ciphertext TEXT,
  billing_status TEXT NOT NULL DEFAULT 'draft',
  error TEXT,
  submitted_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(owner_subject, idempotency_key)
);
CREATE INDEX IF NOT EXISTS idx_generation_batches_owner ON generation_batches(owner_subject, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_generation_batches_status ON generation_batches(status, updated_at);

CREATE TABLE IF NOT EXISTS tracks (
  id TEXT PRIMARY KEY,
  generation_id TEXT NOT NULL REFERENCES generation_batches(id) ON DELETE CASCADE,
  owner_subject TEXT NOT NULL REFERENCES identity_links(subject) ON DELETE CASCADE,
  project_id TEXT REFERENCES music_projects(id) ON DELETE SET NULL,
  take_index INTEGER NOT NULL,
  source_track_id TEXT,
  title TEXT NOT NULL,
  mode TEXT NOT NULL,
  operation TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  style TEXT NOT NULL DEFAULT '',
  lyrics TEXT NOT NULL DEFAULT '',
  instrumental BOOLEAN NOT NULL DEFAULT FALSE,
  model TEXT NOT NULL,
  negative_tags TEXT NOT NULL DEFAULT '',
  vocal_gender TEXT NOT NULL DEFAULT 'auto',
  style_weight DOUBLE PRECISION NOT NULL DEFAULT 0.5,
  weirdness DOUBLE PRECISION NOT NULL DEFAULT 0.5,
  status TEXT NOT NULL,
  stage TEXT NOT NULL,
  progress DOUBLE PRECISION NOT NULL DEFAULT 0,
  error TEXT,
  upstream_status TEXT,
  custom_id TEXT,
  duration DOUBLE PRECISION NOT NULL DEFAULT 0,
  format TEXT NOT NULL DEFAULT 'mp3',
  points_cost BIGINT,
  points_refunded BOOLEAN,
  video_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  finished_at TIMESTAMPTZ,
  UNIQUE(generation_id, take_index)
);
CREATE INDEX IF NOT EXISTS idx_tracks_owner ON tracks(owner_subject, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_tracks_project ON tracks(owner_subject, project_id, created_at DESC);

CREATE TABLE IF NOT EXISTS provider_tasks (
  id TEXT PRIMARY KEY,
  generation_id TEXT NOT NULL REFERENCES generation_batches(id) ON DELETE CASCADE,
  track_id TEXT NOT NULL REFERENCES tracks(id) ON DELETE CASCADE,
  owner_subject TEXT NOT NULL REFERENCES identity_links(subject) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  upstream_task_id TEXT NOT NULL,
  custom_id TEXT,
  status TEXT NOT NULL,
  stage TEXT NOT NULL,
  progress DOUBLE PRECISION NOT NULL DEFAULT 0,
  attempts INTEGER NOT NULL DEFAULT 0,
  next_poll_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_polled_at TIMESTAMPTZ,
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(provider, upstream_task_id),
  UNIQUE(track_id)
);
CREATE INDEX IF NOT EXISTS idx_provider_tasks_poll ON provider_tasks(status, next_poll_at);

CREATE TABLE IF NOT EXISTS track_assets (
  id TEXT PRIMARY KEY,
  track_id TEXT NOT NULL REFERENCES tracks(id) ON DELETE CASCADE,
  owner_subject TEXT NOT NULL REFERENCES identity_links(subject) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  object_key TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  byte_size BIGINT NOT NULL,
  etag TEXT,
  checksum_sha256 TEXT NOT NULL,
  source_url_digest TEXT,
  status TEXT NOT NULL DEFAULT 'ready',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  UNIQUE(track_id, kind)
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_track_assets_object_key ON track_assets(object_key);

CREATE TABLE IF NOT EXISTS prompt_documents (
  id TEXT PRIMARY KEY,
  owner_subject TEXT NOT NULL REFERENCES identity_links(subject) ON DELETE CASCADE,
  project_id TEXT REFERENCES music_projects(id) ON DELETE SET NULL,
  kind TEXT NOT NULL,
  title TEXT NOT NULL DEFAULT '',
  current_revision_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS prompt_revisions (
  id TEXT PRIMARY KEY,
  document_id TEXT NOT NULL REFERENCES prompt_documents(id) ON DELETE CASCADE,
  owner_subject TEXT NOT NULL REFERENCES identity_links(subject) ON DELETE CASCADE,
  source TEXT NOT NULL,
  content TEXT NOT NULL,
  summary TEXT NOT NULL DEFAULT '',
  parent_revision_id TEXT,
  ai_run_id TEXT,
  accepted BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_prompt_revisions_document ON prompt_revisions(document_id, created_at DESC);

CREATE TABLE IF NOT EXISTS ai_assistant_runs (
  id TEXT PRIMARY KEY,
  owner_subject TEXT NOT NULL REFERENCES identity_links(subject) ON DELETE CASCADE,
  project_id TEXT REFERENCES music_projects(id) ON DELETE SET NULL,
  capability_key TEXT NOT NULL,
  model_alias TEXT NOT NULL,
  prompt_version TEXT NOT NULL,
  input_digest TEXT NOT NULL,
  original_text TEXT NOT NULL DEFAULT '',
  suggestion_text TEXT,
  summary TEXT,
  modelcross_request_id TEXT,
  estimated_credits BIGINT NOT NULL DEFAULT 0,
  actual_credits BIGINT,
  status TEXT NOT NULL,
  accepted_at TIMESTAMPTZ,
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  finished_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_ai_runs_owner ON ai_assistant_runs(owner_subject, created_at DESC);

CREATE TABLE IF NOT EXISTS music_model_profiles (
  id TEXT PRIMARY KEY,
  display_name TEXT NOT NULL,
  provider TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  badge TEXT,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  estimated_credits BIGINT NOT NULL DEFAULT 0,
  price_version TEXT NOT NULL,
  capabilities_json JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS billing_operation_mirrors (
  id TEXT PRIMARY KEY,
  owner_subject TEXT NOT NULL REFERENCES identity_links(subject) ON DELETE CASCADE,
  generation_id TEXT REFERENCES generation_batches(id) ON DELETE SET NULL,
  ai_run_id TEXT REFERENCES ai_assistant_runs(id) ON DELETE SET NULL,
  remote_operation_id TEXT,
  remote_reservation_id TEXT,
  operation_code TEXT NOT NULL,
  idempotency_key TEXT NOT NULL,
  price_version TEXT,
  reserved_credits BIGINT NOT NULL DEFAULT 0,
  settled_credits BIGINT NOT NULL DEFAULT 0,
  status TEXT NOT NULL,
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(owner_subject, idempotency_key)
);

CREATE TABLE IF NOT EXISTS payment_order_mirrors (
  id TEXT PRIMARY KEY,
  owner_subject TEXT NOT NULL REFERENCES identity_links(subject) ON DELETE CASCADE,
  remote_order_id TEXT NOT NULL,
  provider TEXT NOT NULL,
  amount_minor BIGINT NOT NULL,
  currency TEXT NOT NULL,
  status TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  UNIQUE(owner_subject, remote_order_id)
);

CREATE TABLE IF NOT EXISTS idempotency_keys (
  owner_subject TEXT NOT NULL REFERENCES identity_links(subject) ON DELETE CASCADE,
  scope TEXT NOT NULL,
  idempotency_key TEXT NOT NULL,
  request_digest TEXT NOT NULL,
  resource_id TEXT,
  response_status INTEGER,
  response_json JSONB,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY(owner_subject, scope, idempotency_key)
);

CREATE TABLE IF NOT EXISTS outbox_events (
  id TEXT PRIMARY KEY,
  aggregate_type TEXT NOT NULL,
  aggregate_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  payload_json JSONB NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  available_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  processed_at TIMESTAMPTZ,
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_outbox_pending ON outbox_events(processed_at, available_at);

CREATE TABLE IF NOT EXISTS audit_events (
  id TEXT PRIMARY KEY,
  owner_subject TEXT,
  actor_subject TEXT,
  action TEXT NOT NULL,
  resource_type TEXT NOT NULL,
  resource_id TEXT,
  request_id TEXT,
  ip_hash TEXT,
  user_agent_hash TEXT,
  metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_audit_owner ON audit_events(owner_subject, created_at DESC);

CREATE TABLE IF NOT EXISTS storage_tombstones (
  id TEXT PRIMARY KEY,
  owner_subject TEXT NOT NULL,
  object_key TEXT NOT NULL,
  reason TEXT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(object_key)
);

CREATE TABLE IF NOT EXISTS content_reports (
  id TEXT PRIMARY KEY,
  owner_subject TEXT NOT NULL,
  track_id TEXT REFERENCES tracks(id) ON DELETE SET NULL,
  category TEXT NOT NULL,
  details TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'open',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at TIMESTAMPTZ
);
