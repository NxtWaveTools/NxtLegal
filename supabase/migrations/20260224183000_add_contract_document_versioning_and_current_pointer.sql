ALTER TABLE public.contract_documents
  ADD COLUMN IF NOT EXISTS version_number NUMERIC(10,1),
  ADD COLUMN IF NOT EXISTS uploaded_role TEXT,
  ADD COLUMN IF NOT EXISTS replaced_document_id UUID;

ALTER TABLE public.contract_documents
  ALTER COLUMN version_number SET DEFAULT 1.0,
  ALTER COLUMN uploaded_role SET DEFAULT 'SYSTEM';

UPDATE public.contract_documents
SET version_number = COALESCE(version_number, 1.0),
    uploaded_role = COALESCE(uploaded_role, 'SYSTEM')
WHERE version_number IS NULL
   OR uploaded_role IS NULL;

WITH primary_versions AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY tenant_id, contract_id
      ORDER BY created_at ASC, id ASC
    )::NUMERIC(10,1) AS resolved_version
  FROM public.contract_documents
  WHERE deleted_at IS NULL
    AND document_kind = 'PRIMARY'
)
UPDATE public.contract_documents documents
SET version_number = primary_versions.resolved_version
FROM primary_versions
WHERE documents.id = primary_versions.id;

ALTER TABLE public.contract_documents
  ALTER COLUMN version_number SET NOT NULL,
  ALTER COLUMN uploaded_role SET NOT NULL;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_indexes
    WHERE schemaname = 'public'
      AND indexname = 'idx_contract_documents_one_primary_per_contract'
  ) THEN
    DROP INDEX public.idx_contract_documents_one_primary_per_contract;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.table_constraints
    WHERE table_schema = 'public'
      AND table_name = 'contract_documents'
      AND constraint_name = 'contract_documents_version_number_major_check'
  ) THEN
    ALTER TABLE public.contract_documents
      ADD CONSTRAINT contract_documents_version_number_major_check
      CHECK (
        version_number >= 1.0
        AND version_number = trunc(version_number)
      );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.table_constraints
    WHERE table_schema = 'public'
      AND table_name = 'contract_documents'
      AND constraint_name = 'contract_documents_replaced_document_id_fkey'
  ) THEN
    ALTER TABLE public.contract_documents
      ADD CONSTRAINT contract_documents_replaced_document_id_fkey
      FOREIGN KEY (replaced_document_id)
      REFERENCES public.contract_documents(id)
      ON DELETE SET NULL;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS idx_contract_documents_primary_version_unique
  ON public.contract_documents (tenant_id, contract_id, version_number)
  WHERE deleted_at IS NULL
    AND document_kind = 'PRIMARY';

CREATE INDEX IF NOT EXISTS idx_contract_documents_current_lookup
  ON public.contract_documents (tenant_id, contract_id, document_kind, created_at DESC)
  WHERE deleted_at IS NULL;

ALTER TABLE public.contracts
  ADD COLUMN IF NOT EXISTS current_document_id UUID;

