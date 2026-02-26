DO $$
DECLARE
  v_tenant_id UUID := '00000000-0000-0000-0000-000000000000';
  v_legal_team_id UUID;
  v_legal_hod_user_id UUID;
BEGIN
  INSERT INTO public.users (
    tenant_id,
    email,
    full_name,
    role,
    is_active
  )
  SELECT
    v_tenant_id,
    'legalhod@nxtwave.co.in',
    'Legal HOD',
    'HOD',
    TRUE
  WHERE NOT EXISTS (
    SELECT 1
    FROM public.users u
    WHERE u.tenant_id = v_tenant_id
      AND lower(u.email) = 'legalhod@nxtwave.co.in'
      AND u.deleted_at IS NULL
  );

  SELECT u.id
  INTO v_legal_hod_user_id
  FROM public.users u
  WHERE u.tenant_id = v_tenant_id
    AND lower(u.email) = 'legalhod@nxtwave.co.in'
    AND u.deleted_at IS NULL
  LIMIT 1;

  IF v_legal_hod_user_id IS NULL THEN
    RAISE EXCEPTION 'Failed to resolve legal HOD user for tenant %', v_tenant_id;
  END IF;

  UPDATE public.users
  SET
    role = 'HOD',
    is_active = TRUE,
    updated_at = NOW(),
    deleted_at = NULL
  WHERE id = v_legal_hod_user_id;

  INSERT INTO public.teams (
    tenant_id,
    name,
    hod_email,
    is_active
  )
  SELECT
    v_tenant_id,
    'Legal and Compliance',
    'legalhod@nxtwave.co.in',
    TRUE
  WHERE NOT EXISTS (
    SELECT 1
    FROM public.teams t
    WHERE t.tenant_id = v_tenant_id
      AND t.name = 'Legal and Compliance'
      AND t.deleted_at IS NULL
  );

  UPDATE public.teams
  SET
    hod_email = 'legalhod@nxtwave.co.in',
    is_active = TRUE,
    updated_at = NOW(),
    deleted_at = NULL
  WHERE tenant_id = v_tenant_id
    AND name = 'Legal and Compliance';

  SELECT t.id
  INTO v_legal_team_id
  FROM public.teams t
  WHERE t.tenant_id = v_tenant_id
    AND t.name = 'Legal and Compliance'
    AND t.deleted_at IS NULL
  LIMIT 1;

  IF v_legal_team_id IS NULL THEN
    RAISE EXCEPTION 'Failed to resolve legal team for tenant %', v_tenant_id;
  END IF;

  UPDATE public.team_role_mappings
  SET
    active_flag = FALSE,
    replaced_by = v_legal_hod_user_id,
    replaced_at = NOW(),
    updated_at = NOW(),
    deleted_at = COALESCE(deleted_at, NOW())
  WHERE tenant_id = v_tenant_id
    AND team_id = v_legal_team_id
    AND role_type = 'HOD'
    AND active_flag = TRUE
    AND lower(email) <> 'legalhod@nxtwave.co.in';

  INSERT INTO public.team_role_mappings (
    tenant_id,
    team_id,
    email,
    role_type,
    active_flag,
    assigned_by,
    assigned_at,
    created_at,
    updated_at,
    deleted_at
  )
  SELECT
    v_tenant_id,
    v_legal_team_id,
    'legalhod@nxtwave.co.in',
    'HOD',
    TRUE,
    v_legal_hod_user_id,
    NOW(),
    NOW(),
    NOW(),
    NULL
  WHERE NOT EXISTS (
    SELECT 1
    FROM public.team_role_mappings trm
    WHERE trm.tenant_id = v_tenant_id
      AND trm.team_id = v_legal_team_id
      AND trm.role_type = 'HOD'
      AND lower(trm.email) = 'legalhod@nxtwave.co.in'
      AND trm.active_flag = TRUE
      AND trm.deleted_at IS NULL
  );
END;
$$;