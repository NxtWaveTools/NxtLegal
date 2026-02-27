ALTER TABLE public.contracts
  ADD COLUMN IF NOT EXISTS upload_mode TEXT;

UPDATE public.contracts
SET upload_mode = 'DEFAULT'
WHERE upload_mode IS NULL;

UPDATE public.contracts c
SET upload_mode = UPPER(COALESCE(a.metadata->>'upload_mode', 'DEFAULT'))
FROM (
  SELECT DISTINCT ON (tenant_id, resource_id)
    tenant_id,
    resource_id,
    metadata
  FROM public.audit_logs
  WHERE resource_type = 'contract'
    AND action = 'contract.created'
  ORDER BY tenant_id, resource_id, created_at DESC
) a
WHERE c.tenant_id = a.tenant_id
  AND c.id::text = a.resource_id
  AND c.upload_mode = 'DEFAULT';

ALTER TABLE public.contracts
  ALTER COLUMN upload_mode SET DEFAULT 'DEFAULT';

ALTER TABLE public.contracts
  ALTER COLUMN upload_mode SET NOT NULL;

ALTER TABLE public.contracts
  DROP CONSTRAINT IF EXISTS contracts_upload_mode_check;

ALTER TABLE public.contracts
  ADD CONSTRAINT contracts_upload_mode_check
  CHECK (upload_mode IN ('DEFAULT', 'LEGAL_SEND_FOR_SIGNING'));

CREATE INDEX IF NOT EXISTS idx_contracts_tenant_upload_mode
  ON public.contracts (tenant_id, upload_mode)
  WHERE deleted_at IS NULL;
