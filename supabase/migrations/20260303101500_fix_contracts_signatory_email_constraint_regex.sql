-- Fix malformed signatory email check regex on contracts table
-- Ensures valid emails like signatory@example.com are accepted.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE n.nspname = 'public'
      AND t.relname = 'contracts'
      AND c.conname = 'contracts_signatory_email_format_check'
  ) THEN
    ALTER TABLE public.contracts
      DROP CONSTRAINT contracts_signatory_email_format_check;
  END IF;

  ALTER TABLE public.contracts
    ADD CONSTRAINT contracts_signatory_email_format_check
    CHECK (
      signatory_email ~* '^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$'
      OR upper(btrim(signatory_email)) = 'NA'
    );
END $$;
