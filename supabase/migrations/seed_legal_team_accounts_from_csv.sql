DO $$
DECLARE
  v_tenant_id UUID := '00000000-0000-0000-0000-000000000000';
BEGIN
  CREATE TEMP TABLE tmp_legal_accounts_seed (
    email TEXT NOT NULL,
    first_name TEXT,
    last_name TEXT,
    access_type TEXT
  ) ON COMMIT DROP;

  INSERT INTO tmp_legal_accounts_seed (email, first_name, last_name, access_type)
  VALUES
    ('rahul@nxtwave.tech', 'Rahul', 'Attuluri', 'Admin'),
    ('anupam@nxtwave.tech', 'Anupam', 'Pedarla', 'Admin'),
    ('sashank@nxtwave.tech', 'Sashank Reddy', 'Gujjula', 'Admin'),
    ('akhilesh.jhawar@nxtwave.in', 'Akhilesh', 'Jhawar', 'Admin'),
    ('alekhya.k@nxtwave.co.in', 'Radha Alekhya', 'Kommanaboina', 'Admin'),
    ('legal@nxtwave.co.in', 'Alias email id', NULL, 'Admin'),
    ('megha.ahuja@nxtwave.co.in', 'Megha', 'Ahuja', NULL),
    ('pranjal.sharma@nxtwave.co.in', 'Pranjal', 'Sharma', NULL),
    ('vidushi.jha@nxtwave.co.in', 'Vidushi', 'Jha', NULL),
    ('akash.garg@nxtwave.co.in', 'Akash', 'Garg', NULL),
    ('yadav.deepika@nxtwave.co.in', 'Deepika', 'Yadav', NULL),
    ('madhur.goyal@nxtwave.co.in', 'Madhur', 'Goyal', NULL);

  INSERT INTO public.users (
    tenant_id,
    email,
    full_name,
    password_hash,
    role,
    is_active,
    created_at,
    updated_at,
    deleted_at
  )
  SELECT
    v_tenant_id,
    LOWER(TRIM(seed.email)) AS email,
    CASE
      WHEN LOWER(TRIM(seed.email)) = 'legal@nxtwave.co.in' THEN 'Legal'
      ELSE NULLIF(TRIM(CONCAT(COALESCE(seed.first_name, ''), ' ', COALESCE(seed.last_name, ''))), '')
    END AS full_name,
    NULL AS password_hash,
    CASE
      WHEN LOWER(TRIM(COALESCE(seed.access_type, ''))) = 'admin' THEN 'ADMIN'
      ELSE 'LEGAL_TEAM'
    END AS role,
    TRUE AS is_active,
    NOW() AS created_at,
    NOW() AS updated_at,
    NULL AS deleted_at
  FROM tmp_legal_accounts_seed seed
  ON CONFLICT (tenant_id, email)
  DO UPDATE SET
    full_name = EXCLUDED.full_name,
    password_hash = NULL,
    role = EXCLUDED.role,
    is_active = TRUE,
    updated_at = NOW(),
    deleted_at = NULL;
END;
$$;
