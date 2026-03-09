-- Add background_of_request to contracts_repository_view so dashboard list payloads can
-- select it directly without runtime schema mismatch errors.

CREATE OR REPLACE VIEW public.contracts_repository_view
WITH (security_invoker = true)
AS
SELECT
  c.id,
  c.tenant_id,
  c.title,
  c.status,
  c.uploaded_by_employee_id,
  c.uploaded_by_email,
  c.current_assignee_employee_id,
  c.current_assignee_email,
  c.hod_approved_at,
  c.tat_deadline_at,
  c.tat_breached_at,
  c.created_at,
  c.updated_at,
  CASE
    WHEN c.hod_approved_at IS NULL THEN NULL::integer
    ELSE public.business_day_diff(
      (c.hod_approved_at AT TIME ZONE 'UTC')::date,
      (CURRENT_TIMESTAMP AT TIME ZONE 'UTC')::date
    )
  END AS aging_business_days,
  CASE
    WHEN c.tat_deadline_at IS NOT NULL
      AND CURRENT_TIMESTAMP > c.tat_deadline_at
      AND c.status <> ALL (ARRAY['COMPLETED'::text, 'EXECUTED'::text, 'REJECTED'::text])
    THEN true
    ELSE false
  END AS is_tat_breached,
  CASE
    WHEN c.tat_deadline_at IS NOT NULL
      AND CURRENT_TIMESTAMP <= c.tat_deadline_at
      AND c.status <> ALL (ARRAY['COMPLETED'::text, 'EXECUTED'::text, 'REJECTED'::text])
      AND public.business_day_diff(
        (CURRENT_TIMESTAMP AT TIME ZONE 'UTC')::date,
        (c.tat_deadline_at AT TIME ZONE 'UTC')::date
      ) = 1
    THEN true
    ELSE false
  END AS near_breach,
  c.department_id,
  c.request_created_at,
  c.void_reason,
  c.background_of_request
FROM public.contracts AS c
WHERE c.deleted_at IS NULL;

GRANT SELECT ON public.contracts_repository_view TO service_role;
