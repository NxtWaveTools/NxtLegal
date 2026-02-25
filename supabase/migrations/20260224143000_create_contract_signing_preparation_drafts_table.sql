CREATE TABLE IF NOT EXISTS public.contract_signing_preparation_drafts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  contract_id UUID NOT NULL REFERENCES public.contracts(id) ON DELETE CASCADE,
  recipients JSONB NOT NULL DEFAULT '[]'::jsonb,
  fields JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_by_employee_id TEXT NOT NULL,
  updated_by_employee_id TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT contract_signing_preparation_drafts_unique UNIQUE (tenant_id, contract_id),
  CONSTRAINT contract_signing_preparation_drafts_recipients_array CHECK (jsonb_typeof(recipients) = 'array'),
  CONSTRAINT contract_signing_preparation_drafts_fields_array CHECK (jsonb_typeof(fields) = 'array')
);

CREATE INDEX IF NOT EXISTS idx_contract_signing_preparation_drafts_contract
  ON public.contract_signing_preparation_drafts (tenant_id, contract_id);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.triggers
    WHERE event_object_table = 'contract_signing_preparation_drafts'
      AND trigger_name = 'update_contract_signing_preparation_drafts_updated_at'
  ) THEN
    CREATE TRIGGER update_contract_signing_preparation_drafts_updated_at
      BEFORE UPDATE ON public.contract_signing_preparation_drafts
      FOR EACH ROW
      EXECUTE FUNCTION public.update_updated_at_column();
  END IF;
END $$;

ALTER TABLE public.contract_signing_preparation_drafts ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'contract_signing_preparation_drafts'
      AND policyname = 'contract_signing_preparation_drafts_tenant_isolation'
  ) THEN
    CREATE POLICY "contract_signing_preparation_drafts_tenant_isolation"
      ON public.contract_signing_preparation_drafts
      FOR ALL
      USING (tenant_id = (auth.jwt() ->> 'tenant_id')::UUID)
      WITH CHECK (tenant_id = (auth.jwt() ->> 'tenant_id')::UUID);
  END IF;
END $$;
