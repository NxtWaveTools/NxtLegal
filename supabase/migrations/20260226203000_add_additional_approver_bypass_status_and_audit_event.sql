DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.table_constraints
    WHERE table_schema = 'public'
      AND table_name = 'contract_additional_approvers'
      AND constraint_name = 'contract_additional_approvers_status_check'
  ) THEN
    ALTER TABLE public.contract_additional_approvers
      DROP CONSTRAINT contract_additional_approvers_status_check;
  END IF;
END $$;

ALTER TABLE public.contract_additional_approvers
  ADD CONSTRAINT contract_additional_approvers_status_check
  CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED', 'BYPASSED'));

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'audit_event_type') THEN
    IF NOT EXISTS (
      SELECT 1
      FROM pg_enum
      WHERE enumtypid = 'audit_event_type'::regtype
        AND enumlabel = 'CONTRACT_APPROVER_BYPASSED'
    ) THEN
      ALTER TYPE public.audit_event_type ADD VALUE 'CONTRACT_APPROVER_BYPASSED';
    END IF;
  END IF;
END $$;