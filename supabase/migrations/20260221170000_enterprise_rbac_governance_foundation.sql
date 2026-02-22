-- Enterprise RBAC Governance Foundation (additive)
-- Adds token version support for immediate session invalidation,
-- DB-driven RBAC tables, and department role mapping with tenant isolation.

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS token_version INTEGER NOT NULL DEFAULT 0;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'users_token_version_non_negative'
      AND conrelid = 'public.users'::regclass
  ) THEN
    ALTER TABLE public.users
      ADD CONSTRAINT users_token_version_non_negative CHECK (token_version >= 0);
  END IF;
END $$;

ALTER TABLE public.users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE public.users
  ADD CONSTRAINT users_role_check
  CHECK (role IN ('USER', 'POC', 'HOD', 'LEGAL_TEAM', 'ADMIN', 'LEGAL_ADMIN', 'SUPER_ADMIN', 'SYSTEM'));

CREATE TABLE IF NOT EXISTS public.roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  role_key TEXT NOT NULL,
  display_name TEXT NOT NULL,
  description TEXT,
  is_system BOOLEAN NOT NULL DEFAULT FALSE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  CONSTRAINT roles_tenant_role_key_unique UNIQUE (tenant_id, role_key)
);

CREATE TABLE IF NOT EXISTS public.permissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  permission_key TEXT NOT NULL,
  module_name TEXT NOT NULL,
  description TEXT,
  is_system BOOLEAN NOT NULL DEFAULT TRUE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  CONSTRAINT permissions_tenant_permission_key_unique UNIQUE (tenant_id, permission_key)
);

CREATE TABLE IF NOT EXISTS public.role_permissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  role_id UUID NOT NULL REFERENCES public.roles(id) ON DELETE CASCADE,
  permission_id UUID NOT NULL REFERENCES public.permissions(id) ON DELETE CASCADE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  CONSTRAINT role_permissions_tenant_role_permission_unique UNIQUE (tenant_id, role_id, permission_id)
);

CREATE TABLE IF NOT EXISTS public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  role_id UUID NOT NULL REFERENCES public.roles(id) ON DELETE RESTRICT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  assigned_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  revoked_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  revoked_at TIMESTAMPTZ,
  deleted_at TIMESTAMPTZ
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_user_roles_active_unique
  ON public.user_roles (tenant_id, user_id, role_id)
  WHERE is_active = TRUE AND deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS public.department_role_map (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  department_id UUID NOT NULL REFERENCES public.teams(id) ON DELETE RESTRICT,
  role_id UUID NOT NULL REFERENCES public.roles(id) ON DELETE RESTRICT,
  user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  mapping_version INTEGER NOT NULL DEFAULT 1,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  effective_from TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  effective_to TIMESTAMPTZ,
  created_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  CONSTRAINT department_role_map_mapping_version_non_negative CHECK (mapping_version > 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_department_role_map_active_unique
  ON public.department_role_map (tenant_id, department_id, role_id)
  WHERE is_active = TRUE AND deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_roles_tenant_active
  ON public.roles (tenant_id, role_key)
  WHERE deleted_at IS NULL AND is_active = TRUE;

CREATE INDEX IF NOT EXISTS idx_permissions_tenant_active
  ON public.permissions (tenant_id, permission_key)
  WHERE deleted_at IS NULL AND is_active = TRUE;

CREATE INDEX IF NOT EXISTS idx_role_permissions_tenant_role
  ON public.role_permissions (tenant_id, role_id)
  WHERE deleted_at IS NULL AND is_active = TRUE;

CREATE INDEX IF NOT EXISTS idx_user_roles_tenant_user
  ON public.user_roles (tenant_id, user_id)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_department_role_map_tenant_department
  ON public.department_role_map (tenant_id, department_id)
  WHERE deleted_at IS NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.triggers
    WHERE event_object_schema = 'public'
      AND event_object_table = 'roles'
      AND trigger_name = 'update_roles_updated_at'
  ) THEN
    CREATE TRIGGER update_roles_updated_at
      BEFORE UPDATE ON public.roles
      FOR EACH ROW
      EXECUTE FUNCTION public.update_updated_at_column();
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.triggers
    WHERE event_object_schema = 'public'
      AND event_object_table = 'permissions'
      AND trigger_name = 'update_permissions_updated_at'
  ) THEN
    CREATE TRIGGER update_permissions_updated_at
      BEFORE UPDATE ON public.permissions
      FOR EACH ROW
      EXECUTE FUNCTION public.update_updated_at_column();
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.triggers
    WHERE event_object_schema = 'public'
      AND event_object_table = 'department_role_map'
      AND trigger_name = 'update_department_role_map_updated_at'
  ) THEN
    CREATE TRIGGER update_department_role_map_updated_at
      BEFORE UPDATE ON public.department_role_map
      FOR EACH ROW
      EXECUTE FUNCTION public.update_updated_at_column();
  END IF;
