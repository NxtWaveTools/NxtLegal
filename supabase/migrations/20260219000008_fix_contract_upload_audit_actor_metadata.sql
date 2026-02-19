-- Ensure contract upload initialization audit rows persist actor metadata and enum taxonomy

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
  p_file_mime_type TEXT
)
RETURNS TABLE (
  contract_id UUID,
  status TEXT,
  current_assignee_employee_id TEXT,
  current_assignee_email TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uploader RECORD;
  assignee RECORD;
  initial_status TEXT;
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

  SELECT u.id, u.email, u.role, u.team_id
  INTO uploader
  FROM users u
  WHERE u.id = p_uploaded_by_employee_id::UUID
    AND u.tenant_id = p_tenant_id
    AND lower(u.email) = lower(p_uploaded_by_email)
    AND u.is_active = true
    AND u.deleted_at IS NULL
  LIMIT 1;

  IF uploader IS NULL THEN
    RAISE EXCEPTION 'Uploader is not valid for tenant context';
  END IF;

  IF uploader.role NOT IN ('POC', 'LEGAL_TEAM', 'ADMIN') THEN
    RAISE EXCEPTION 'Uploader role is not allowed to create contracts';
  END IF;

  IF uploader.role <> p_uploaded_by_role THEN
    RAISE EXCEPTION 'Uploader role does not match session role';
  END IF;

  IF uploader.team_id IS NOT NULL THEN
    SELECT h.id, h.email
    INTO assignee
    FROM teams t
    JOIN users h
      ON h.tenant_id = t.tenant_id
     AND lower(h.email) = lower(t.hod_email)
     AND h.role = 'HOD'
     AND h.is_active = true
     AND h.deleted_at IS NULL
    WHERE t.id = uploader.team_id
      AND t.tenant_id = p_tenant_id
      AND t.deleted_at IS NULL
    LIMIT 1;
  END IF;

  IF assignee IS NULL THEN
    SELECT h.id, h.email
    INTO assignee
    FROM users h
    WHERE h.tenant_id = p_tenant_id
      AND h.role = 'HOD'
      AND h.is_active = true
      AND h.deleted_at IS NULL
    ORDER BY h.created_at ASC
    LIMIT 1;
  END IF;

  IF assignee IS NULL THEN
    RAISE EXCEPTION 'No active HOD configured for tenant';
  END IF;

  initial_status := 'HOD_PENDING';

  INSERT INTO contracts (
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
    file_mime_type
  )
  VALUES (
    p_contract_id,
    p_tenant_id,
    p_title,
    p_uploaded_by_employee_id,
    p_uploaded_by_email,
    assignee.id::TEXT,
    assignee.email,
    initial_status,
    p_file_path,
    p_file_name,
    p_file_size_bytes,
    p_file_mime_type
  );

  INSERT INTO audit_logs (
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
    'CONTRACT_CREATED'::audit_event_type,
    'contract.created',
    p_uploaded_by_email,
    p_uploaded_by_role,
    'contract',
    p_contract_id::TEXT,
    jsonb_build_object(
      'title', p_title,
      'status', initial_status,
      'file_path', p_file_path,
      'file_name', p_file_name,
      'file_size_bytes', p_file_size_bytes,
      'file_mime_type', p_file_mime_type
    ),
    assignee.email
  ),
  (
    p_tenant_id,
    p_uploaded_by_employee_id,
    'CONTRACT_TRANSITIONED'::audit_event_type,
    'contract.updated',
    p_uploaded_by_email,
    p_uploaded_by_role,
    'contract',
    p_contract_id::TEXT,
    jsonb_build_object(
      'transition', 'system.initial_route',
      'to_status', initial_status
    ),
    assignee.email
  );

  RETURN QUERY
  SELECT p_contract_id, initial_status, assignee.id::TEXT, assignee.email;
END;
$$;

REVOKE ALL ON FUNCTION public.create_contract_with_audit(UUID, UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, BIGINT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_contract_with_audit(UUID, UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, BIGINT, TEXT) TO service_role;
