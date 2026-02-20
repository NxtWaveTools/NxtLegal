-- Restrict HOD bypass transition usage to LEGAL_TEAM and ADMIN roles only.
-- This preserves the transition edge while removing HOD/POC bypass capability.

update public.contract_transition_graph
set allowed_roles = array['LEGAL_TEAM', 'ADMIN']::text[]
where trigger_action = 'hod.bypass'
  and from_status = 'HOD_PENDING'
  and is_active = true
  and (
    tenant_id = '00000000-0000-0000-0000-000000000000'
    or tenant_id is not null
  );
