-- Canonicalize RPC role resolution to user_roles + roles with legacy users.role fallback

CREATE OR REPLACE FUNCTION public.resolve_user_effective_role(
  p_tenant_id UUID,
  p_user_id UUID,
  p_fallback_role TEXT DEFAULT NULL
)
RETURNS TEXT
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_role_key TEXT;
  v_legacy_role TEXT := UPPER(TRIM(COALESCE(p_fallback_role, '')));
BEGIN
  SELECT r.role_key
    INTO v_role_key
  FROM public.user_roles ur
  JOIN public.roles r
    ON r.id = ur.role_id
   AND r.tenant_id = ur.tenant_id
  WHERE ur.tenant_id = p_tenant_id
    AND ur.user_id = p_user_id
    AND ur.is_active = TRUE
    AND ur.deleted_at IS NULL
    AND r.is_active = TRUE
    AND r.deleted_at IS NULL
  ORDER BY CASE UPPER(r.role_key)
    WHEN 'SUPER_ADMIN' THEN 1
    WHEN 'LEGAL_ADMIN' THEN 2
    WHEN 'ADMIN' THEN 3
    WHEN 'LEGAL_TEAM' THEN 4
    WHEN 'HOD' THEN 5
    WHEN 'POC' THEN 6
    WHEN 'USER' THEN 7
    ELSE 99
  END,
  r.created_at ASC
  LIMIT 1;

  IF v_role_key IS NOT NULL AND TRIM(v_role_key) <> '' THEN
    RETURN UPPER(TRIM(v_role_key));
  END IF;

  IF v_legacy_role <> '' THEN
    RETURN v_legacy_role;
  END IF;

  RETURN 'USER';
END;
$$;

