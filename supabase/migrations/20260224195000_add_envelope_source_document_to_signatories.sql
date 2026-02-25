ALTER TABLE public.contract_signatories
  ADD COLUMN IF NOT EXISTS envelope_source_document_id UUID;

UPDATE public.contract_signatories AS signatories
SET envelope_source_document_id = contracts.current_document_id
FROM public.contracts AS contracts
WHERE signatories.tenant_id = contracts.tenant_id
  AND signatories.contract_id = contracts.id
  AND signatories.envelope_source_document_id IS NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.table_constraints
    WHERE table_schema = 'public'
      AND table_name = 'contract_signatories'
      AND constraint_name = 'contract_signatories_envelope_source_document_fk'
  ) THEN
    ALTER TABLE public.contract_signatories
      ADD CONSTRAINT contract_signatories_envelope_source_document_fk
      FOREIGN KEY (envelope_source_document_id)
      REFERENCES public.contract_documents(id)
      ON DELETE RESTRICT;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_contract_signatories_envelope_source_document
  ON public.contract_signatories (tenant_id, envelope_source_document_id)
  WHERE deleted_at IS NULL;
