-- Workflow stabilization: extend contract state machine with DRAFT/REJECTED and deterministic reject transitions

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'contracts_status_check'
      AND conrelid = 'public.contracts'::regclass
  ) THEN
    ALTER TABLE public.contracts DROP CONSTRAINT contracts_status_check;
  END IF;
END $$;

ALTER TABLE public.contracts
  ADD CONSTRAINT contracts_status_check CHECK (
    status IN (
      'DRAFT',
      'UPLOADED',
      'HOD_PENDING',
      'HOD_APPROVED',
      'LEGAL_PENDING',
      'LEGAL_QUERY',
      'FINAL_APPROVED',
      'REJECTED'
    )
  );

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'contract_transition_graph_status_check'
      AND conrelid = 'public.contract_transition_graph'::regclass
  ) THEN
    ALTER TABLE public.contract_transition_graph DROP CONSTRAINT contract_transition_graph_status_check;
  END IF;
END $$;

ALTER TABLE public.contract_transition_graph
  ADD CONSTRAINT contract_transition_graph_status_check CHECK (
    from_status IN (
      'DRAFT',
      'UPLOADED',
      'HOD_PENDING',
      'HOD_APPROVED',
      'LEGAL_PENDING',
      'LEGAL_QUERY',
      'FINAL_APPROVED',
      'REJECTED'
    )
    AND to_status IN (
      'DRAFT',
      'UPLOADED',
      'HOD_PENDING',
      'HOD_APPROVED',
      'LEGAL_PENDING',
      'LEGAL_QUERY',
      'FINAL_APPROVED',
      'REJECTED'
    )
  );

ALTER TABLE public.contracts
  ADD COLUMN IF NOT EXISTS workflow_stage TEXT NOT NULL DEFAULT 'ACTIVE';

INSERT INTO public.contract_transition_graph (tenant_id, from_status, to_status, trigger_action, allowed_roles, is_active)
VALUES
  ('00000000-0000-0000-0000-000000000000'::UUID, 'DRAFT', 'HOD_PENDING', 'system.route_to_hod', ARRAY['SYSTEM', 'ADMIN'], TRUE),
  ('00000000-0000-0000-0000-000000000000'::UUID, 'HOD_PENDING', 'REJECTED', 'hod.reject', ARRAY['HOD', 'ADMIN'], TRUE),
  ('00000000-0000-0000-0000-000000000000'::UUID, 'LEGAL_PENDING', 'REJECTED', 'legal.reject', ARRAY['LEGAL_TEAM', 'ADMIN'], TRUE)
ON CONFLICT (tenant_id, from_status, to_status, trigger_action) DO UPDATE
SET allowed_roles = EXCLUDED.allowed_roles,
    is_active = TRUE,
    updated_at = NOW();

UPDATE public.contract_transition_graph
SET is_active = FALSE,
    updated_at = NOW()
WHERE tenant_id = '00000000-0000-0000-0000-000000000000'::UUID
  AND from_status = 'LEGAL_QUERY'
  AND trigger_action = 'legal.query.reroute'
  AND to_status = 'LEGAL_QUERY'
  AND is_active = TRUE;

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
  END AS near_breach,
  c.department_id
FROM public.contracts c
WHERE c.deleted_at IS NULL;

GRANT SELECT ON public.contracts_repository_view TO service_role;
