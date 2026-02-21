-- Phase 1 hardening: SLA/TAT engine + contract intake schema expansion + strict DB enforcement

CREATE TABLE IF NOT EXISTS public.holidays (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  holiday_date DATE NOT NULL,
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('NATIONAL', 'COMPANY')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT holidays_name_non_empty CHECK (btrim(name) <> '')
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_holidays_date_type
  ON public.holidays(holiday_date, type);

CREATE INDEX IF NOT EXISTS idx_holidays_date
  ON public.holidays(holiday_date);

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

CREATE INDEX IF NOT EXISTS idx_teams_tenant_id_id
  ON public.teams(tenant_id, id);

INSERT INTO public.teams (tenant_id, name)
SELECT c.tenant_id, 'Unassigned Department'
FROM public.contracts c
LEFT JOIN public.teams t
  ON t.tenant_id = c.tenant_id
 AND t.deleted_at IS NULL
WHERE t.id IS NULL
GROUP BY c.tenant_id
ON CONFLICT (tenant_id, name) DO NOTHING;

WITH fallback_team AS (
  SELECT t.tenant_id, MIN(t.id::TEXT)::UUID AS team_id
  FROM public.teams t
  WHERE t.deleted_at IS NULL
  GROUP BY t.tenant_id
)
UPDATE public.contracts c
SET department_id = COALESCE(
  (
    SELECT tm.team_id
    FROM public.team_members tm
    JOIN public.users u
      ON u.id = tm.user_id
     AND u.tenant_id = tm.tenant_id
    WHERE tm.tenant_id = c.tenant_id
      AND tm.user_id::TEXT = c.uploaded_by_employee_id
      AND u.deleted_at IS NULL
    ORDER BY tm.is_primary DESC, tm.created_at ASC
    LIMIT 1
  ),
  f.team_id
)
FROM fallback_team f
WHERE c.tenant_id = f.tenant_id
  AND c.department_id IS NULL;

UPDATE public.contracts c
SET signatory_name = COALESCE(NULLIF(c.signatory_name, ''), 'Legacy Signatory'),
    signatory_designation = COALESCE(NULLIF(c.signatory_designation, ''), 'Legacy Designation'),
    signatory_email = COALESCE(
      NULLIF(LOWER(c.signatory_email), ''),
  NULLIF(LOWER(c.uploaded_by_email), '')
    ),
    background_of_request = COALESCE(
      NULLIF(c.background_of_request, ''),
      'Legacy contract intake record migrated before mandatory background capture.'
    ),
    request_created_at = COALESCE(c.request_created_at, c.created_at, NOW())
WHERE c.signatory_name IS NULL
   OR c.signatory_designation IS NULL
   OR c.signatory_email IS NULL
   OR c.background_of_request IS NULL
   OR c.request_created_at IS NULL;

UPDATE public.contracts c
SET signatory_email = 'legacy-signatory@nxtwave.co.in'
WHERE c.signatory_email IS NULL
  OR c.signatory_email !~* '^[A-Z0-9._%+-]+@[A-Z0-9.-]+\\.[A-Z]{2,}$';

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.contracts WHERE department_id IS NULL) THEN
    RAISE EXCEPTION 'Contract department backfill failed: department_id still NULL';
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'contracts_department_fk'
      AND conrelid = 'public.contracts'::regclass
  ) THEN
    ALTER TABLE public.contracts
      ADD CONSTRAINT contracts_department_fk
      FOREIGN KEY (department_id)
      REFERENCES public.teams(id)
      ON DELETE RESTRICT;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.enforce_contract_department_tenant_match()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  department_tenant_id UUID;
BEGIN
  SELECT tenant_id
  INTO department_tenant_id
  FROM public.teams
  WHERE id = NEW.department_id
    AND deleted_at IS NULL
  LIMIT 1;

  IF department_tenant_id IS NULL THEN
    RAISE EXCEPTION 'Department does not exist';
  END IF;

  IF department_tenant_id <> NEW.tenant_id THEN
    RAISE EXCEPTION 'Department must belong to same tenant as contract';
  END IF;

  RETURN NEW;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.triggers
    WHERE event_object_schema = 'public'
      AND event_object_table = 'contracts'
      AND trigger_name = 'enforce_contract_department_tenant_match_trigger'
  ) THEN
    CREATE TRIGGER enforce_contract_department_tenant_match_trigger
      BEFORE INSERT OR UPDATE OF department_id, tenant_id ON public.contracts
      FOR EACH ROW
      EXECUTE FUNCTION public.enforce_contract_department_tenant_match();
  END IF;
END $$;

