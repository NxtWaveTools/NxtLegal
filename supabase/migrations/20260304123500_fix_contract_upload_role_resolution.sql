-- Fix upload RPC role resolution to avoid overriding LEGAL_TEAM/ADMIN sessions
-- with department mappings that only apply to POC/HOD routing.

DROP FUNCTION IF EXISTS public.create_contract_with_audit(
  UUID, UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, BIGINT, TEXT,
  TEXT, TEXT, TEXT, TEXT, UUID, UUID, BOOLEAN, TEXT, BOOLEAN, TEXT
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
  p_budget_approved BOOLEAN,
  p_upload_mode TEXT DEFAULT 'DEFAULT',
  p_bypass_hod_approval BOOLEAN DEFAULT FALSE,
  p_bypass_reason TEXT DEFAULT NULL
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
  assignee_id UUID;
  assignee_email TEXT;
  initial_status TEXT;
  uploader_team_role TEXT;
  resolved_user_role TEXT;
  effective_uploader_role TEXT;
  normalized_upload_mode TEXT := UPPER(COALESCE(p_upload_mode, 'DEFAULT'));
  bypass_hod_approval BOOLEAN := COALESCE(p_bypass_hod_approval, FALSE);
  normalized_bypass_reason TEXT := NULLIF(BTRIM(COALESCE(p_bypass_reason, '')), '');
  routing_team_id UUID;
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
     OR (
       p_signatory_email !~* '^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$'
       AND upper(btrim(p_signatory_email)) <> 'NA'
     ) THEN
    RAISE EXCEPTION 'Valid signatory email is required';
  END IF;

  IF p_background_of_request IS NULL OR btrim(p_background_of_request) = '' THEN
    RAISE EXCEPTION 'Background of request is required';
  END IF;

  IF normalized_upload_mode NOT IN ('DEFAULT', 'LEGAL_SEND_FOR_SIGNING') THEN
    RAISE EXCEPTION 'Unsupported upload mode';
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

  resolved_user_role := UPPER(public.resolve_user_effective_role(p_tenant_id, uploader.id::UUID, uploader.role));

  -- Team mapping should only decide role when the request itself is from POC/HOD.
  -- For LEGAL_TEAM/ADMIN/USER sessions we honor resolved account role.
  IF upper(p_uploaded_by_role) IN ('POC', 'HOD') THEN
    effective_uploader_role := UPPER(COALESCE(uploader_team_role, resolved_user_role));
  ELSE
    effective_uploader_role := resolved_user_role;
  END IF;

  IF effective_uploader_role NOT IN ('POC', 'HOD', 'LEGAL_TEAM', 'ADMIN', 'USER') THEN
    RAISE EXCEPTION 'Uploader role is not allowed to create contracts';
  END IF;

  IF upper(effective_uploader_role) <> upper(p_uploaded_by_role) THEN
    RAISE EXCEPTION 'Uploader role does not match session role';
  END IF;

  IF normalized_upload_mode = 'LEGAL_SEND_FOR_SIGNING' AND effective_uploader_role <> 'LEGAL_TEAM' THEN
    RAISE EXCEPTION 'Only LEGAL_TEAM can use send-for-signing upload mode';
  END IF;

  IF bypass_hod_approval AND normalized_upload_mode <> 'LEGAL_SEND_FOR_SIGNING' THEN
    RAISE EXCEPTION 'Bypass is only available in send-for-signing mode';
  END IF;

  IF bypass_hod_approval AND normalized_bypass_reason IS NULL THEN
    RAISE EXCEPTION 'Bypass reason is required when bypassing HOD approval';
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

  IF normalized_upload_mode = 'LEGAL_SEND_FOR_SIGNING' AND bypass_hod_approval THEN
    assignee_id := uploader.id;
    assignee_email := lower(btrim(uploader.email));
    initial_status := 'COMPLETED';
  ELSE
    IF normalized_upload_mode = 'LEGAL_SEND_FOR_SIGNING' THEN
      SELECT t.id
      INTO routing_team_id
      FROM public.teams t
      WHERE t.tenant_id = p_tenant_id
        AND lower(t.name) = lower('Legal and Compliance')
        AND t.deleted_at IS NULL
      ORDER BY t.created_at DESC
      LIMIT 1;

      IF routing_team_id IS NULL THEN
        RAISE EXCEPTION 'Legal and Compliance department is not configured';
      END IF;
    ELSE
      routing_team_id := p_department_id;
    END IF;

    SELECT u.id, u.email
    INTO assignee_id, assignee_email
    FROM public.team_role_mappings trm
    JOIN public.users u
      ON u.tenant_id = trm.tenant_id
     AND lower(u.email) = lower(trm.email)
     AND u.is_active = TRUE
     AND u.deleted_at IS NULL
    WHERE trm.tenant_id = p_tenant_id
      AND trm.team_id = routing_team_id
      AND trm.role_type = 'HOD'
      AND trm.active_flag = TRUE
      AND trm.deleted_at IS NULL
    ORDER BY trm.assigned_at DESC
    LIMIT 1;

    IF assignee_id IS NULL OR assignee_email IS NULL THEN
      RAISE EXCEPTION 'No active HOD configured for routing department';
    END IF;

    initial_status := 'HOD_PENDING';
  END IF;

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
    assignee_id::TEXT,
    lower(btrim(assignee_email)),
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

  IF normalized_upload_mode = 'LEGAL_SEND_FOR_SIGNING' AND NOT bypass_hod_approval THEN
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
      target_email,
      note_text
    ) VALUES (
      p_tenant_id,
      p_uploaded_by_employee_id,
      'CONTRACT_SIGNATORY_SENT'::public.audit_event_type,
      'contract.legal.send_for_signing.initiated',
      lower(btrim(p_uploaded_by_email)),
      upper(effective_uploader_role),
      'contract',
      p_contract_id::TEXT,
      jsonb_build_object(
        'title', btrim(p_title),
        'status', initial_status,
        'file_path', p_file_path,
        'file_name', p_file_name,
        'file_size_bytes', p_file_size_bytes,
        'file_mime_type', p_file_mime_type,
        'signatory_name', btrim(p_signatory_name),
        'signatory_designation', btrim(p_signatory_designation),
        'signatory_email', lower(btrim(p_signatory_email)),
        'department_id', p_department_id,
        'routing_team_id', routing_team_id,
        'contract_type_id', p_contract_type_id,
        'budget_approved', COALESCE(p_budget_approved, FALSE),
        'upload_mode', normalized_upload_mode,
        'bypass_hod_approval', bypass_hod_approval,
        'workflow_label', 'Pending Legal HOD review'
      ),
      assignee_email,
      'Initiated Send for Signing workflow. Pending Legal HOD review.'
    );
  ELSE
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
        'status', initial_status,
        'file_path', p_file_path,
        'file_name', p_file_name,
        'file_size_bytes', p_file_size_bytes,
        'file_mime_type', p_file_mime_type,
        'signatory_name', btrim(p_signatory_name),
        'signatory_designation', btrim(p_signatory_designation),
        'signatory_email', lower(btrim(p_signatory_email)),
        'department_id', p_department_id,
        'routing_team_id', routing_team_id,
        'contract_type_id', p_contract_type_id,
        'budget_approved', COALESCE(p_budget_approved, FALSE),
        'upload_mode', normalized_upload_mode,
        'bypass_hod_approval', bypass_hod_approval
      ),
      assignee_email
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
        'to_status', initial_status
      ),
      assignee_email
    );
  END IF;

  IF bypass_hod_approval THEN
    INSERT INTO public.audit_logs (
      tenant_id,
      user_id,
      event_type,
      action,
      actor_email,
      actor_role,
      resource_type,
      resource_id,
      target_email,
      note_text,
      metadata
    ) VALUES (
      p_tenant_id,
      p_uploaded_by_employee_id,
      'CONTRACT_BYPASSED'::public.audit_event_type,
      'contract.hod.bypass',
      lower(btrim(p_uploaded_by_email)),
      upper(effective_uploader_role),
      'contract',
      p_contract_id::TEXT,
      assignee_email,
      normalized_bypass_reason,
      jsonb_build_object(
        'from_status', 'HOD_PENDING',
        'to_status', 'COMPLETED',
        'transition', 'system.legal_send_for_signing_bypass'
      )
    );
  END IF;

  RETURN QUERY
  SELECT p_contract_id, initial_status, assignee_id::TEXT, assignee_email;
END;
$$;

REVOKE ALL ON FUNCTION public.create_contract_with_audit(
  UUID, UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, BIGINT, TEXT,
  TEXT, TEXT, TEXT, TEXT, UUID, UUID, BOOLEAN, TEXT, BOOLEAN, TEXT
) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.create_contract_with_audit(
  UUID, UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, BIGINT, TEXT,
  TEXT, TEXT, TEXT, TEXT, UUID, UUID, BOOLEAN, TEXT, BOOLEAN, TEXT
) TO service_role;