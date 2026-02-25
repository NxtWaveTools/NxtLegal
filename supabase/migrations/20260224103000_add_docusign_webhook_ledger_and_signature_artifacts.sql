DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.table_constraints
    WHERE table_schema = 'public'
      AND table_name = 'contract_documents'
      AND constraint_name = 'contract_documents_kind_check'
  ) THEN
    ALTER TABLE public.contract_documents
      DROP CONSTRAINT contract_documents_kind_check;
  END IF;
END $$;

ALTER TABLE public.contract_documents
  ADD CONSTRAINT contract_documents_kind_check
  CHECK (
    document_kind IN (
      'PRIMARY',
      'COUNTERPARTY_SUPPORTING',
      'EXECUTED_CONTRACT',
      'AUDIT_CERTIFICATE'
    )
  );

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'audit_event_type') THEN
    IF NOT EXISTS (
      SELECT 1
      FROM pg_enum
      WHERE enumtypid = 'audit_event_type'::regtype
        AND enumlabel = 'CONTRACT_SIGNATORY_ADDED'
    ) THEN
      ALTER TYPE audit_event_type ADD VALUE 'CONTRACT_SIGNATORY_ADDED';
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM pg_enum
      WHERE enumtypid = 'audit_event_type'::regtype
        AND enumlabel = 'CONTRACT_SIGNATORY_SENT'
    ) THEN
      ALTER TYPE audit_event_type ADD VALUE 'CONTRACT_SIGNATORY_SENT';
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM pg_enum
      WHERE enumtypid = 'audit_event_type'::regtype
        AND enumlabel = 'CONTRACT_SIGNATORY_DELIVERED'
    ) THEN
      ALTER TYPE audit_event_type ADD VALUE 'CONTRACT_SIGNATORY_DELIVERED';
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM pg_enum
      WHERE enumtypid = 'audit_event_type'::regtype
        AND enumlabel = 'CONTRACT_SIGNATORY_VIEWED'
    ) THEN
      ALTER TYPE audit_event_type ADD VALUE 'CONTRACT_SIGNATORY_VIEWED';
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM pg_enum
      WHERE enumtypid = 'audit_event_type'::regtype
        AND enumlabel = 'CONTRACT_SIGNATORY_SIGNED'
    ) THEN
      ALTER TYPE audit_event_type ADD VALUE 'CONTRACT_SIGNATORY_SIGNED';
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM pg_enum
      WHERE enumtypid = 'audit_event_type'::regtype
        AND enumlabel = 'CONTRACT_SIGNATORY_COMPLETED'
    ) THEN
      ALTER TYPE audit_event_type ADD VALUE 'CONTRACT_SIGNATORY_COMPLETED';
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM pg_enum
      WHERE enumtypid = 'audit_event_type'::regtype
        AND enumlabel = 'CONTRACT_SIGNATORY_DECLINED'
    ) THEN
      ALTER TYPE audit_event_type ADD VALUE 'CONTRACT_SIGNATORY_DECLINED';
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM pg_enum
      WHERE enumtypid = 'audit_event_type'::regtype
        AND enumlabel = 'CONTRACT_SIGNATORY_EXPIRED'
    ) THEN
      ALTER TYPE audit_event_type ADD VALUE 'CONTRACT_SIGNATORY_EXPIRED';
    END IF;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.docusign_webhook_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  contract_id UUID NOT NULL REFERENCES public.contracts(id) ON DELETE CASCADE,
  envelope_id TEXT NOT NULL,
  recipient_email TEXT,
  event_type TEXT NOT NULL,
  event_key TEXT NOT NULL,
  signer_ip TEXT,
  payload JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_docusign_webhook_events_event_key
  ON public.docusign_webhook_events (tenant_id, event_key);

CREATE INDEX IF NOT EXISTS idx_docusign_webhook_events_contract_created
  ON public.docusign_webhook_events (tenant_id, contract_id, created_at DESC);

ALTER TABLE public.docusign_webhook_events ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'docusign_webhook_events'
      AND policyname = 'docusign_webhook_events_tenant_isolation'
  ) THEN
    CREATE POLICY "docusign_webhook_events_tenant_isolation"
      ON public.docusign_webhook_events
      FOR ALL
      USING (tenant_id = (auth.jwt() ->> 'tenant_id')::UUID)
      WITH CHECK (tenant_id = (auth.jwt() ->> 'tenant_id')::UUID);
  END IF;
END $$;