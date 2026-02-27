-- Make legal matrix revocation atomic with role demotion + session invalidation.

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
  v_admin_legacy_role TEXT;
  v_requested UUID[] := COALESCE(p_legal_user_ids, ARRAY[]::UUID[]);
  v_removed_user_ids UUID[] := ARRAY[]::UUID[];
  v_removed_user_id UUID;
  v_user_current_role TEXT;
  v_user_next_role TEXT;
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

  SELECT u.email, u.role
    INTO v_admin_email, v_admin_legacy_role
  FROM public.users u
  WHERE u.id = p_admin_user_id
    AND u.tenant_id = p_tenant_id
    AND u.is_active = TRUE
    AND u.deleted_at IS NULL;

  IF v_admin_email IS NULL THEN
    RAISE EXCEPTION 'Admin user not found in tenant context';
  END IF;

  v_admin_role := public.resolve_user_effective_role(p_tenant_id, p_admin_user_id, v_admin_legacy_role);

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
      AND (
        EXISTS (
          SELECT 1
          FROM public.user_roles ur
          JOIN public.roles r
            ON r.id = ur.role_id
           AND r.tenant_id = ur.tenant_id
          WHERE ur.tenant_id = u.tenant_id
            AND ur.user_id = u.id
            AND ur.is_active = TRUE
            AND ur.deleted_at IS NULL
            AND r.is_active = TRUE
            AND r.deleted_at IS NULL
            AND UPPER(r.role_key) IN ('LEGAL_TEAM', 'LEGAL_ADMIN', 'SUPER_ADMIN')
        )
        OR UPPER(COALESCE(u.role, '')) IN ('LEGAL_TEAM', 'LEGAL_ADMIN', 'SUPER_ADMIN')
      );

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

  SELECT COALESCE(array_agg(a.user_id ORDER BY a.user_id), ARRAY[]::UUID[])
    INTO v_removed_user_ids
  FROM public.department_legal_assignments a
  WHERE a.tenant_id = p_tenant_id
    AND a.department_id = p_team_id
    AND a.is_active = TRUE
    AND a.deleted_at IS NULL
    AND NOT (a.user_id = ANY(v_requested));

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

  FOREACH v_removed_user_id IN ARRAY v_removed_user_ids LOOP
    IF EXISTS (
      SELECT 1
      FROM public.department_legal_assignments a
      WHERE a.tenant_id = p_tenant_id
        AND a.user_id = v_removed_user_id
        AND a.is_active = TRUE
        AND a.deleted_at IS NULL
    ) THEN
      CONTINUE;
    END IF;

    UPDATE public.user_roles ur
    SET is_active = FALSE,
        revoked_by = p_admin_user_id,
        revoked_at = NOW(),
        deleted_at = NOW()
    FROM public.roles r
    WHERE ur.tenant_id = p_tenant_id
      AND ur.user_id = v_removed_user_id
      AND ur.role_id = r.id
      AND r.tenant_id = ur.tenant_id
      AND ur.is_active = TRUE
      AND ur.deleted_at IS NULL
      AND r.is_active = TRUE
      AND r.deleted_at IS NULL
      AND UPPER(r.role_key) = 'LEGAL_TEAM';

    SELECT u.role
      INTO v_user_current_role
    FROM public.users u
    WHERE u.tenant_id = p_tenant_id
      AND u.id = v_removed_user_id
      AND u.is_active = TRUE
      AND u.deleted_at IS NULL;

    IF v_user_current_role IS NULL THEN
      CONTINUE;
    END IF;

    v_user_next_role := public.resolve_user_effective_role(p_tenant_id, v_removed_user_id, v_user_current_role);

    IF UPPER(COALESCE(v_user_next_role, '')) = 'LEGAL_TEAM' THEN
      v_user_next_role := 'USER';
    END IF;

    UPDATE public.users u
    SET role = COALESCE(NULLIF(TRIM(v_user_next_role), ''), 'USER'),
        token_version = COALESCE(u.token_version, 0) + 1,
        updated_at = NOW()
    WHERE u.id = v_removed_user_id
      AND u.tenant_id = p_tenant_id
      AND u.deleted_at IS NULL;
  END LOOP;

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
    jsonb_build_object(
      'reason', NULLIF(TRIM(COALESCE(p_reason, '')), ''),
      'revoked_user_ids', to_jsonb(v_removed_user_ids)
    ),
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

REVOKE ALL ON FUNCTION public.admin_set_department_legal_matrix(UUID, UUID, UUID, UUID[], TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_set_department_legal_matrix(UUID, UUID, UUID, UUID[], TEXT) TO service_role;