ALTER TABLE public.contracts
  ALTER COLUMN signatory_name SET NOT NULL,
  ALTER COLUMN signatory_designation SET NOT NULL,
  ALTER COLUMN signatory_email SET NOT NULL,
  ALTER COLUMN background_of_request SET NOT NULL,
  ALTER COLUMN department_id SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'contracts_signatory_name_non_empty'
      AND conrelid = 'public.contracts'::regclass
  ) THEN
    ALTER TABLE public.contracts
      ADD CONSTRAINT contracts_signatory_name_non_empty
      CHECK (btrim(signatory_name) <> '');
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'contracts_signatory_designation_non_empty'
      AND conrelid = 'public.contracts'::regclass
  ) THEN
    ALTER TABLE public.contracts
      ADD CONSTRAINT contracts_signatory_designation_non_empty
      CHECK (btrim(signatory_designation) <> '');
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'contracts_background_non_empty'
      AND conrelid = 'public.contracts'::regclass
  ) THEN
    ALTER TABLE public.contracts
      ADD CONSTRAINT contracts_background_non_empty
      CHECK (btrim(background_of_request) <> '');
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'contracts_signatory_email_format_check'
      AND conrelid = 'public.contracts'::regclass
  ) THEN
    ALTER TABLE public.contracts
      ADD CONSTRAINT contracts_signatory_email_format_check
      CHECK (signatory_email ~* '^[A-Z0-9._%+-]+@[A-Z0-9.-]+\\.[A-Z]{2,}$');
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_contracts_department_id
  ON public.contracts(department_id)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_contracts_tat_deadline_at
  ON public.contracts(tat_deadline_at)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_contracts_tenant_tat_deadline_at
  ON public.contracts(tenant_id, tat_deadline_at)
  WHERE deleted_at IS NULL;

CREATE OR REPLACE FUNCTION public.enforce_contract_tat_mutability()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.tat_breached_at IS DISTINCT FROM OLD.tat_breached_at THEN
    RAISE EXCEPTION 'tat_breached_at is system-controlled and cannot be manually modified';
  END IF;

  IF NEW.tat_deadline_at IS DISTINCT FROM OLD.tat_deadline_at THEN
    IF NOT (
      OLD.tat_deadline_at IS NULL
      AND OLD.status = 'HOD_PENDING'
      AND NEW.status = 'LEGAL_PENDING'
      AND NEW.tat_deadline_at IS NOT NULL
    ) THEN
      RAISE EXCEPTION 'tat_deadline_at can only be set during HOD approval transition';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.triggers
    WHERE event_object_schema = 'public'
      AND event_object_table = 'contracts'
      AND trigger_name = 'enforce_contract_tat_mutability_trigger'
  ) THEN
    CREATE TRIGGER enforce_contract_tat_mutability_trigger
      BEFORE UPDATE ON public.contracts
      FOR EACH ROW
      EXECUTE FUNCTION public.enforce_contract_tat_mutability();
  END IF;
END $$;

DROP FUNCTION IF EXISTS public.create_contract_with_audit(
  UUID,
  UUID,
  TEXT,
  TEXT,
  TEXT,
  TEXT,
  TEXT,
  TEXT,
  BIGINT,
  TEXT
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
  department RECORD;
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

  IF p_signatory_name IS NULL OR btrim(p_signatory_name) = '' THEN
    RAISE EXCEPTION 'Signatory name is required';
  END IF;

  IF p_signatory_designation IS NULL OR btrim(p_signatory_designation) = '' THEN
    RAISE EXCEPTION 'Signatory designation is required';
  END IF;

  IF p_signatory_email IS NULL
     OR btrim(p_signatory_email) = ''
     OR p_signatory_email !~* '^[A-Z0-9._%+-]+@[A-Z0-9.-]+\\.[A-Z]{2,}$' THEN
    RAISE EXCEPTION 'Valid signatory email is required';
  END IF;

  IF p_background_of_request IS NULL OR btrim(p_background_of_request) = '' THEN
    RAISE EXCEPTION 'Background of request is required';
  END IF;

  SELECT t.id
  INTO department
  FROM public.teams t
  WHERE t.id = p_department_id
    AND t.tenant_id = p_tenant_id
    AND t.deleted_at IS NULL
  LIMIT 1;

  IF department IS NULL THEN
    RAISE EXCEPTION 'Department does not exist in tenant context';
  END IF;

  SELECT u.id, u.email, u.role, tm.team_id
  INTO uploader
  FROM public.users u
  LEFT JOIN LATERAL (
    SELECT tm.team_id
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
    p_file_mime_type,
    btrim(p_signatory_name),
    btrim(p_signatory_designation),
    lower(btrim(p_signatory_email)),
    btrim(p_background_of_request),
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
      'file_mime_type', p_file_mime_type,
      'signatory_name', btrim(p_signatory_name),
      'signatory_designation', btrim(p_signatory_designation),
      'signatory_email', lower(btrim(p_signatory_email)),
      'department_id', p_department_id,
      'budget_approved', COALESCE(p_budget_approved, FALSE)
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

REVOKE ALL ON FUNCTION public.create_contract_with_audit(
  UUID,
  UUID,
  TEXT,
  TEXT,
  TEXT,
  TEXT,
  TEXT,
  TEXT,
  BIGINT,
  TEXT,
  TEXT,
  TEXT,
  TEXT,
  TEXT,
  UUID,
  BOOLEAN
) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.create_contract_with_audit(
  UUID,
  UUID,
  TEXT,
  TEXT,
  TEXT,
  TEXT,
  TEXT,
  TEXT,
  BIGINT,
  TEXT,
  TEXT,
  TEXT,
  TEXT,
  TEXT,
  UUID,
  BOOLEAN
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
  c.department_id,
  c.signatory_name,
  c.signatory_designation,
  c.signatory_email,
  c.background_of_request,
  c.budget_approved,
  c.request_created_at,
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