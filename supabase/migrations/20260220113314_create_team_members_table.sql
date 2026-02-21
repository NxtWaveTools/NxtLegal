-- Reconstructed from live migration history: create team_members table with tenant-isolated membership constraints

CREATE TABLE IF NOT EXISTS public.team_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  team_id UUID NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  role_type TEXT NOT NULL CHECK (role_type IN ('POC', 'HOD')),
  is_primary BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT team_members_user_unique UNIQUE (tenant_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_team_members_tenant_team
  ON public.team_members(tenant_id, team_id);

CREATE INDEX IF NOT EXISTS idx_team_members_tenant_user
  ON public.team_members(tenant_id, user_id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_team_members_primary_role
  ON public.team_members(tenant_id, team_id, role_type)
  WHERE is_primary = TRUE;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.triggers
    WHERE event_object_schema = 'public'
      AND event_object_table = 'team_members'
      AND trigger_name = 'update_team_members_updated_at'
  ) THEN
    CREATE TRIGGER update_team_members_updated_at
      BEFORE UPDATE ON public.team_members
      FOR EACH ROW
      EXECUTE FUNCTION public.update_updated_at_column();
  END IF;
END $$;

ALTER TABLE public.team_members ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'team_members'
      AND policyname = 'team_members_tenant_isolation'
  ) THEN
    CREATE POLICY "team_members_tenant_isolation" ON public.team_members
      FOR ALL
      USING (tenant_id = (auth.jwt() ->> 'tenant_id')::UUID)
      WITH CHECK (tenant_id = (auth.jwt() ->> 'tenant_id')::UUID);
  END IF;
END $$;