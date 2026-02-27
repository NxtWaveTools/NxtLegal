CREATE OR REPLACE FUNCTION public.admin_replace_team_role_email(
  p_tenant_id UUID,
  p_admin_user_id UUID,
  p_team_id UUID,
  p_role_type TEXT,
  p_new_email TEXT,
  p_new_name TEXT,
  p_reason TEXT DEFAULT NULL
)
RETURNS TABLE (
  team_id UUID,
  role_type TEXT,
  previous_email TEXT,
  next_email TEXT,
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
  v_role_type TEXT := UPPER(TRIM(COALESCE(p_role_type, '')));
  v_normalized_new_email TEXT := lower(trim(COALESCE(p_new_email, '')));
  v_normalized_new_name TEXT := NULLIF(TRIM(COALESCE(p_new_name, '')), '');
  v_previous_email TEXT;
  v_previous_name TEXT;
  v_other_role TEXT;
  v_other_role_email TEXT;
  v_before JSONB;
  v_after JSONB;
  v_previous_user_id UUID;
  v_new_user_id UUID;
  v_affected_contracts BIGINT := 0;
  v_affected_pending_approvers BIGINT := 0;
BEGIN
  IF p_tenant_id IS NULL OR p_admin_user_id IS NULL OR p_team_id IS NULL THEN
    RAISE EXCEPTION 'Tenant, admin user, and team are required';
  END IF;

  IF v_role_type NOT IN ('POC', 'HOD') THEN
    RAISE EXCEPTION 'Role type must be POC or HOD';
  END IF;

  IF v_normalized_new_email = '' THEN
    RAISE EXCEPTION 'New email is required';
  END IF;

  IF v_normalized_new_name IS NULL OR char_length(v_normalized_new_name) < 2 THEN
    RAISE EXCEPTION 'New name is required';
  END IF;

  IF v_normalized_new_email !~ '^[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}$' THEN
    RAISE EXCEPTION 'Invalid email format';
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
    FROM public.teams t
    WHERE t.id = p_team_id
      AND t.tenant_id = p_tenant_id
      AND t.deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Department not found in tenant context';
  END IF;

  SELECT
    trm.email,
    CASE WHEN v_role_type = 'POC' THEN t.poc_name ELSE t.hod_name END
    INTO v_previous_email, v_previous_name
  FROM public.team_role_mappings trm
  JOIN public.teams t
    ON t.id = trm.team_id
   AND t.tenant_id = trm.tenant_id
  WHERE trm.tenant_id = p_tenant_id
    AND trm.team_id = p_team_id
    AND trm.role_type = v_role_type
    AND trm.active_flag = TRUE
    AND trm.deleted_at IS NULL
    AND t.deleted_at IS NULL
  LIMIT 1;

  IF v_previous_email IS NULL THEN
    RAISE EXCEPTION 'Cannot remove primary role without assigning replacement';
  END IF;

  v_other_role := CASE WHEN v_role_type = 'POC' THEN 'HOD' ELSE 'POC' END;

  SELECT trm.email
    INTO v_other_role_email
  FROM public.team_role_mappings trm
  WHERE trm.tenant_id = p_tenant_id
    AND trm.team_id = p_team_id
    AND trm.role_type = v_other_role
    AND trm.active_flag = TRUE
    AND trm.deleted_at IS NULL
  LIMIT 1;

  IF v_other_role_email IS NOT NULL AND v_other_role_email = v_normalized_new_email THEN
    RAISE EXCEPTION 'POC and HOD emails must be different';
  END IF;

  SELECT u.id
    INTO v_previous_user_id
  FROM public.users u
  WHERE u.tenant_id = p_tenant_id
    AND u.email = v_previous_email
    AND u.is_active = TRUE
    AND u.deleted_at IS NULL
  LIMIT 1;

  SELECT u.id
    INTO v_new_user_id
  FROM public.users u
  WHERE u.tenant_id = p_tenant_id
    AND u.email = v_normalized_new_email
    AND u.is_active = TRUE
    AND u.deleted_at IS NULL
  LIMIT 1;

  IF v_previous_user_id IS NOT NULL AND v_new_user_id IS NULL THEN
    RAISE EXCEPTION 'Replacement user account must exist and be active for ownership transfer';
  END IF;

  v_before := jsonb_build_object(
    'role_type', v_role_type,
    'old_email', v_previous_email,
    'new_email', v_normalized_new_email,
    'old_name', v_previous_name,
    'new_name', v_normalized_new_name,
    'old_user_id', v_previous_user_id,
    'new_user_id', v_new_user_id
  );

  UPDATE public.team_role_mappings trm
  SET active_flag = FALSE,
      replaced_by = p_admin_user_id,
      replaced_at = NOW(),
      updated_at = NOW()
  WHERE trm.tenant_id = p_tenant_id
    AND trm.team_id = p_team_id
    AND trm.role_type = v_role_type
    AND trm.active_flag = TRUE
    AND trm.deleted_at IS NULL;

  INSERT INTO public.team_role_mappings (
    tenant_id,
    team_id,
    email,
    role_type,
    active_flag,
    assigned_by,
    assigned_at,
    replaced_by,
    replaced_at,
    deleted_at
  ) VALUES (
    p_tenant_id,
    p_team_id,
    v_normalized_new_email,
    v_role_type,
    TRUE,
    p_admin_user_id,
    NOW(),
    NULL,
    NULL,
    NULL
  )
  ON CONFLICT ON CONSTRAINT team_role_mappings_tenant_team_email_role_unique
  DO UPDATE SET
    active_flag = TRUE,
    assigned_by = p_admin_user_id,
    assigned_at = NOW(),
    replaced_by = NULL,
    replaced_at = NULL,
    deleted_at = NULL,
    updated_at = NOW();

  UPDATE public.teams t
  SET poc_email = CASE WHEN v_role_type = 'POC' THEN v_normalized_new_email ELSE t.poc_email END,
      hod_email = CASE WHEN v_role_type = 'HOD' THEN v_normalized_new_email ELSE t.hod_email END,
      poc_name = CASE WHEN v_role_type = 'POC' THEN v_normalized_new_name ELSE t.poc_name END,
      hod_name = CASE WHEN v_role_type = 'HOD' THEN v_normalized_new_name ELSE t.hod_name END,
      updated_at = NOW()
  WHERE t.id = p_team_id
    AND t.tenant_id = p_tenant_id;

  IF v_new_user_id IS NOT NULL THEN
    UPDATE public.users u
    SET full_name = v_normalized_new_name,
        updated_at = NOW()
    WHERE u.id = v_new_user_id
      AND u.tenant_id = p_tenant_id
      AND u.deleted_at IS NULL
      AND (u.full_name IS DISTINCT FROM v_normalized_new_name);
  END IF;

  IF v_previous_user_id IS NOT NULL AND v_new_user_id IS NOT NULL THEN
    IF v_role_type = 'POC' THEN
      UPDATE public.contracts c
      SET uploaded_by_employee_id = v_new_user_id::TEXT,
          uploaded_by_email = v_normalized_new_email,
          updated_at = NOW()
      WHERE c.tenant_id = p_tenant_id
        AND c.deleted_at IS NULL
        AND c.uploaded_by_employee_id = v_previous_user_id::TEXT;

      GET DIAGNOSTICS v_affected_contracts = ROW_COUNT;
    ELSE
      UPDATE public.contracts c
      SET current_assignee_employee_id = v_new_user_id::TEXT,
          current_assignee_email = v_normalized_new_email,
          updated_at = NOW()
      WHERE c.tenant_id = p_tenant_id
        AND c.deleted_at IS NULL
        AND c.status = 'HOD_PENDING'
        AND c.current_assignee_employee_id = v_previous_user_id::TEXT;

      GET DIAGNOSTICS v_affected_contracts = ROW_COUNT;
    END IF;

    UPDATE public.contract_additional_approvers caa
    SET approver_employee_id = v_new_user_id::TEXT,
        approver_email = v_normalized_new_email,
        updated_at = NOW()
    WHERE caa.tenant_id = p_tenant_id
      AND caa.deleted_at IS NULL
      AND caa.status = 'PENDING'
      AND caa.approver_employee_id = v_previous_user_id::TEXT;

    GET DIAGNOSTICS v_affected_pending_approvers = ROW_COUNT;

    UPDATE public.users u
    SET token_version = COALESCE(u.token_version, 0) + 1,
        updated_at = NOW()
    WHERE u.id = v_previous_user_id
      AND u.tenant_id = p_tenant_id
      AND u.deleted_at IS NULL;
  END IF;

  v_after := jsonb_build_object(
    'role_type', v_role_type,
    'old_email', v_previous_email,
    'new_email', v_normalized_new_email,
    'old_name', v_previous_name,
    'new_name', v_normalized_new_name,
    'old_user_id', v_previous_user_id,
    'new_user_id', v_new_user_id,
    'affected_contracts', v_affected_contracts,
    'affected_pending_approvers', v_affected_pending_approvers,
    'old_user_sessions_revoked', (v_previous_user_id IS NOT NULL AND v_new_user_id IS NOT NULL)
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
    CASE WHEN v_role_type = 'POC' THEN 'team.poc.replaced' ELSE 'team.hod.replaced' END,
    'team_role_mappings',
    p_team_id::TEXT,
    jsonb_build_object('before_state_snapshot', v_before, 'after_state_snapshot', v_after),
    jsonb_build_object(
      'reason', NULLIF(TRIM(COALESCE(p_reason, '')), ''),
      'role_type', v_role_type,
      'affected_contracts', v_affected_contracts,
      'affected_pending_approvers', v_affected_pending_approvers,
      'revoked_user_id', v_previous_user_id
    ),
    v_admin_email,
    v_admin_role,
    v_normalized_new_email
  );

  RETURN QUERY
  SELECT p_team_id, v_role_type, v_previous_email, v_normalized_new_email, v_before, v_after;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_replace_team_role_email(UUID, UUID, UUID, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_replace_team_role_email(UUID, UUID, UUID, TEXT, TEXT, TEXT, TEXT) TO service_role;
