-- Team governance: department lifecycle + primary assignment + legal matrix (additive)

ALTER TABLE public.teams
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE;

CREATE TABLE IF NOT EXISTS public.department_legal_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  department_id UUID NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  assigned_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  revoked_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'department_legal_assignments_tenant_department_user_unique'
      AND conrelid = 'public.department_legal_assignments'::regclass
  ) THEN
    ALTER TABLE public.department_legal_assignments
      ADD CONSTRAINT department_legal_assignments_tenant_department_user_unique
      UNIQUE (tenant_id, department_id, user_id);
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS idx_department_legal_assignments_active_unique
  ON public.department_legal_assignments (tenant_id, department_id, user_id)
  WHERE is_active = TRUE AND deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_department_legal_assignments_tenant_department
  ON public.department_legal_assignments (tenant_id, department_id)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_department_legal_assignments_tenant_user
  ON public.department_legal_assignments (tenant_id, user_id)
  WHERE deleted_at IS NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.triggers
    WHERE event_object_schema = 'public'
      AND event_object_table = 'department_legal_assignments'
      AND trigger_name = 'update_department_legal_assignments_updated_at'
  ) THEN
    CREATE TRIGGER update_department_legal_assignments_updated_at
      BEFORE UPDATE ON public.department_legal_assignments
      FOR EACH ROW
      EXECUTE FUNCTION public.update_updated_at_column();
  END IF;
END $$;

