ALTER TABLE public.contract_signatories
  ADD COLUMN IF NOT EXISTS recipient_type TEXT NOT NULL DEFAULT 'EXTERNAL',
  ADD COLUMN IF NOT EXISTS routing_order INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS field_config JSONB NOT NULL DEFAULT '[]'::jsonb;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.table_constraints
    WHERE table_schema = 'public'
      AND table_name = 'contract_signatories'
      AND constraint_name = 'contract_signatories_recipient_type_check'
  ) THEN
    ALTER TABLE public.contract_signatories
      ADD CONSTRAINT contract_signatories_recipient_type_check
      CHECK (recipient_type IN ('INTERNAL', 'EXTERNAL'));
  END IF;
END $$;

DROP INDEX IF EXISTS public.idx_contract_signatories_envelope_unique;

CREATE UNIQUE INDEX IF NOT EXISTS idx_contract_signatories_envelope_recipient_unique
  ON public.contract_signatories (tenant_id, docusign_envelope_id, docusign_recipient_id)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_contract_signatories_routing_order
  ON public.contract_signatories (tenant_id, contract_id, routing_order, created_at DESC)
  WHERE deleted_at IS NULL;