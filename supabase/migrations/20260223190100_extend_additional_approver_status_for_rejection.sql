-- Extend additional approver statuses to support explicit rejection workflow

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'contract_additional_approvers_status_check'
  ) THEN
    ALTER TABLE contract_additional_approvers
      DROP CONSTRAINT contract_additional_approvers_status_check;
  END IF;
END $$;

ALTER TABLE contract_additional_approvers
  ADD CONSTRAINT contract_additional_approvers_status_check
  CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED'));