ALTER TABLE public.department_legal_assignments ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'department_legal_assignments'
      AND policyname = 'department_legal_assignments_tenant_isolation'
  ) THEN
    CREATE POLICY "department_legal_assignments_tenant_isolation" ON public.department_legal_assignments
      FOR ALL
      USING (tenant_id = (auth.jwt() ->> 'tenant_id')::UUID)
      WITH CHECK (tenant_id = (auth.jwt() ->> 'tenant_id')::UUID);
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.admin_create_department(
  p_tenant_id UUID,
  p_admin_user_id UUID,
  p_department_name TEXT,
  p_reason TEXT DEFAULT NULL
)
RETURNS TABLE (
  team_id UUID,
  department_name TEXT,
  is_active BOOLEAN,
  before_state_snapshot JSONB,
  after_state_snapshot JSONB
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_team_id UUID;
  v_before JSONB := jsonb_build_object('department', NULL);
  v_after JSONB;
  v_admin_email TEXT;
  v_admin_role TEXT;
BEGIN
  IF p_tenant_id IS NULL OR p_admin_user_id IS NULL THEN
    RAISE EXCEPTION 'Tenant and admin user are required';
  END IF;

  IF p_department_name IS NULL OR btrim(p_department_name) = '' THEN
    RAISE EXCEPTION 'Department name is required';
  END IF;

  SELECT email, role
    INTO v_admin_email, v_admin_role
  FROM public.users
  WHERE id = p_admin_user_id
    AND tenant_id = p_tenant_id
    AND is_active = TRUE
    AND deleted_at IS NULL;

  IF v_admin_email IS NULL THEN
    RAISE EXCEPTION 'Admin user not found in tenant context';
  END IF;

  INSERT INTO public.teams (tenant_id, name, is_active, deleted_at)
  VALUES (p_tenant_id, btrim(p_department_name), TRUE, NULL)
  RETURNING id INTO v_team_id;

  v_after := jsonb_build_object(
    'department', jsonb_build_object('id', v_team_id, 'name', btrim(p_department_name), 'is_active', TRUE)
  );

  INSERT INTO public.audit_logs (
    tenant_id, user_id, action, resource_type, resource_id, changes, metadata, actor_email, actor_role
  ) VALUES (
    p_tenant_id,
    p_admin_user_id::TEXT,
    'team.created',
    'team',
    v_team_id::TEXT,
    jsonb_build_object('before_state_snapshot', v_before, 'after_state_snapshot', v_after),
    jsonb_build_object('reason', NULLIF(TRIM(COALESCE(p_reason, '')), ''), 'department_name', btrim(p_department_name)),
    v_admin_email,
    v_admin_role
  );

  RETURN QUERY
  SELECT v_team_id, btrim(p_department_name), TRUE, v_before, v_after;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_update_department(
  p_tenant_id UUID,
  p_admin_user_id UUID,
  p_team_id UUID,
  p_operation TEXT,
  p_department_name TEXT DEFAULT NULL,
  p_reason TEXT DEFAULT NULL
)
RETURNS TABLE (
  team_id UUID,
  department_name TEXT,
  is_active BOOLEAN,
  before_state_snapshot JSONB,
  after_state_snapshot JSONB
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_admin_email TEXT;
  v_admin_role TEXT;
  v_before_name TEXT;
  v_before_active BOOLEAN;
  v_after_name TEXT;
  v_after_active BOOLEAN;
  v_operation TEXT := UPPER(TRIM(COALESCE(p_operation, '')));
  v_before JSONB;
  v_after JSONB;
BEGIN
  IF p_tenant_id IS NULL OR p_admin_user_id IS NULL OR p_team_id IS NULL THEN
    RAISE EXCEPTION 'Tenant, admin user, and department are required';
  END IF;

  IF v_operation NOT IN ('RENAME', 'DEACTIVATE') THEN
    RAISE EXCEPTION 'Operation must be RENAME or DEACTIVATE';
  END IF;

  SELECT email, role
    INTO v_admin_email, v_admin_role
  FROM public.users
  WHERE id = p_admin_user_id
    AND tenant_id = p_tenant_id
    AND is_active = TRUE
    AND deleted_at IS NULL;

  IF v_admin_email IS NULL THEN
    RAISE EXCEPTION 'Admin user not found in tenant context';
  END IF;

  SELECT name, is_active
    INTO v_before_name, v_before_active
  FROM public.teams
  WHERE id = p_team_id
    AND tenant_id = p_tenant_id
    AND deleted_at IS NULL;

  IF v_before_name IS NULL THEN
    RAISE EXCEPTION 'Department not found in tenant context';
  END IF;

  v_before := jsonb_build_object(
    'department', jsonb_build_object('id', p_team_id, 'name', v_before_name, 'is_active', v_before_active)
  );

  IF v_operation = 'RENAME' THEN
    IF p_department_name IS NULL OR btrim(p_department_name) = '' THEN
      RAISE EXCEPTION 'Department name is required for rename';
    END IF;

    UPDATE public.teams
    SET name = btrim(p_department_name),
        updated_at = NOW()
    WHERE id = p_team_id
      AND tenant_id = p_tenant_id;

    v_after_name := btrim(p_department_name);
    v_after_active := v_before_active;
  ELSE
    UPDATE public.teams
    SET is_active = FALSE,
        deleted_at = COALESCE(deleted_at, NOW()),
        updated_at = NOW()
    WHERE id = p_team_id
      AND tenant_id = p_tenant_id;

    v_after_name := v_before_name;
    v_after_active := FALSE;

    UPDATE public.department_legal_assignments
    SET is_active = FALSE,
        revoked_by = p_admin_user_id,
        revoked_at = NOW(),
        deleted_at = COALESCE(deleted_at, NOW()),
        updated_at = NOW()
    WHERE tenant_id = p_tenant_id
      AND department_id = p_team_id
      AND is_active = TRUE
      AND deleted_at IS NULL;
  END IF;

  v_after := jsonb_build_object(
    'department', jsonb_build_object('id', p_team_id, 'name', v_after_name, 'is_active', v_after_active)
  );

  INSERT INTO public.audit_logs (
    tenant_id, user_id, action, resource_type, resource_id, changes, metadata, actor_email, actor_role
  ) VALUES (
    p_tenant_id,
    p_admin_user_id::TEXT,
    CASE WHEN v_operation = 'RENAME' THEN 'team.renamed' ELSE 'team.deactivated' END,
    'team',
    p_team_id::TEXT,
    jsonb_build_object('before_state_snapshot', v_before, 'after_state_snapshot', v_after),
    jsonb_build_object('reason', NULLIF(TRIM(COALESCE(p_reason, '')), ''), 'operation', lower(v_operation)),
    v_admin_email,
    v_admin_role
  );

  RETURN QUERY
  SELECT p_team_id, v_after_name, v_after_active, v_before, v_after;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_assign_primary_team_role(
  p_tenant_id UUID,
  p_admin_user_id UUID,
  p_team_id UUID,
  p_new_user_id UUID,
  p_role_type TEXT,
  p_reason TEXT DEFAULT NULL
)
RETURNS TABLE (
  team_id UUID,
  role_type TEXT,
  previous_user_id UUID,
  next_user_id UUID,
  affected_contracts BIGINT,
  before_state_snapshot JSONB,
  after_state_snapshot JSONB
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_role_type TEXT := UPPER(TRIM(COALESCE(p_role_type, '')));
  v_admin_email TEXT;
  v_admin_role TEXT;
  v_prev_user_id UUID;
  v_prev_email TEXT;
  v_next_email TEXT;
  v_before JSONB;
  v_after JSONB;
  v_affected BIGINT := 0;
BEGIN
  IF p_tenant_id IS NULL OR p_admin_user_id IS NULL OR p_team_id IS NULL OR p_new_user_id IS NULL THEN
    RAISE EXCEPTION 'Tenant, admin user, team, and new user are required';
  END IF;

  IF v_role_type NOT IN ('POC', 'HOD') THEN
    RAISE EXCEPTION 'Role type must be POC or HOD';
  END IF;

  SELECT email, role
    INTO v_admin_email, v_admin_role
  FROM public.users
  WHERE id = p_admin_user_id
    AND tenant_id = p_tenant_id
    AND is_active = TRUE
    AND deleted_at IS NULL;

  IF v_admin_email IS NULL THEN
    RAISE EXCEPTION 'Admin user not found in tenant context';
  END IF;

  SELECT tm.user_id, u.email
    INTO v_prev_user_id, v_prev_email
  FROM public.team_members tm
  LEFT JOIN public.users u
    ON u.id = tm.user_id
   AND u.tenant_id = tm.tenant_id
  WHERE tm.tenant_id = p_tenant_id
    AND tm.team_id = p_team_id
    AND tm.role_type = v_role_type
    AND tm.is_primary = TRUE
  LIMIT 1;

  SELECT email INTO v_next_email
  FROM public.users
  WHERE id = p_new_user_id
    AND tenant_id = p_tenant_id
    AND is_active = TRUE
    AND deleted_at IS NULL;

  IF v_next_email IS NULL THEN
    RAISE EXCEPTION 'New assignee must be an active tenant user';
  END IF;

  v_before := jsonb_build_object(
    'role_type', v_role_type,
    'team_id', p_team_id,
    'user_id', v_prev_user_id,
    'user_email', v_prev_email
  );

  PERFORM *
  FROM public.replace_primary_team_member(
    p_tenant_id,
    p_team_id,
    p_new_user_id,
    v_role_type,
    p_admin_user_id::TEXT,
    v_admin_email,
    v_admin_role
  );

  IF v_role_type = 'POC' THEN
    SELECT COUNT(*)::BIGINT
      INTO v_affected
    FROM public.contracts c
    WHERE c.tenant_id = p_tenant_id
      AND c.deleted_at IS NULL
      AND c.uploaded_by_employee_id = p_new_user_id::TEXT;
  ELSE
    SELECT COUNT(*)::BIGINT
      INTO v_affected
    FROM public.contracts c
    WHERE c.tenant_id = p_tenant_id
      AND c.deleted_at IS NULL
      AND c.status = 'HOD_PENDING'
      AND c.current_assignee_employee_id = p_new_user_id::TEXT;
  END IF;

  v_after := jsonb_build_object(
    'role_type', v_role_type,
    'team_id', p_team_id,
    'user_id', p_new_user_id,
    'user_email', v_next_email,
    'affected_contracts', v_affected
  );

  INSERT INTO public.audit_logs (
    tenant_id, user_id, action, resource_type, resource_id, changes, metadata, actor_email, actor_role, target_email
  ) VALUES (
    p_tenant_id,
    p_admin_user_id::TEXT,
    'team.primary_role.updated',
    'team_member',
    p_team_id::TEXT,
    jsonb_build_object('before_state_snapshot', v_before, 'after_state_snapshot', v_after),
    jsonb_build_object('reason', NULLIF(TRIM(COALESCE(p_reason, '')), ''), 'role_type', v_role_type),
    v_admin_email,
    v_admin_role,
    v_next_email
  );

  RETURN QUERY
  SELECT p_team_id, v_role_type, v_prev_user_id, p_new_user_id, v_affected, v_before, v_after;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_set_department_legal_matrix(
  p_tenant_id UUID,
  p_admin_user_id UUID,
  p_team_id UUID,
  p_legal_user_ids UUID[],
  p_reason TEXT DEFAULT NULL
)
RETURNS TABLE (
  team_id UUID,
  active_legal_user_ids UUID[],
  before_state_snapshot JSONB,
  after_state_snapshot JSONB
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_admin_email TEXT;
  v_admin_role TEXT;
  v_requested UUID[] := COALESCE(p_legal_user_ids, ARRAY[]::UUID[]);
  v_before_users JSONB := '[]'::JSONB;
  v_after_users JSONB := '[]'::JSONB;
  v_before JSONB;
  v_after JSONB;
  v_valid_count INTEGER := 0;
  v_requested_count INTEGER := 0;
BEGIN
  IF p_tenant_id IS NULL OR p_admin_user_id IS NULL OR p_team_id IS NULL THEN
    RAISE EXCEPTION 'Tenant, admin user, and team are required';
  END IF;

  SELECT email, role
    INTO v_admin_email, v_admin_role
  FROM public.users
  WHERE id = p_admin_user_id
    AND tenant_id = p_tenant_id
    AND is_active = TRUE
    AND deleted_at IS NULL;

  IF v_admin_email IS NULL THEN
    RAISE EXCEPTION 'Admin user not found in tenant context';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.teams
    WHERE id = p_team_id
      AND tenant_id = p_tenant_id
      AND deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Department not found in tenant context';
  END IF;

  SELECT COUNT(*)::INTEGER INTO v_requested_count
  FROM unnest(v_requested);

  IF v_requested_count > 0 THEN
    SELECT COUNT(*)::INTEGER
      INTO v_valid_count
    FROM public.users u
    WHERE u.tenant_id = p_tenant_id
      AND u.id = ANY(v_requested)
      AND u.is_active = TRUE
      AND u.deleted_at IS NULL
      AND UPPER(u.role) IN ('LEGAL_TEAM', 'LEGAL_ADMIN', 'SUPER_ADMIN');

    IF v_valid_count != v_requested_count THEN
      RAISE EXCEPTION 'All legal matrix users must be active legal-scope users in tenant context';
    END IF;
  END IF;

  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object('user_id', a.user_id, 'email', u.email)
      ORDER BY u.email
    ),
    '[]'::JSONB
  ) INTO v_before_users
  FROM public.department_legal_assignments a
  JOIN public.users u
    ON u.id = a.user_id
   AND u.tenant_id = a.tenant_id
  WHERE a.tenant_id = p_tenant_id
    AND a.department_id = p_team_id
    AND a.is_active = TRUE
    AND a.deleted_at IS NULL;

  v_before := jsonb_build_object('team_id', p_team_id, 'legal_assignments', v_before_users);

  UPDATE public.department_legal_assignments a
  SET is_active = FALSE,
      revoked_by = p_admin_user_id,
      revoked_at = NOW(),
      deleted_at = NOW(),
      updated_at = NOW()
  WHERE a.tenant_id = p_tenant_id
    AND a.department_id = p_team_id
    AND a.is_active = TRUE
    AND a.deleted_at IS NULL
    AND NOT (a.user_id = ANY(v_requested));

  IF v_requested_count > 0 THEN
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
      p_tenant_id,
      p_team_id,
      req.user_id,
      TRUE,
      p_admin_user_id,
      NOW(),
      NULL,
      NULL,
      NULL
    FROM unnest(v_requested) AS req(user_id)
    ON CONFLICT (tenant_id, department_id, user_id)
    DO UPDATE
      SET is_active = TRUE,
          assigned_by = EXCLUDED.assigned_by,
          assigned_at = NOW(),
          revoked_by = NULL,
          revoked_at = NULL,
          deleted_at = NULL,
          updated_at = NOW();
  END IF;

  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object('user_id', a.user_id, 'email', u.email)
      ORDER BY u.email
    ),
    '[]'::JSONB
  ) INTO v_after_users
  FROM public.department_legal_assignments a
  JOIN public.users u
    ON u.id = a.user_id
   AND u.tenant_id = a.tenant_id
  WHERE a.tenant_id = p_tenant_id
    AND a.department_id = p_team_id
    AND a.is_active = TRUE
    AND a.deleted_at IS NULL;

  v_after := jsonb_build_object('team_id', p_team_id, 'legal_assignments', v_after_users);

  INSERT INTO public.audit_logs (
    tenant_id, user_id, action, resource_type, resource_id, changes, metadata, actor_email, actor_role
  ) VALUES (
    p_tenant_id,
    p_admin_user_id::TEXT,
    'team.legal.matrix.updated',
    'department_legal_assignments',
    p_team_id::TEXT,
    jsonb_build_object('before_state_snapshot', v_before, 'after_state_snapshot', v_after),
    jsonb_build_object('reason', NULLIF(TRIM(COALESCE(p_reason, '')), '')),
    v_admin_email,
    v_admin_role
  );

  RETURN QUERY
  SELECT
    p_team_id,
    ARRAY(
      SELECT a.user_id
      FROM public.department_legal_assignments a
      WHERE a.tenant_id = p_tenant_id
        AND a.department_id = p_team_id
        AND a.is_active = TRUE
        AND a.deleted_at IS NULL
      ORDER BY a.user_id
    )::UUID[],
    v_before,
    v_after;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_create_department(UUID, UUID, TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_update_department(UUID, UUID, UUID, TEXT, TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_assign_primary_team_role(UUID, UUID, UUID, UUID, TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_set_department_legal_matrix(UUID, UUID, UUID, UUID[], TEXT) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.admin_create_department(UUID, UUID, TEXT, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_update_department(UUID, UUID, UUID, TEXT, TEXT, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_assign_primary_team_role(UUID, UUID, UUID, UUID, TEXT, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_set_department_legal_matrix(UUID, UUID, UUID, UUID[], TEXT) TO service_role;
