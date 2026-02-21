-- Resolve uploader role from latest team_members model to prevent USER/role_type drift failures
-- and ensure upload RPC validates against effective session role.

DROP FUNCTION IF EXISTS public.create_contract_with_audit(
  UUID, UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, BIGINT, TEXT
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

  SELECT tm.role_type
  INTO uploader_team_role
  FROM public.team_members tm
  WHERE tm.tenant_id = p_tenant_id
    AND tm.user_id = p_uploaded_by_employee_id::UUID
  ORDER BY (tm.team_id = p_department_id) DESC, tm.is_primary DESC, tm.created_at ASC
  LIMIT 1;

  effective_uploader_role := COALESCE(uploader_team_role, uploader.role);

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
  FROM public.team_members tm
  JOIN public.users u
    ON u.id = tm.user_id
   AND u.tenant_id = tm.tenant_id
  WHERE tm.tenant_id = p_tenant_id
    AND tm.team_id = p_department_id
    AND tm.role_type = 'HOD'
    AND u.is_active = TRUE
    AND u.deleted_at IS NULL
  ORDER BY tm.is_primary DESC, tm.created_at ASC
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

REVOKE ALL ON FUNCTION public.create_contract_with_audit(
  UUID, UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, BIGINT, TEXT,
  TEXT, TEXT, TEXT, TEXT, UUID, UUID, BOOLEAN
) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.create_contract_with_audit(
  UUID, UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, BIGINT, TEXT,
  TEXT, TEXT, TEXT, TEXT, UUID, UUID, BOOLEAN
) TO service_role;
