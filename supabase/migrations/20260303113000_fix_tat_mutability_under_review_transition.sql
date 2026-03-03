-- Allow TAT deadline mutation for current HOD approval transition status.
-- Legacy logic expected HOD_PENDING -> LEGAL_PENDING, but current workflow uses HOD_PENDING -> UNDER_REVIEW.

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
      AND NEW.status IN ('UNDER_REVIEW', 'LEGAL_PENDING')
      AND NEW.tat_deadline_at IS NOT NULL
    ) THEN
      RAISE EXCEPTION 'tat_deadline_at can only be set during HOD approval transition';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;
