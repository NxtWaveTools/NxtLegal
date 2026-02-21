-- Phase 1 runtime hotfix: ensure SLA query/view and upload RPC objects exist on live schema

CREATE TABLE IF NOT EXISTS public.holidays (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  holiday_date DATE NOT NULL,
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('NATIONAL', 'COMPANY')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_holidays_date_type
  ON public.holidays(holiday_date, type);

ALTER TABLE public.contracts
  ADD COLUMN IF NOT EXISTS tat_deadline_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS tat_breached_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS signatory_name TEXT,
  ADD COLUMN IF NOT EXISTS signatory_designation TEXT,
  ADD COLUMN IF NOT EXISTS signatory_email TEXT,
  ADD COLUMN IF NOT EXISTS background_of_request TEXT,
  ADD COLUMN IF NOT EXISTS department_id UUID,
  ADD COLUMN IF NOT EXISTS budget_approved BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS request_created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

CREATE INDEX IF NOT EXISTS idx_contracts_department_id
  ON public.contracts(department_id)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_contracts_tat_deadline_at
  ON public.contracts(tat_deadline_at)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_contracts_tenant_tat_deadline_at
  ON public.contracts(tenant_id, tat_deadline_at)
  WHERE deleted_at IS NULL;

CREATE OR REPLACE FUNCTION public.business_day_diff(start_date DATE, end_date DATE)
RETURNS INTEGER
LANGUAGE sql
STABLE
AS $$
  WITH bounds AS (
    SELECT LEAST(start_date, end_date) AS lo,
           GREATEST(start_date, end_date) AS hi,
           CASE WHEN end_date >= start_date THEN 1 ELSE -1 END AS direction
  ),
  days AS (
    SELECT gs::date AS day
    FROM bounds,
    generate_series(bounds.lo + 1, bounds.hi, interval '1 day') AS gs
  ),
  business_days AS (
    SELECT COUNT(*)::INTEGER AS count_days
    FROM days d
    WHERE EXTRACT(ISODOW FROM d.day) < 6
      AND NOT EXISTS (
        SELECT 1
        FROM public.holidays h
        WHERE h.holiday_date = d.day
      )
  )
  SELECT COALESCE((SELECT b.direction * bd.count_days FROM bounds b CROSS JOIN business_days bd), 0);
$$;

CREATE OR REPLACE FUNCTION public.business_day_add(start_date DATE, days INTEGER)
RETURNS DATE
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  direction INTEGER := CASE WHEN days >= 0 THEN 1 ELSE -1 END;
  remaining INTEGER := ABS(days);
  cursor_date DATE := start_date;
BEGIN
  IF days = 0 THEN
    RETURN start_date;
  END IF;

  WHILE remaining > 0 LOOP
    cursor_date := cursor_date + direction;

    IF EXTRACT(ISODOW FROM cursor_date) < 6
       AND NOT EXISTS (
         SELECT 1
         FROM public.holidays h
         WHERE h.holiday_date = cursor_date
       ) THEN
      remaining := remaining - 1;
    END IF;
  END LOOP;

  RETURN cursor_date;
END;
$$;

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
BEGIN
  SELECT u.id, u.email, u.role, tm.team_id
  INTO uploader
  FROM public.users u
  LEFT JOIN LATERAL (
    SELECT team_id
    FROM public.team_members tm
    WHERE tm.tenant_id = u.tenant_id
      AND tm.user_id = u.id
    ORDER BY tm.is_primary DESC, tm.created_at ASC
    LIMIT 1
  ) tm ON TRUE
  WHERE u.id = p_uploaded_by_employee_id::UUID
    AND u.tenant_id = p_tenant_id
    AND lower(u.email) = lower(p_uploaded_by_email)
    AND u.is_active = TRUE
    AND u.deleted_at IS NULL
  LIMIT 1;

  IF uploader IS NULL THEN
    RAISE EXCEPTION 'Uploader is not valid for tenant context';
  END IF;

  IF uploader.role NOT IN ('POC', 'LEGAL_TEAM', 'ADMIN', 'USER') THEN
    RAISE EXCEPTION 'Uploader role is not allowed to create contracts';
  END IF;

  IF uploader.role <> p_uploaded_by_role THEN
    RAISE EXCEPTION 'Uploader role does not match session role';
  END IF;

  IF uploader.team_id IS NOT NULL THEN
    SELECT h.id, h.email
    INTO assignee
    FROM public.teams t
    JOIN public.users h
      ON h.tenant_id = t.tenant_id
     AND lower(h.email) = lower(t.hod_email)
     AND h.role = 'HOD'
     AND h.is_active = TRUE
     AND h.deleted_at IS NULL
    WHERE t.id = uploader.team_id
      AND t.tenant_id = p_tenant_id
      AND t.deleted_at IS NULL
    LIMIT 1;
  END IF;

  IF assignee IS NULL THEN
    SELECT h.id, h.email
    INTO assignee
    FROM public.users h
    WHERE h.tenant_id = p_tenant_id
      AND h.role = 'HOD'
      AND h.is_active = TRUE
      AND h.deleted_at IS NULL
    ORDER BY h.created_at ASC
    LIMIT 1;
  END IF;

  IF assignee IS NULL THEN
    RAISE EXCEPTION 'No active HOD configured for tenant';
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
    budget_approved,
    request_created_at
  ) VALUES (
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
    p_file_mime_type,
    COALESCE(NULLIF(btrim(p_signatory_name), ''), 'Legacy Signatory'),
    COALESCE(NULLIF(btrim(p_signatory_designation), ''), 'Legacy Designation'),
    COALESCE(NULLIF(lower(btrim(p_signatory_email)), ''), 'legacy-signatory@nxtwave.co.in'),
    COALESCE(NULLIF(btrim(p_background_of_request), ''), 'Legacy contract intake record migrated before mandatory background capture.'),
    p_department_id,
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
    'CONTRACT_TRANSITIONED'::public.audit_event_type,
    'contract.updated',
    p_uploaded_by_email,
    p_uploaded_by_role,
    'contract',
    p_contract_id::TEXT,
    jsonb_build_object('transition', 'system.initial_route', 'to_status', initial_status),
    assignee.email
  );

  RETURN QUERY
  SELECT p_contract_id, initial_status, assignee.id::TEXT, assignee.email;
