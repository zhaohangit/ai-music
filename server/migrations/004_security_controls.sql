CREATE TABLE IF NOT EXISTS api_rate_limit_buckets (
  scope TEXT NOT NULL,
  key_hash TEXT NOT NULL,
  window_started_at TIMESTAMPTZ NOT NULL,
  request_count INTEGER NOT NULL DEFAULT 0 CHECK (request_count >= 0),
  expires_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY(scope, key_hash, window_started_at)
);

CREATE INDEX IF NOT EXISTS idx_api_rate_limit_buckets_expiry
  ON api_rate_limit_buckets(expires_at);

CREATE INDEX IF NOT EXISTS idx_auth_transactions_expiry
  ON auth_transactions(expires_at);

CREATE INDEX IF NOT EXISTS idx_app_sessions_expiry
  ON app_sessions(refresh_expires_at)
  WHERE revoked_at IS NULL;
