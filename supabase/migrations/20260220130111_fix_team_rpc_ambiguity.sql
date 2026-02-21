-- Reconstructed from live migration history: remove ambiguous overloads for replace_primary_team_member

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = 'replace_primary_team_member'
      AND pg_get_function_identity_arguments(p.oid) = 'p_tenant_id uuid, p_team_id uuid, p_new_user_id uuid, p_role_type text, p_actor_user_id uuid, p_actor_email text, p_actor_role text'
  ) THEN
    DROP FUNCTION public.replace_primary_team_member(UUID, UUID, UUID, TEXT, UUID, TEXT, TEXT);
  END IF;
END $$;

REVOKE ALL ON FUNCTION public.replace_primary_team_member(UUID, UUID, UUID, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.replace_primary_team_member(UUID, UUID, UUID, TEXT, TEXT, TEXT, TEXT) TO service_role;