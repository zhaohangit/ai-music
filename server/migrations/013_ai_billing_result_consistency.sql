-- AI replay payloads must project the authoritative aggregate billing state.
-- Older workers updated relational columns after reconciliation but left both
-- persisted JSON response copies with the pre-reconciliation status.
UPDATE ai_assistant_runs
SET actual_credits = CASE
      WHEN billing_status='captured' THEN COALESCE(actual_credits,0)
      WHEN billing_status IN('released','refunded','disabled','not_reserved') THEN 0
      WHEN billing_status IN('reserved','reconcile_required','manual_review_required') THEN NULL
      ELSE actual_credits
    END,
    result_json = CASE
      WHEN billing_status='captured' THEN
        (result_json || jsonb_build_object('actualCredits',COALESCE(actual_credits,0)))
        || jsonb_build_object('billing',
          COALESCE(result_json->'billing','{}'::jsonb)
          || jsonb_build_object('status',billing_status,'actualCredits',COALESCE(actual_credits,0)))
      WHEN billing_status IN('released','refunded','disabled','not_reserved') THEN
        (result_json || jsonb_build_object('actualCredits',0))
        || jsonb_build_object('billing',
          COALESCE(result_json->'billing','{}'::jsonb)
          || jsonb_build_object('status',billing_status,'actualCredits',0))
      ELSE
        (result_json - 'actualCredits')
        || jsonb_build_object('billing',
          (COALESCE(result_json->'billing','{}'::jsonb) - 'actualCredits')
          || jsonb_build_object('status',billing_status))
    END
WHERE result_json IS NOT NULL
  AND billing_status IN(
    'reserved','captured','released','refunded','disabled','not_reserved',
    'reconcile_required','manual_review_required'
  );

UPDATE idempotency_keys i
SET response_json = a.result_json
FROM ai_assistant_runs a
WHERE i.owner_subject=a.owner_subject
  AND i.scope='ai.assist'
  AND i.resource_id=a.id
  AND a.result_json IS NOT NULL
  AND i.response_json IS DISTINCT FROM a.result_json;
