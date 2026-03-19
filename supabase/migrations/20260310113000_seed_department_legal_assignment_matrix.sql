-- Seed department-to-legal assignment matrix for automated routing after HOD approval.
WITH mapping_input AS (
  SELECT *
  FROM (
    VALUES
      ('PRE- Program Registration Expert', 'Akash Garg'),
      ('Business Operations', 'Vidushi Jha'),
      ('Sales', 'Akash Garg'),
      ('Finance Operations', 'Pranjal Sharma'),
      ('Product Design', 'Madhur Goyal'),
      ('TA - Operations', 'Madhur Goyal'),
      ('Presales', 'Pranjal Sharma'),
      ('Brand Marketing', 'Vidushi Jha'),
      ('Facilities', 'Deepika Yadav'),
      ('NIAT Program Operations', 'Megha Ahuja'),
      ('NIAT MasterClass', 'Vidushi Jha'),
      ('HR Operations', 'Deepika Yadav'),
      ('Placements Support Team', 'Vidushi Jha'),
      ('University B2B Partnerships', 'Megha Ahuja'),
      ('Academy Student Success', 'Megha Ahuja'),
      ('Tech Team', 'Pranjal Sharma')
  ) AS t(department_name, legal_member_name)
),
resolved AS (
  SELECT
    teams.tenant_id,
    teams.id AS department_id,
    users.id AS user_id
  FROM mapping_input
  JOIN public.teams
    ON lower(trim(teams.name)) = lower(trim(mapping_input.department_name))
   AND teams.deleted_at IS NULL
  JOIN public.users
    ON lower(trim(users.full_name)) = lower(trim(mapping_input.legal_member_name))
   AND users.deleted_at IS NULL
   AND users.is_active = TRUE
   AND users.role = 'LEGAL_TEAM'
   AND users.tenant_id = teams.tenant_id
)
INSERT INTO public.department_legal_assignments (
  id,
  tenant_id,
  department_id,
  user_id,
  is_active,
  assigned_at,
  created_at,
  updated_at,
  revoked_at,
  revoked_by,
  deleted_at
)
SELECT
  gen_random_uuid(),
  resolved.tenant_id,
  resolved.department_id,
  resolved.user_id,
  TRUE,
  now(),
  now(),
  now(),
  NULL,
  NULL,
  NULL
FROM resolved
ON CONFLICT (tenant_id, department_id, user_id) DO UPDATE
SET
  is_active = TRUE,
  revoked_at = NULL,
  revoked_by = NULL,
  deleted_at = NULL,
  updated_at = now();
