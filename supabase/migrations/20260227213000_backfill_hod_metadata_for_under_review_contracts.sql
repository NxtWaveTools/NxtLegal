WITH contracts_missing_hod_metadata AS (
  SELECT
    c.id,
    COALESCE(c.hod_approved_at, c.updated_at, c.created_at) AS resolved_hod_approved_at
  FROM public.contracts AS c
  WHERE c.deleted_at IS NULL
    AND c.hod_approved_at IS NULL
    AND c.status = ANY (
      ARRAY[
        'UNDER_REVIEW'::text,
        'PENDING_WITH_INTERNAL_STAKEHOLDERS'::text,
        'PENDING_WITH_EXTERNAL_STAKEHOLDERS'::text,
        'OFFLINE_EXECUTION'::text,
        'ON_HOLD'::text,
        'COMPLETED'::text,
        'EXECUTED'::text
      ]
    )
)
UPDATE public.contracts AS c
SET
  hod_approved_at = m.resolved_hod_approved_at,
  tat_deadline_at = COALESCE(
    c.tat_deadline_at,
    (
      public.business_day_add(
        (m.resolved_hod_approved_at AT TIME ZONE 'UTC')::date,
        7
      )::text || 'T23:59:59.000Z'
    )::timestamptz
  )
FROM contracts_missing_hod_metadata AS m
WHERE c.id = m.id;
