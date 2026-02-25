CREATE TABLE IF NOT EXISTS public.contract_notification_deliveries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  contract_id UUID NOT NULL REFERENCES public.contracts(id) ON DELETE CASCADE,
  envelope_id TEXT,
  recipient_email TEXT NOT NULL,
  channel TEXT NOT NULL,
  notification_type TEXT NOT NULL,
  template_id INTEGER NOT NULL,
  provider_name TEXT NOT NULL,
  provider_message_id TEXT,
  status TEXT NOT NULL,
  retry_count INTEGER NOT NULL DEFAULT 0,
  max_retries INTEGER NOT NULL DEFAULT 2,
  next_retry_at TIMESTAMPTZ,
  last_error TEXT,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT contract_notification_deliveries_channel_check CHECK (channel IN ('EMAIL')),
  CONSTRAINT contract_notification_deliveries_type_check CHECK (notification_type IN ('SIGNATORY_LINK', 'SIGNING_COMPLETED')),
  CONSTRAINT contract_notification_deliveries_status_check CHECK (status IN ('SENT', 'FAILED')),
  CONSTRAINT contract_notification_deliveries_retry_count_check CHECK (retry_count >= 0),
  CONSTRAINT contract_notification_deliveries_max_retries_check CHECK (max_retries >= 0)
);

CREATE INDEX IF NOT EXISTS idx_contract_notification_deliveries_contract_created
  ON public.contract_notification_deliveries (tenant_id, contract_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_contract_notification_deliveries_retry
  ON public.contract_notification_deliveries (tenant_id, status, next_retry_at)
  WHERE status = 'FAILED';

ALTER TABLE public.contract_notification_deliveries ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'contract_notification_deliveries'
      AND policyname = 'contract_notification_deliveries_tenant_isolation'
  ) THEN
    CREATE POLICY "contract_notification_deliveries_tenant_isolation"
      ON public.contract_notification_deliveries
      FOR ALL
      USING (tenant_id = (auth.jwt() ->> 'tenant_id')::UUID)
      WITH CHECK (tenant_id = (auth.jwt() ->> 'tenant_id')::UUID);
  END IF;
END $$;