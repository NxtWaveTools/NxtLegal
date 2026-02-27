INSERT INTO public.department_legal_assignments (
  tenant_id,
  department_id,
  user_id,
  is_active,
  assigned_by,
  assigned_at,
  revoked_by,
  revoked_at,
  deleted_at
)
SELECT
  t.tenant_id,
  t.id AS department_id,
  u.id AS user_id,
  TRUE,
  NULL,
  NOW(),
  NULL,
  NULL,
  NULL
FROM public.teams t
JOIN public.users u
  ON u.tenant_id = t.tenant_id
WHERE lower(t.name) = lower('Legal and Compliance')
  AND t.deleted_at IS NULL
  AND u.deleted_at IS NULL
  AND u.is_active = TRUE
  AND upper(COALESCE(u.role, '')) = 'LEGAL_TEAM'
ON CONFLICT (tenant_id, department_id, user_id)
DO UPDATE SET
  is_active = TRUE,
  revoked_by = NULL,
  revoked_at = NULL,
  deleted_at = NULL,
  updated_at = NOW();
