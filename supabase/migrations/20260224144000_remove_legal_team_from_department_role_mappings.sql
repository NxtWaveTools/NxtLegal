-- Move LEGAL_TEAM assignment semantics out of team_role_mappings role_type and restore POC/HOD-only primary role mapping

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
  trm.tenant_id,
  trm.team_id,
  u.id,
  TRUE,
  trm.assigned_by,
  COALESCE(trm.assigned_at, NOW()),
  NULL,
  NULL,
  NULL
FROM public.team_role_mappings trm
JOIN public.users u
  ON u.tenant_id = trm.tenant_id
 AND lower(u.email) = lower(trm.email)
 AND u.deleted_at IS NULL
WHERE trm.role_type = 'LEGAL_TEAM'
  AND trm.active_flag = TRUE
  AND trm.deleted_at IS NULL
ON CONFLICT (tenant_id, department_id, user_id)
DO UPDATE SET
  is_active = TRUE,
  revoked_by = NULL,
  revoked_at = NULL,
  deleted_at = NULL,
  updated_at = NOW();

UPDATE public.team_role_mappings
SET active_flag = FALSE,
    deleted_at = COALESCE(deleted_at, NOW()),
    replaced_at = COALESCE(replaced_at, NOW())
WHERE role_type = 'LEGAL_TEAM'
  AND active_flag = TRUE
  AND deleted_at IS NULL;

ALTER TABLE public.team_role_mappings
  DROP CONSTRAINT IF EXISTS team_role_mappings_role_type_check;

ALTER TABLE public.team_role_mappings
  ADD CONSTRAINT team_role_mappings_role_type_check
  CHECK (role_type IN ('POC', 'HOD'));

DROP INDEX IF EXISTS public.idx_team_role_mappings_legal_lookup;

CREATE UNIQUE INDEX IF NOT EXISTS idx_team_role_mappings_active_primary_role_unique
  ON public.team_role_mappings (tenant_id, team_id, role_type)
  WHERE active_flag = TRUE AND deleted_at IS NULL AND role_type IN ('POC', 'HOD');
