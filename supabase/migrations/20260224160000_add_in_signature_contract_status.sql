DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.table_constraints
    WHERE table_schema = 'public'
      AND table_name = 'contracts'
      AND constraint_name = 'contracts_status_check'
  ) THEN
    ALTER TABLE public.contracts
      DROP CONSTRAINT contracts_status_check;
  END IF;
END $$;

ALTER TABLE public.contracts
  ADD CONSTRAINT contracts_status_check
  CHECK (
    status = ANY (
      ARRAY[
        'DRAFT'::text,
        'UPLOADED'::text,
        'HOD_PENDING'::text,
        'HOD_APPROVED'::text,
        'LEGAL_PENDING'::text,
        'LEGAL_QUERY'::text,
        'FINAL_APPROVED'::text,
        'IN_SIGNATURE'::text,
        'REJECTED'::text
      ]
    )
  );
