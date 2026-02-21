-- Reconstructed from live migration history: team primary reassignment workflow with contract reassignment side-effects

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type t
    JOIN pg_enum e ON e.enumtypid = t.oid
    WHERE t.typname = 'audit_event_type'
      AND e.enumlabel = 'TEAM_MEMBER_REASSIGNED'
  ) THEN
    ALTER TYPE public.audit_event_type ADD VALUE 'TEAM_MEMBER_REASSIGNED';
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.replace_primary_team_member(
  p_tenant_id UUID,
  p_team_id UUID,
  p_new_user_id UUID,
  p_role_type TEXT,
  p_actor_user_id TEXT,
  p_actor_email TEXT,
  p_actor_role TEXT
)
RETURNS TABLE (
  id UUID,
  tenant_id UUID,
  team_id UUID,
  user_id UUID,
  role_type TEXT,
  is_primary BOOLEAN,
  user_email TEXT,
  user_full_name TEXT,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_existing_member_id UUID;
  v_old_primary_user_id UUID;
  v_old_primary_email TEXT;
  v_new_primary_email TEXT;
  v_new_primary_full_name TEXT;
  v_affected_contracts BIGINT := 0;
BEGIN
  IF p_role_type NOT IN ('POC', 'HOD') THEN
    RAISE EXCEPTION 'Role type must be POC or HOD';
  END IF;

  IF p_actor_user_id IS NULL OR btrim(p_actor_user_id) = '' THEN
    RAISE EXCEPTION 'Actor user id is required';
  END IF;

  IF p_actor_email IS NULL OR btrim(p_actor_email) = '' THEN
    RAISE EXCEPTION 'Actor email is required';
  END IF;

  SELECT tm.user_id, u.email
    INTO v_old_primary_user_id, v_old_primary_email
  FROM public.team_members tm
  JOIN public.users u
    ON u.id = tm.user_id
   AND u.tenant_id = tm.tenant_id
  WHERE tm.tenant_id = p_tenant_id
    AND tm.team_id = p_team_id
    AND tm.role_type = p_role_type
    AND tm.is_primary = TRUE
  LIMIT 1;

  IF v_old_primary_user_id IS NULL THEN
    RAISE EXCEPTION 'No existing primary member found for role %', p_role_type;
  END IF;

  SELECT u.email, u.full_name
    INTO v_new_primary_email, v_new_primary_full_name
  FROM public.users u
  WHERE u.id = p_new_user_id
    AND u.tenant_id = p_tenant_id
    AND u.is_active = TRUE
    AND u.deleted_at IS NULL
  LIMIT 1;

  IF v_new_primary_email IS NULL THEN
    RAISE EXCEPTION 'New primary user is invalid for tenant context';
  END IF;

  UPDATE public.team_members tm
  SET is_primary = FALSE,
      updated_at = NOW()
  WHERE tm.tenant_id = p_tenant_id
    AND tm.team_id = p_team_id
    AND tm.role_type = p_role_type
    AND tm.is_primary = TRUE;

  SELECT tm.id INTO v_existing_member_id
  FROM public.team_members tm
  WHERE tm.tenant_id = p_tenant_id
    AND tm.team_id = p_team_id
    AND tm.user_id = p_new_user_id
  LIMIT 1;

  IF v_existing_member_id IS NOT NULL THEN
    UPDATE public.team_members tm
    SET is_primary = TRUE,
        role_type = p_role_type,
        updated_at = NOW()
    WHERE tm.id = v_existing_member_id;
  ELSE
    INSERT INTO public.team_members (
      tenant_id,
      team_id,
      user_id,
      role_type,
      is_primary
    ) VALUES (
      p_tenant_id,
      p_team_id,
      p_new_user_id,
      p_role_type,
      TRUE
    )
    RETURNING team_members.id INTO v_existing_member_id;
  END IF;

  IF p_role_type = 'POC' THEN
    UPDATE public.contracts c
    SET uploaded_by_employee_id = p_new_user_id::TEXT,
        uploaded_by_email = v_new_primary_email,
        updated_at = NOW()
    WHERE c.tenant_id = p_tenant_id
      AND c.deleted_at IS NULL
      AND c.uploaded_by_employee_id = v_old_primary_user_id::TEXT;

    GET DIAGNOSTICS v_affected_contracts = ROW_COUNT;
  ELSIF p_role_type = 'HOD' THEN
    UPDATE public.contracts c
    SET current_assignee_employee_id = p_new_user_id::TEXT,
        current_assignee_email = v_new_primary_email,
        updated_at = NOW()
    WHERE c.tenant_id = p_tenant_id
      AND c.deleted_at IS NULL
      AND c.status = 'HOD_PENDING'
      AND c.current_assignee_employee_id = v_old_primary_user_id::TEXT;

    GET DIAGNOSTICS v_affected_contracts = ROW_COUNT;
  END IF;

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
  ) VALUES (
    p_tenant_id,
    p_actor_user_id,
    'TEAM_MEMBER_REASSIGNED'::public.audit_event_type,
    'team.member.reassigned',
    p_actor_email,
    p_actor_role,
    'team',
    p_team_id::TEXT,
    jsonb_build_object(
      'role_type', p_role_type,
      'old_primary_user_id', v_old_primary_user_id::TEXT,
      'old_primary_email', v_old_primary_email,
      'new_primary_user_id', p_new_user_id::TEXT,
      'new_primary_email', v_new_primary_email,
      'affected_contracts', v_affected_contracts
    ),
    v_new_primary_email
  );

  RETURN QUERY
  SELECT tm.id,
         tm.tenant_id,
         tm.team_id,
         tm.user_id,
         tm.role_type,
         tm.is_primary,
         v_new_primary_email,
         v_new_primary_full_name,
         tm.created_at,
         tm.updated_at
  FROM public.team_members tm
  WHERE tm.id = v_existing_member_id;
END;
$$;

REVOKE ALL ON FUNCTION public.replace_primary_team_member(UUID, UUID, UUID, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.replace_primary_team_member(UUID, UUID, UUID, TEXT, TEXT, TEXT, TEXT) TO service_role;