-- Create tenant-scoped contract types and enforce contract_type_id on contracts

CREATE TABLE IF NOT EXISTS public.contract_types (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  normalized_name TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  CONSTRAINT contract_types_name_non_empty CHECK (btrim(name) <> ''),
  CONSTRAINT contract_types_normalized_name_non_empty CHECK (btrim(normalized_name) <> ''),
  CONSTRAINT contract_types_tenant_normalized_unique UNIQUE (tenant_id, normalized_name),
  CONSTRAINT contract_types_tenant_id_id_unique UNIQUE (tenant_id, id)
);

CREATE INDEX IF NOT EXISTS idx_contract_types_tenant_active
  ON public.contract_types(tenant_id, is_active)
  WHERE deleted_at IS NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.triggers
    WHERE event_object_schema = 'public'
      AND event_object_table = 'contract_types'
      AND trigger_name = 'update_contract_types_updated_at'
  ) THEN
    CREATE TRIGGER update_contract_types_updated_at
      BEFORE UPDATE ON public.contract_types
      FOR EACH ROW
      EXECUTE FUNCTION public.update_updated_at_column();
  END IF;
END $$;

ALTER TABLE public.contract_types ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'contract_types'
      AND policyname = 'contract_types_tenant_isolation'
  ) THEN
    CREATE POLICY "contract_types_tenant_isolation" ON public.contract_types
      FOR ALL
      USING (tenant_id = (auth.jwt() ->> 'tenant_id')::UUID)
      WITH CHECK (tenant_id = (auth.jwt() ->> 'tenant_id')::UUID);
  END IF;
END $$;

WITH contract_type_seed(name, normalized_name) AS (
  VALUES
    ('MSA', 'msa'),
    ('NDA', 'nda'),
    ('Purchase Order', 'purchase_order'),
    ('Terms and Conditions', 'terms_and_conditions'),
    ('NIAT Service Agreement', 'niat_service_agreement'),
    ('Retainer Agreement', 'retainer_agreement'),
    ('Letter of Engagement', 'letter_of_engagement'),
    ('Letter of Intent', 'letter_of_intent'),
    ('NIAT University Partnership MOU', 'niat_university_partnership_mou'),
    ('Rental Agreement', 'rental_agreement'),
    ('Leave and License Agreement', 'leave_and_license_agreement'),
    ('Service Agreement', 'service_agreement'),
    ('NIAT University Partnership - Service Agreement', 'niat_university_partnership_service_agreement'),
    ('MOU', 'mou'),
    ('Work Order for Designs', 'work_order_for_designs'),
    ('Fitout Agreement', 'fitout_agreement'),
    ('LOE for Retainership (Marketing Agency)', 'loe_for_retainership_marketing_agency'),
    ('LOI for NIAT Experience Centre', 'loi_for_niat_experience_centre'),
    ('Escrow Agreement', 'escrow_agreement'),
    ('Legal Opinion', 'legal_opinion'),
    ('Board Meeting Documents', 'board_meeting_documents')
)
INSERT INTO public.contract_types (tenant_id, name, normalized_name, is_active)
SELECT t.id, s.name, s.normalized_name, TRUE
FROM public.tenants t
CROSS JOIN contract_type_seed s
WHERE t.deleted_at IS NULL
ON CONFLICT (tenant_id, normalized_name) DO UPDATE
SET name = EXCLUDED.name,
    is_active = TRUE,
    deleted_at = NULL;

ALTER TABLE public.contracts
  ADD COLUMN IF NOT EXISTS contract_type_id UUID;

WITH inferred_types AS (
  SELECT
    c.id AS contract_id,
    c.tenant_id,
    lower(regexp_replace(trim(split_part(c.title, '-', 1)), '[^a-zA-Z0-9]+', '_', 'g')) AS inferred_normalized_name
  FROM public.contracts c
  WHERE c.contract_type_id IS NULL
),
matched_types AS (
  SELECT i.contract_id, ct.id AS contract_type_id
  FROM inferred_types i
  JOIN public.contract_types ct
    ON ct.tenant_id = i.tenant_id
   AND ct.normalized_name = i.inferred_normalized_name
   AND ct.deleted_at IS NULL
)
UPDATE public.contracts c
SET contract_type_id = m.contract_type_id
FROM matched_types m
WHERE c.id = m.contract_id
  AND c.contract_type_id IS NULL;

WITH tenant_default_contract_type AS (
  SELECT DISTINCT ON (ct.tenant_id)
    ct.tenant_id,
    ct.id AS contract_type_id
  FROM public.contract_types ct
  WHERE ct.deleted_at IS NULL
  ORDER BY ct.tenant_id, ct.created_at ASC
)
UPDATE public.contracts c
SET contract_type_id = d.contract_type_id
FROM tenant_default_contract_type d
WHERE c.tenant_id = d.tenant_id
  AND c.contract_type_id IS NULL;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.contracts WHERE contract_type_id IS NULL) THEN
    RAISE EXCEPTION 'Contract type backfill failed: contract_type_id is NULL for existing rows';
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'contracts_contract_type_fk'
      AND conrelid = 'public.contracts'::regclass
  ) THEN
    ALTER TABLE public.contracts
      ADD CONSTRAINT contracts_contract_type_fk
      FOREIGN KEY (tenant_id, contract_type_id)
      REFERENCES public.contract_types(tenant_id, id)
      ON DELETE RESTRICT;
  END IF;
END $$;

ALTER TABLE public.contracts
  ALTER COLUMN contract_type_id SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_contracts_tenant_contract_type
  ON public.contracts(tenant_id, contract_type_id)
  WHERE deleted_at IS NULL;