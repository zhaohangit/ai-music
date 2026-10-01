-- Separate music and AI retry-key namespaces without changing the original
-- user-supplied Idempotency-Key stored on their aggregate roots.
UPDATE billing_operation_mirrors
SET idempotency_key = CASE
  WHEN generation_id IS NOT NULL THEN 'music:' || idempotency_key
  WHEN ai_run_id IS NOT NULL AND idempotency_key NOT LIKE 'ai:%' THEN 'ai:' || idempotency_key
  ELSE idempotency_key
END,
updated_at = NOW();

-- Legacy code could silently overwrite an AI mirror with music identifiers
-- when music used "ai:<key>". Discard that mismatched remote association so
-- the owner-scoped ModelCross lookup can recover the AI reservation safely.
UPDATE ai_assistant_runs a
SET billing_status = 'reconcile_required'
FROM billing_operation_mirrors b
WHERE b.ai_run_id = a.id
  AND b.operation_code IN ('generation_pair','extend_pair','cover_pair','remaster_pair');

-- The inverse collision kept the music association while overwriting its
-- remote identifiers with an AI operation. The affected AI aggregate can be
-- recovered by owner + resource + its original key even though the legacy
-- mirror never pointed at it.
UPDATE ai_assistant_runs a
SET billing_status = 'reconcile_required'
FROM billing_operation_mirrors b
WHERE b.generation_id IS NOT NULL
  AND b.owner_subject = a.owner_subject
  AND b.idempotency_key = 'music:ai:' || a.idempotency_key
  AND b.operation_code NOT IN ('generation_pair','extend_pair','cover_pair','remaster_pair');

UPDATE billing_operation_mirrors
SET remote_operation_id = NULL,
    remote_reservation_id = NULL,
    status = 'reconcile_required',
    last_error = 'legacy cross-namespace mirror requires owner-scoped recovery',
    updated_at = NOW()
WHERE ai_run_id IS NOT NULL
  AND operation_code IN ('generation_pair','extend_pair','cover_pair','remaster_pair');

-- generation_batches already contains the authoritative identifiers written
-- immediately after Reserve. Rebuild/repair every legacy music mirror from
-- that aggregate, including rows previously overwritten by an AI collision.
INSERT INTO billing_operation_mirrors(
  id,owner_subject,generation_id,ai_run_id,remote_operation_id,remote_reservation_id,
  operation_code,idempotency_key,price_version,reserved_credits,settled_credits,status,
  last_error,created_at,updated_at
)
SELECT
  gen_random_uuid()::text,g.owner_subject,g.id,NULL,g.billing_operation_id,g.billing_reservation_id,
  CASE g.operation
    WHEN 'generate' THEN 'generation_pair'
    WHEN 'extend' THEN 'extend_pair'
    WHEN 'cover' THEN 'cover_pair'
    WHEN 'remaster' THEN 'remaster_pair'
    ELSE g.operation || '_pair'
  END,
  'music:' || g.idempotency_key,g.price_version,g.estimated_credits,0,g.billing_status,
  NULL,g.created_at,NOW()
FROM generation_batches g
WHERE g.billing_operation_id IS NOT NULL AND g.billing_reservation_id IS NOT NULL
ON CONFLICT(owner_subject,idempotency_key) DO UPDATE SET
  generation_id = EXCLUDED.generation_id,
  ai_run_id = NULL,
  remote_operation_id = EXCLUDED.remote_operation_id,
  remote_reservation_id = EXCLUDED.remote_reservation_id,
  operation_code = EXCLUDED.operation_code,
  price_version = EXCLUDED.price_version,
  reserved_credits = EXCLUDED.reserved_credits,
  status = EXCLUDED.status,
  last_error = NULL,
  updated_at = NOW();

CREATE INDEX IF NOT EXISTS idx_generation_batches_reserve_recovery
  ON generation_batches(billing_status,updated_at)
  WHERE billing_status IN ('reserve_pending','reconcile_required');

CREATE INDEX IF NOT EXISTS idx_ai_runs_reserve_recovery
  ON ai_assistant_runs(billing_status,created_at)
  WHERE billing_status IN ('reserve_pending','reconcile_required');