CREATE INDEX IF NOT EXISTS idx_contracts_current_document_id
  ON public.contracts (current_document_id)
  WHERE deleted_at IS NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.table_constraints
    WHERE table_schema = 'public'
      AND table_name = 'contracts'
      AND constraint_name = 'contracts_current_document_id_fkey'
  ) THEN
    ALTER TABLE public.contracts
      ADD CONSTRAINT contracts_current_document_id_fkey
      FOREIGN KEY (current_document_id)
      REFERENCES public.contract_documents(id)
      ON DELETE SET NULL;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.create_contract_primary_document_version(
  p_tenant_id UUID,
  p_contract_id UUID,
  p_display_name TEXT,
  p_file_name TEXT,
  p_file_path TEXT,
  p_file_size_bytes BIGINT,
  p_file_mime_type TEXT,
  p_uploaded_by_employee_id TEXT,
  p_uploaded_by_email TEXT,
  p_uploaded_by_role TEXT
)
RETURNS TABLE (
  document_id UUID,
  version_number NUMERIC(10,1),
  replaced_document_id UUID
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_contract contracts%ROWTYPE;
  v_latest_document contract_documents%ROWTYPE;
  v_next_version NUMERIC(10,1);
  v_new_document_id UUID;
BEGIN
  SELECT *
  INTO v_contract
  FROM public.contracts
  WHERE id = p_contract_id
    AND tenant_id = p_tenant_id
    AND deleted_at IS NULL
  FOR UPDATE;

  IF v_contract.id IS NULL THEN
    RAISE EXCEPTION 'Contract not found for tenant';
  END IF;

  IF v_contract.status = 'IN_SIGNATURE' THEN
    RAISE EXCEPTION 'CONTRACT_IN_SIGNATURE_REPLACEMENT_FORBIDDEN';
  END IF;

  SELECT *
  INTO v_latest_document
  FROM public.contract_documents
  WHERE tenant_id = p_tenant_id
    AND contract_id = p_contract_id
    AND document_kind = 'PRIMARY'
    AND deleted_at IS NULL
  ORDER BY version_number DESC, created_at DESC, id DESC
  LIMIT 1
  FOR UPDATE;

  v_next_version := COALESCE(v_latest_document.version_number, 0) + 1.0;

  INSERT INTO public.contract_documents (
    tenant_id,
    contract_id,
    document_kind,
    display_name,
    file_name,
    file_path,
    file_size_bytes,
    file_mime_type,
    uploaded_by_employee_id,
    uploaded_by_email,
    uploaded_role,
    version_number,
    replaced_document_id
  )
  VALUES (
    p_tenant_id,
    p_contract_id,
    'PRIMARY',
    p_display_name,
    p_file_name,
    p_file_path,
    p_file_size_bytes,
    p_file_mime_type,
    p_uploaded_by_employee_id,
    p_uploaded_by_email,
    p_uploaded_by_role,
    v_next_version,
    v_latest_document.id
  )
  RETURNING id
  INTO v_new_document_id;

  UPDATE public.contracts
  SET current_document_id = v_new_document_id,
      file_path = p_file_path,
      file_name = p_file_name,
      file_size_bytes = p_file_size_bytes,
      file_mime_type = p_file_mime_type,
      updated_at = NOW()
  WHERE tenant_id = p_tenant_id
    AND id = p_contract_id
    AND deleted_at IS NULL;

  RETURN QUERY
  SELECT v_new_document_id, v_next_version, v_latest_document.id;
END;
$$;

CREATE OR REPLACE FUNCTION public.validate_contract_current_document()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  matched_document RECORD;
BEGIN
  IF NEW.current_document_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT id
  INTO matched_document
  FROM public.contract_documents
  WHERE id = NEW.current_document_id
    AND tenant_id = NEW.tenant_id
    AND contract_id = NEW.id
    AND document_kind = 'PRIMARY'
    AND deleted_at IS NULL;

  IF matched_document.id IS NULL THEN
    RAISE EXCEPTION 'current_document_id must reference an active PRIMARY document for this contract and tenant';
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.sync_contract_current_document_from_primary_insert()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.document_kind = 'PRIMARY' AND NEW.deleted_at IS NULL THEN
    UPDATE public.contracts
    SET current_document_id = NEW.id,
        file_path = NEW.file_path,
        file_name = NEW.file_name,
        file_size_bytes = NEW.file_size_bytes,
        file_mime_type = NEW.file_mime_type,
        updated_at = NOW()
    WHERE tenant_id = NEW.tenant_id
      AND id = NEW.contract_id
      AND deleted_at IS NULL;
  END IF;

  RETURN NEW;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_trigger
    WHERE tgname = 'validate_contract_current_document_trigger'
  ) THEN
    CREATE TRIGGER validate_contract_current_document_trigger
      BEFORE INSERT OR UPDATE OF current_document_id
      ON public.contracts
      FOR EACH ROW
      EXECUTE FUNCTION public.validate_contract_current_document();
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_trigger
    WHERE tgname = 'sync_contract_current_document_from_primary_insert_trigger'
  ) THEN
    CREATE TRIGGER sync_contract_current_document_from_primary_insert_trigger
      AFTER INSERT ON public.contract_documents
      FOR EACH ROW
      EXECUTE FUNCTION public.sync_contract_current_document_from_primary_insert();
  END IF;
END $$;

WITH latest_primary AS (
  SELECT DISTINCT ON (tenant_id, contract_id)
    id,
    tenant_id,
    contract_id,
    file_path,
    file_name,
    file_size_bytes,
    file_mime_type
  FROM public.contract_documents
  WHERE deleted_at IS NULL
    AND document_kind = 'PRIMARY'
  ORDER BY tenant_id, contract_id, version_number DESC, created_at DESC, id DESC
)
UPDATE public.contracts contracts
SET current_document_id = latest_primary.id,
    file_path = latest_primary.file_path,
    file_name = latest_primary.file_name,
    file_size_bytes = latest_primary.file_size_bytes,
    file_mime_type = latest_primary.file_mime_type,
    updated_at = NOW()
FROM latest_primary
WHERE contracts.tenant_id = latest_primary.tenant_id
  AND contracts.id = latest_primary.contract_id
  AND contracts.deleted_at IS NULL
  AND (
    contracts.current_document_id IS DISTINCT FROM latest_primary.id
    OR contracts.file_path IS DISTINCT FROM latest_primary.file_path
    OR contracts.file_name IS DISTINCT FROM latest_primary.file_name
    OR contracts.file_size_bytes IS DISTINCT FROM latest_primary.file_size_bytes
    OR contracts.file_mime_type IS DISTINCT FROM latest_primary.file_mime_type
  );