REVOKE ALL ON FUNCTION public.resolve_user_effective_role(UUID, UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.resolve_user_effective_role(UUID, UUID, TEXT) TO service_role;

CREATE OR REPLACE FUNCTION public.admin_create_department_with_emails(
  p_tenant_id UUID,
  p_admin_user_id UUID,
  p_department_name TEXT,
  p_poc_email TEXT,
  p_hod_email TEXT,
  p_reason TEXT DEFAULT NULL
)
RETURNS TABLE (
  team_id UUID,
  department_name TEXT,
  is_active BOOLEAN,
  poc_email TEXT,
  hod_email TEXT,
  before_state_snapshot JSONB,
  after_state_snapshot JSONB
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_team_id UUID;
  v_admin_email TEXT;
  v_admin_role TEXT;
  v_admin_legacy_role TEXT;
  v_normalized_poc_email TEXT := lower(trim(COALESCE(p_poc_email, '')));
  v_normalized_hod_email TEXT := lower(trim(COALESCE(p_hod_email, '')));
  v_before JSONB := jsonb_build_object('department', NULL, 'mappings', '[]'::jsonb);
  v_after JSONB;
BEGIN
  IF p_tenant_id IS NULL OR p_admin_user_id IS NULL THEN
    RAISE EXCEPTION 'Tenant and admin user are required';
  END IF;

  IF p_department_name IS NULL OR btrim(p_department_name) = '' THEN
    RAISE EXCEPTION 'Department name is required';
  END IF;

  IF v_normalized_poc_email = '' OR v_normalized_hod_email = '' THEN
    RAISE EXCEPTION 'POC and HOD email are required';
  END IF;

  IF v_normalized_poc_email !~ '^[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}$'
    OR v_normalized_hod_email !~ '^[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}$' THEN
    RAISE EXCEPTION 'Invalid email format';
  END IF;

  IF v_normalized_poc_email = v_normalized_hod_email THEN
    RAISE EXCEPTION 'POC and HOD emails must be different';
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

  INSERT INTO public.teams (tenant_id, name, poc_email, hod_email, is_active, deleted_at)
  VALUES (p_tenant_id, btrim(p_department_name), v_normalized_poc_email, v_normalized_hod_email, TRUE, NULL)
  RETURNING teams.id INTO v_team_id;

  INSERT INTO public.team_role_mappings (
    tenant_id,
    team_id,
    email,
    role_type,
    active_flag,
    assigned_by,
    assigned_at,
    deleted_at
  ) VALUES
    (p_tenant_id, v_team_id, v_normalized_poc_email, 'POC', TRUE, p_admin_user_id, NOW(), NULL),
    (p_tenant_id, v_team_id, v_normalized_hod_email, 'HOD', TRUE, p_admin_user_id, NOW(), NULL)
  ON CONFLICT ON CONSTRAINT team_role_mappings_tenant_team_email_role_unique
  DO UPDATE SET
    active_flag = TRUE,
    assigned_by = p_admin_user_id,
    assigned_at = NOW(),
    replaced_by = NULL,
    replaced_at = NULL,
    deleted_at = NULL,
    updated_at = NOW();

  v_after := jsonb_build_object(
    'department', jsonb_build_object(
      'id', v_team_id,
      'name', btrim(p_department_name),
      'is_active', TRUE,
      'poc_email', v_normalized_poc_email,
      'hod_email', v_normalized_hod_email
    ),
    'mappings', jsonb_build_array(
      jsonb_build_object('role_type', 'POC', 'email', v_normalized_poc_email),
      jsonb_build_object('role_type', 'HOD', 'email', v_normalized_hod_email)
    )
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
    actor_role
  ) VALUES
    (
      p_tenant_id,
      p_admin_user_id::TEXT,
      'team.created',
      'team',
      v_team_id::TEXT,
      jsonb_build_object('before_state_snapshot', v_before, 'after_state_snapshot', v_after),
      jsonb_build_object('reason', NULLIF(TRIM(COALESCE(p_reason, '')), ''), 'department_name', btrim(p_department_name)),
      v_admin_email,
      v_admin_role
    ),
    (
      p_tenant_id,
      p_admin_user_id::TEXT,
      'team.poc.assigned',
      'team_role_mappings',
      v_team_id::TEXT,
      jsonb_build_object('old_email', NULL, 'new_email', v_normalized_poc_email, 'role_type', 'POC'),
      jsonb_build_object('reason', NULLIF(TRIM(COALESCE(p_reason, '')), ''), 'team_name', btrim(p_department_name)),
      v_admin_email,
      v_admin_role
    ),
    (
      p_tenant_id,
      p_admin_user_id::TEXT,
      'team.hod.assigned',
      'team_role_mappings',
      v_team_id::TEXT,
      jsonb_build_object('old_email', NULL, 'new_email', v_normalized_hod_email, 'role_type', 'HOD'),
      jsonb_build_object('reason', NULLIF(TRIM(COALESCE(p_reason, '')), ''), 'team_name', btrim(p_department_name)),
      v_admin_email,
      v_admin_role
    );

  RETURN QUERY
  SELECT v_team_id, btrim(p_department_name), TRUE, v_normalized_poc_email, v_normalized_hod_email, v_before, v_after;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_replace_team_role_email(
  p_tenant_id UUID,
  p_admin_user_id UUID,
  p_team_id UUID,
  p_role_type TEXT,
  p_new_email TEXT,
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
  v_previous_email TEXT;
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

  SELECT trm.email
    INTO v_previous_email
  FROM public.team_role_mappings trm
  WHERE trm.tenant_id = p_tenant_id
    AND trm.team_id = p_team_id
    AND trm.role_type = v_role_type
    AND trm.active_flag = TRUE
    AND trm.deleted_at IS NULL
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
      updated_at = NOW()
  WHERE t.id = p_team_id
    AND t.tenant_id = p_tenant_id;

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

DROP FUNCTION IF EXISTS public.create_contract_with_audit(
  UUID, UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, BIGINT, TEXT,
  TEXT, TEXT, TEXT, TEXT, UUID, UUID, BOOLEAN
);

CREATE OR REPLACE FUNCTION public.create_contract_with_audit(
  p_contract_id UUID,
  p_tenant_id UUID,
  p_title TEXT,
  p_uploaded_by_employee_id TEXT,
  p_uploaded_by_email TEXT,
  p_uploaded_by_role TEXT,
  p_file_path TEXT,
  p_file_name TEXT,
  p_file_size_bytes BIGINT,
  p_file_mime_type TEXT,
  p_signatory_name TEXT,
  p_signatory_designation TEXT,
  p_signatory_email TEXT,
  p_background_of_request TEXT,
  p_department_id UUID,
  p_contract_type_id UUID,
  p_budget_approved BOOLEAN
)
RETURNS TABLE (
  contract_id UUID,
  status TEXT,
  current_assignee_employee_id TEXT,
  current_assignee_email TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  uploader RECORD;
  assignee RECORD;
  initial_status TEXT;
  uploader_team_role TEXT;
  effective_uploader_role TEXT;
BEGIN
  IF p_uploaded_by_employee_id IS NULL OR btrim(p_uploaded_by_employee_id) = '' THEN
    RAISE EXCEPTION 'Actor employee id is required for contract upload';
  END IF;

  IF p_uploaded_by_email IS NULL OR btrim(p_uploaded_by_email) = '' THEN
    RAISE EXCEPTION 'Actor email is required for contract upload';
  END IF;

  IF p_uploaded_by_role IS NULL OR btrim(p_uploaded_by_role) = '' THEN
    RAISE EXCEPTION 'Actor role is required for contract upload';
  END IF;

  IF p_signatory_name IS NULL OR btrim(p_signatory_name) = '' THEN
    RAISE EXCEPTION 'Signatory name is required';
  END IF;

  IF p_signatory_designation IS NULL OR btrim(p_signatory_designation) = '' THEN
    RAISE EXCEPTION 'Signatory designation is required';
  END IF;

  IF p_signatory_email IS NULL
     OR btrim(p_signatory_email) = ''
     OR p_signatory_email !~* '^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$' THEN
    RAISE EXCEPTION 'Valid signatory email is required';
  END IF;

  IF p_background_of_request IS NULL OR btrim(p_background_of_request) = '' THEN
    RAISE EXCEPTION 'Background of request is required';
  END IF;

  SELECT u.id, u.email, u.role
  INTO uploader
  FROM public.users u
  WHERE u.id = p_uploaded_by_employee_id::UUID
    AND u.tenant_id = p_tenant_id
    AND lower(u.email) = lower(p_uploaded_by_email)
    AND u.is_active = TRUE
    AND u.deleted_at IS NULL
  LIMIT 1;

  IF uploader IS NULL THEN
    RAISE EXCEPTION 'Uploader is not valid for tenant context';
  END IF;

  SELECT trm.role_type
  INTO uploader_team_role
  FROM public.team_role_mappings trm
  WHERE trm.tenant_id = p_tenant_id
    AND lower(trm.email) = lower(p_uploaded_by_email)
    AND trm.active_flag = TRUE
    AND trm.deleted_at IS NULL
    AND trm.role_type IN ('POC', 'HOD')
  ORDER BY (trm.team_id = p_department_id) DESC, trm.assigned_at DESC
  LIMIT 1;

  effective_uploader_role := UPPER(COALESCE(
    uploader_team_role,
    public.resolve_user_effective_role(p_tenant_id, uploader.id::UUID, uploader.role)
  ));

  IF effective_uploader_role NOT IN ('POC', 'LEGAL_TEAM', 'ADMIN', 'USER') THEN
    RAISE EXCEPTION 'Uploader role is not allowed to create contracts';
  END IF;

  IF upper(effective_uploader_role) <> upper(p_uploaded_by_role) THEN
    RAISE EXCEPTION 'Uploader role does not match session role';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.teams t
    WHERE t.id = p_department_id
      AND t.tenant_id = p_tenant_id
      AND t.deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Department does not exist in tenant context';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.contract_types ct
    WHERE ct.id = p_contract_type_id
      AND ct.tenant_id = p_tenant_id
      AND ct.deleted_at IS NULL
      AND ct.is_active = TRUE
  ) THEN
    RAISE EXCEPTION 'Contract type does not exist in tenant context';
  END IF;

  SELECT u.id, u.email
  INTO assignee
  FROM public.team_role_mappings trm
  JOIN public.users u
    ON u.tenant_id = trm.tenant_id
   AND lower(u.email) = lower(trm.email)
   AND u.is_active = TRUE
   AND u.deleted_at IS NULL
  WHERE trm.tenant_id = p_tenant_id
    AND trm.team_id = p_department_id
    AND trm.role_type = 'HOD'
    AND trm.active_flag = TRUE
    AND trm.deleted_at IS NULL
  ORDER BY trm.assigned_at DESC
  LIMIT 1;

  IF assignee IS NULL THEN
    RAISE EXCEPTION 'No active HOD configured for selected department';
  END IF;

  initial_status := 'HOD_PENDING';

  INSERT INTO public.contracts (
    id,
    tenant_id,
    title,
    uploaded_by_employee_id,
    uploaded_by_email,
    current_assignee_employee_id,
    current_assignee_email,
    status,
    file_path,
    file_name,
    file_size_bytes,
    file_mime_type,
    signatory_name,
    signatory_designation,
    signatory_email,
    background_of_request,
    department_id,
    contract_type_id,
    budget_approved,
    request_created_at
  ) VALUES (
    p_contract_id,
    p_tenant_id,
    btrim(p_title),
    p_uploaded_by_employee_id,
    lower(btrim(p_uploaded_by_email)),
    assignee.id::TEXT,
    lower(btrim(assignee.email)),
    initial_status,
    p_file_path,
    p_file_name,
    p_file_size_bytes,
    p_file_mime_type,
    btrim(p_signatory_name),
    btrim(p_signatory_designation),
    lower(btrim(p_signatory_email)),
    btrim(p_background_of_request),
    p_department_id,
    p_contract_type_id,
    COALESCE(p_budget_approved, FALSE),
    NOW()
  );

  INSERT INTO public.audit_logs (
    tenant_id,
    user_id,
    event_type,
    action,
    actor_email,
    actor_role,
    resource_type,
    resource_id,
    metadata,
    target_email
  )
  VALUES
  (
    p_tenant_id,
    p_uploaded_by_employee_id,
    'CONTRACT_CREATED'::public.audit_event_type,
    'contract.created',
    lower(btrim(p_uploaded_by_email)),
    upper(effective_uploader_role),
    'contract',
    p_contract_id::TEXT,
    jsonb_build_object(
      'title', btrim(p_title),
      'status', 'HOD_PENDING',
      'file_path', p_file_path,
      'file_name', p_file_name,
      'file_size_bytes', p_file_size_bytes,
      'file_mime_type', p_file_mime_type,
      'signatory_name', btrim(p_signatory_name),
      'signatory_designation', btrim(p_signatory_designation),
      'signatory_email', lower(btrim(p_signatory_email)),
      'department_id', p_department_id,
      'contract_type_id', p_contract_type_id,
      'budget_approved', COALESCE(p_budget_approved, FALSE)
    ),
    assignee.email
  ),
  (
    p_tenant_id,
    p_uploaded_by_employee_id,
    'CONTRACT_TRANSITIONED'::public.audit_event_type,
    'contract.updated',
    lower(btrim(p_uploaded_by_email)),
    upper(effective_uploader_role),
    'contract',
    p_contract_id::TEXT,
    jsonb_build_object(
      'transition', 'system.initial_route',
      'to_status', 'HOD_PENDING'
    ),
    assignee.email
  );

  RETURN QUERY
  SELECT p_contract_id, 'HOD_PENDING', assignee.id::TEXT, assignee.email;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_create_department_with_emails(UUID, UUID, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_replace_team_role_email(UUID, UUID, UUID, TEXT, TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_set_department_legal_matrix(UUID, UUID, UUID, UUID[], TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_contract_with_audit(
  UUID, UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, BIGINT, TEXT,
  TEXT, TEXT, TEXT, TEXT, UUID, UUID, BOOLEAN
) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.admin_create_department_with_emails(UUID, UUID, TEXT, TEXT, TEXT, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_replace_team_role_email(UUID, UUID, UUID, TEXT, TEXT, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_set_department_legal_matrix(UUID, UUID, UUID, UUID[], TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.create_contract_with_audit(
  UUID, UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, BIGINT, TEXT,
  TEXT, TEXT, TEXT, TEXT, UUID, UUID, BOOLEAN
) TO service_role;