END $$;

ALTER TABLE public.roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.role_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.department_role_map ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'roles' AND policyname = 'roles_tenant_isolation'
  ) THEN
    CREATE POLICY "roles_tenant_isolation" ON public.roles
      FOR ALL
      USING (tenant_id = (auth.jwt() ->> 'tenant_id')::UUID)
      WITH CHECK (tenant_id = (auth.jwt() ->> 'tenant_id')::UUID);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'permissions' AND policyname = 'permissions_tenant_isolation'
  ) THEN
    CREATE POLICY "permissions_tenant_isolation" ON public.permissions
      FOR ALL
      USING (tenant_id = (auth.jwt() ->> 'tenant_id')::UUID)
      WITH CHECK (tenant_id = (auth.jwt() ->> 'tenant_id')::UUID);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'role_permissions' AND policyname = 'role_permissions_tenant_isolation'
  ) THEN
    CREATE POLICY "role_permissions_tenant_isolation" ON public.role_permissions
      FOR ALL
      USING (tenant_id = (auth.jwt() ->> 'tenant_id')::UUID)
      WITH CHECK (tenant_id = (auth.jwt() ->> 'tenant_id')::UUID);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'user_roles' AND policyname = 'user_roles_tenant_isolation'
  ) THEN
    CREATE POLICY "user_roles_tenant_isolation" ON public.user_roles
      FOR ALL
      USING (tenant_id = (auth.jwt() ->> 'tenant_id')::UUID)
      WITH CHECK (tenant_id = (auth.jwt() ->> 'tenant_id')::UUID);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'department_role_map' AND policyname = 'department_role_map_tenant_isolation'
  ) THEN
    CREATE POLICY "department_role_map_tenant_isolation" ON public.department_role_map
      FOR ALL
      USING (tenant_id = (auth.jwt() ->> 'tenant_id')::UUID)
      WITH CHECK (tenant_id = (auth.jwt() ->> 'tenant_id')::UUID);
  END IF;
END $$;

-- Seed baseline system roles for each tenant
INSERT INTO public.roles (tenant_id, role_key, display_name, description, is_system, is_active)
SELECT t.id, seed.role_key, seed.display_name, seed.description, TRUE, TRUE
FROM public.tenants t
CROSS JOIN (
  VALUES
    ('SUPER_ADMIN', 'Super Admin', 'Enterprise governance super administrator'),
    ('LEGAL_ADMIN', 'Legal Admin', 'Legal governance administrator'),
    ('ADMIN', 'Admin', 'Administrative role'),
    ('LEGAL_TEAM', 'Legal Team', 'Legal reviewer and approver'),
    ('HOD', 'Head of Department', 'Department approver'),
    ('POC', 'Point of Contact', 'Department requester'),
    ('USER', 'User', 'General user role')
) AS seed(role_key, display_name, description)
ON CONFLICT (tenant_id, role_key) DO NOTHING;

-- Seed baseline permissions for each tenant
INSERT INTO public.permissions (tenant_id, permission_key, module_name, description, is_system, is_active)
SELECT t.id, seed.permission_key, seed.module_name, seed.description, TRUE, TRUE
FROM public.tenants t
CROSS JOIN (
  VALUES
    ('admin:console:view', 'admin', 'Access admin console'),
    ('admin:teams:manage', 'admin', 'Manage departments/teams'),
    ('admin:users:manage', 'admin', 'Manage user lifecycle'),
    ('admin:roles:manage', 'admin', 'Manage role assignments'),
    ('admin:assignments:manage', 'admin', 'Manage HOD/POC/legal assignments'),
    ('admin:workflow:matrix:view', 'admin', 'View workflow assignment matrix'),
    ('admin:system:config:manage', 'admin', 'Manage system configuration'),
    ('admin:audit:view', 'admin', 'View immutable audit logs'),
    ('admin:sessions:revoke', 'admin', 'Revoke active sessions'),
    ('admin:departments:view:all', 'admin', 'View all departments'),
    ('admin:reports:view:all', 'admin', 'View enterprise reports')
) AS seed(permission_key, module_name, description)
ON CONFLICT (tenant_id, permission_key) DO NOTHING;

-- Link seeded admin permissions to LEGAL_ADMIN and SUPER_ADMIN roles
INSERT INTO public.role_permissions (tenant_id, role_id, permission_id, is_active)
SELECT r.tenant_id, r.id, p.id, TRUE
FROM public.roles r
JOIN public.permissions p
  ON p.tenant_id = r.tenant_id
 AND p.permission_key LIKE 'admin:%'
WHERE r.role_key IN ('SUPER_ADMIN', 'LEGAL_ADMIN')
ON CONFLICT (tenant_id, role_id, permission_id) DO NOTHING;