END;
$$;

REVOKE ALL ON FUNCTION public.create_contract_with_audit(
  UUID, UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, BIGINT, TEXT,
  TEXT, TEXT, TEXT, TEXT, UUID, BOOLEAN
) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.create_contract_with_audit(
  UUID, UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, BIGINT, TEXT,
  TEXT, TEXT, TEXT, TEXT, UUID, BOOLEAN
) TO service_role;

CREATE OR REPLACE VIEW public.contracts_repository_view AS
SELECT
  c.id,
  c.tenant_id,
  c.title,
  c.status,
  c.uploaded_by_employee_id,
  c.uploaded_by_email,
  c.current_assignee_employee_id,
  c.current_assignee_email,
  c.hod_approved_at,
  c.tat_deadline_at,
  c.tat_breached_at,
  c.created_at,
  c.updated_at,
  CASE
    WHEN c.hod_approved_at IS NULL THEN NULL
    ELSE public.business_day_diff(
      (c.hod_approved_at AT TIME ZONE 'UTC')::DATE,
      (CURRENT_TIMESTAMP AT TIME ZONE 'UTC')::DATE
    )
  END AS aging_business_days,
  CASE
    WHEN c.tat_deadline_at IS NOT NULL
      AND CURRENT_TIMESTAMP > c.tat_deadline_at
      AND c.status NOT IN ('COMPLETED', 'EXECUTED', 'REJECTED')
    THEN TRUE
    ELSE FALSE
  END AS is_tat_breached,
  CASE
    WHEN c.tat_deadline_at IS NOT NULL
      AND CURRENT_TIMESTAMP <= c.tat_deadline_at
      AND c.status NOT IN ('COMPLETED', 'EXECUTED', 'REJECTED')
      AND public.business_day_diff(
        (CURRENT_TIMESTAMP AT TIME ZONE 'UTC')::DATE,
        (c.tat_deadline_at AT TIME ZONE 'UTC')::DATE
      ) = 1
    THEN TRUE
    ELSE FALSE
  END AS near_breach
FROM public.contracts c
WHERE c.deleted_at IS NULL;

GRANT SELECT ON public.contracts_repository_view TO service_role;