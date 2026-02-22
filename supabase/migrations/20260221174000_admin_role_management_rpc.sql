-- Admin role management RPC
-- Atomic role grant/revoke with token version bump and immutable audit entries.

CREATE OR REPLACE FUNCTION public.admin_change_user_role(
  p_tenant_id UUID,
  p_admin_user_id UUID,
  p_target_user_id UUID,
  p_role_key TEXT,
  p_operation TEXT,
  p_reason TEXT DEFAULT NULL
)
RETURNS TABLE (
  changed BOOLEAN,
  operation TEXT,
  role_key TEXT,
  target_user_id UUID,
  target_email TEXT,
  before_state_snapshot JSONB,
  after_state_snapshot JSONB,
  old_token_version INTEGER,
  new_token_version INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_role_id UUID;
  v_role_key TEXT;
  v_target_email TEXT;
  v_before_roles JSONB := '[]'::JSONB;
  v_after_roles JSONB := '[]'::JSONB;
  v_old_token_version INTEGER := 0;
  v_new_token_version INTEGER := 0;
  v_changed BOOLEAN := FALSE;
  v_row_count BIGINT := 0;
  v_operation TEXT := UPPER(TRIM(COALESCE(p_operation, '')));
  v_before_snapshot JSONB;
  v_after_snapshot JSONB;
BEGIN
  IF p_tenant_id IS NULL OR p_admin_user_id IS NULL OR p_target_user_id IS NULL THEN
    RAISE EXCEPTION 'Tenant, admin user, and target user are required';
  END IF;

  IF p_role_key IS NULL OR btrim(p_role_key) = '' THEN
    RAISE EXCEPTION 'Role key is required';
  END IF;

  IF v_operation NOT IN ('GRANT', 'REVOKE') THEN
    RAISE EXCEPTION 'Operation must be GRANT or REVOKE';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.users admin_user
    WHERE admin_user.id = p_admin_user_id
      AND admin_user.tenant_id = p_tenant_id
      AND admin_user.is_active = TRUE
      AND admin_user.deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Admin user not found in tenant context';
  END IF;

  SELECT u.email, COALESCE(u.token_version, 0)
    INTO v_target_email, v_old_token_version
  FROM public.users u
  WHERE u.id = p_target_user_id
    AND u.tenant_id = p_tenant_id
    AND u.is_active = TRUE
    AND u.deleted_at IS NULL;

  IF v_target_email IS NULL THEN
    RAISE EXCEPTION 'Target user not found in tenant context';
  END IF;

  SELECT r.id, r.role_key
    INTO v_role_id, v_role_key
  FROM public.roles r
  WHERE r.tenant_id = p_tenant_id
    AND r.role_key = UPPER(TRIM(p_role_key))
    AND r.is_active = TRUE
    AND r.deleted_at IS NULL
  LIMIT 1;

  IF v_role_id IS NULL THEN
    RAISE EXCEPTION 'Role key % not found for tenant', UPPER(TRIM(p_role_key));
  END IF;

  SELECT COALESCE(jsonb_agg(DISTINCT r.role_key ORDER BY r.role_key), '[]'::JSONB)
    INTO v_before_roles
  FROM public.user_roles ur
  JOIN public.roles r
    ON r.id = ur.role_id
   AND r.tenant_id = ur.tenant_id
  WHERE ur.tenant_id = p_tenant_id
    AND ur.user_id = p_target_user_id
    AND ur.is_active = TRUE
    AND ur.deleted_at IS NULL
    AND r.deleted_at IS NULL
    AND r.is_active = TRUE;

  v_before_snapshot := jsonb_build_object(
    'role_keys', v_before_roles,
    'token_version', v_old_token_version
  );

  IF v_operation = 'GRANT' THEN
    IF NOT EXISTS (
      SELECT 1
      FROM public.user_roles ur
      WHERE ur.tenant_id = p_tenant_id
        AND ur.user_id = p_target_user_id
        AND ur.role_id = v_role_id
        AND ur.is_active = TRUE
        AND ur.deleted_at IS NULL
    ) THEN
      INSERT INTO public.user_roles (
        tenant_id,
        user_id,
        role_id,
        is_active,
        assigned_by,
        assigned_at,
        revoked_by,
        revoked_at,
        deleted_at
      ) VALUES (
        p_tenant_id,
        p_target_user_id,
        v_role_id,
        TRUE,
        p_admin_user_id,
        NOW(),
        NULL,
        NULL,
        NULL
      );

      v_changed := TRUE;
    END IF;
  ELSE
    UPDATE public.user_roles ur
    SET
      is_active = FALSE,
      revoked_by = p_admin_user_id,
      revoked_at = NOW(),
      deleted_at = NOW()
    WHERE ur.tenant_id = p_tenant_id
      AND ur.user_id = p_target_user_id
      AND ur.role_id = v_role_id
      AND ur.is_active = TRUE
      AND ur.deleted_at IS NULL;

    GET DIAGNOSTICS v_row_count = ROW_COUNT;
    v_changed := v_row_count > 0;
  END IF;

  IF v_changed THEN
    UPDATE public.users u
    SET
      token_version = COALESCE(u.token_version, 0) + 1,
      updated_at = NOW()
    WHERE u.id = p_target_user_id
      AND u.tenant_id = p_tenant_id
    RETURNING token_version INTO v_new_token_version;
  ELSE
    v_new_token_version := v_old_token_version;
  END IF;

  SELECT COALESCE(jsonb_agg(DISTINCT r.role_key ORDER BY r.role_key), '[]'::JSONB)
    INTO v_after_roles
  FROM public.user_roles ur
  JOIN public.roles r
    ON r.id = ur.role_id
   AND r.tenant_id = ur.tenant_id
  WHERE ur.tenant_id = p_tenant_id
    AND ur.user_id = p_target_user_id
    AND ur.is_active = TRUE
    AND ur.deleted_at IS NULL
    AND r.deleted_at IS NULL
    AND r.is_active = TRUE;

  v_after_snapshot := jsonb_build_object(
    'role_keys', v_after_roles,
    'token_version', v_new_token_version
  );

  IF v_changed THEN
    INSERT INTO public.audit_logs (
      tenant_id,
      user_id,
      action,
      resource_type,
      resource_id,
      changes,
      metadata,
      actor_email,
      actor_role,
      target_email
    ) VALUES (
      p_tenant_id,
      p_admin_user_id::TEXT,
      CASE WHEN v_operation = 'GRANT' THEN 'role.assigned' ELSE 'role.revoked' END,
      'user_role',
      p_target_user_id::TEXT,
      jsonb_build_object(
        'before_state_snapshot', v_before_snapshot,
        'after_state_snapshot', v_after_snapshot
      ),
      jsonb_build_object(
        'timestamp', NOW(),
        'admin_user_id', p_admin_user_id::TEXT,
        'action_type', CASE WHEN v_operation = 'GRANT' THEN 'role_assignment' ELSE 'role_revocation' END,
        'affected_user_id', p_target_user_id::TEXT,
        'affected_department_id', NULL,
        'role_key', v_role_key,
        'operation', lower(v_operation),
        'reason', NULLIF(TRIM(COALESCE(p_reason, '')), '')
      ),
      NULL,
      NULL,
      v_target_email
    );

    INSERT INTO public.audit_logs (
      tenant_id,
      user_id,
      action,
      resource_type,
      resource_id,
      changes,
      metadata,
      actor_email,
      actor_role,
      target_email
    ) VALUES (
      p_tenant_id,
      p_admin_user_id::TEXT,
      'session.revoked',
      'auth_session',
      p_target_user_id::TEXT,
      jsonb_build_object(
        'before_state_snapshot', jsonb_build_object('token_version', v_old_token_version),
        'after_state_snapshot', jsonb_build_object('token_version', v_new_token_version)
      ),
      jsonb_build_object(
        'timestamp', NOW(),
        'admin_user_id', p_admin_user_id::TEXT,
        'action_type', 'session_revocation',
        'affected_user_id', p_target_user_id::TEXT,
        'affected_department_id', NULL,
        'reason', 'permission_change'
      ),
      NULL,
      NULL,
      v_target_email
    );
  END IF;

  RETURN QUERY
  SELECT
    v_changed,
    lower(v_operation),
    v_role_key,
    p_target_user_id,
    v_target_email,
    v_before_snapshot,
    v_after_snapshot,
    v_old_token_version,
    v_new_token_version;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_change_user_role(UUID, UUID, UUID, TEXT, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_change_user_role(UUID, UUID, UUID, TEXT, TEXT, TEXT) TO service_role;
