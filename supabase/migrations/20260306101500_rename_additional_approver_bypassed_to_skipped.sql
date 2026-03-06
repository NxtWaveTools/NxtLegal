UPDATE public.contract_additional_approvers
SET status = 'SKIPPED', updated_at = NOW()
WHERE status = 'BYPASSED';

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
  CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED', 'SKIPPED'));
