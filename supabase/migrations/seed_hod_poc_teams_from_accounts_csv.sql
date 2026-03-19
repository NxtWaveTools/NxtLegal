DO $$
DECLARE
  v_tenant_id UUID := '00000000-0000-0000-0000-000000000000';
  v_now TIMESTAMPTZ := NOW();
  v_users_has_team_id BOOLEAN := FALSE;
  rec RECORD;
  v_team_id UUID;
  v_hod_user_id UUID;
  v_poc_user_id UUID;
BEGIN
  SELECT EXISTS (
    SELECT 1
    FROM information_schema.columns c
    WHERE c.table_schema = 'public'
      AND c.table_name = 'users'
      AND c.column_name = 'team_id'
  )
  INTO v_users_has_team_id;

  CREATE TEMP TABLE tmp_hod_poc_seed (
    team_name TEXT NOT NULL,
    hod_name TEXT NOT NULL,
    hod_email TEXT NOT NULL,
    poc_name TEXT NOT NULL,
    poc_email TEXT NOT NULL
  ) ON COMMIT DROP;

  INSERT INTO tmp_hod_poc_seed (team_name, hod_name, hod_email, poc_name, poc_email)
  VALUES
    ('PRE- Program Registration Expert', 'Anil Kuman Ganguri', 'anil@nxtwave.tech', 'Romya Agarwal', 'romya.agarwal@nxtwave.co.in'),
    ('Business Operations', 'Shivam Singh', 'shivam.singh@nxtwave.tech', 'Vineel Kumar Erninti', 'vineelkumar.erninti@nxtwave.co.in'),
    ('Sales', 'Sumanth Reddy', 'sumanth@nxtwave.tech', 'Hemanth Pidugu', 'hemanth.pidugu@nxtwave.tech'),
    ('Finance Operations', 'Akhilesh Jhawar', 'akhilesh.jhawar@nxtwave.in', 'Hemanth Kothuru', 'hemanth.kothuru@nxtwave.co.in'),
    ('Product Design', 'Aman Maheshwari', 'aman.maheshwari@nxtwave.co.in', 'Nandigam Sivani Sanjana', 'nandigam.sivanisanjana@nxtwave.co.in'),
    ('TA - Operations', 'Hari Haran Gorijavola', 'hari@nxtwave.tech', 'Mohammad Arifulla Gori', 'arifulla.mohammad@nxtwave.co.in'),
    ('Presales', 'Shiva Shanker Reddy Devasani (NW0000302)', 'shanker@nxtwave.tech', 'Abidhusain R Sunagad', 'abidhusain.r@nxtwave.co.in'),
    ('Brand Marketing', 'Nikita Aggarwal', 'nikita.aggarwal@nxtwave.co.in', 'Adhiraj Singh', 'adhiraj.singh@nxtwave.co.in'),
    ('Facilities', 'Bala Bhaskar', 'balabhaskar@nxtwave.co.in', 'Siva Prasad Chary', 'facilities_nxtwave@nxtwave.co.in'),
    ('NIAT Program Operations', 'Pavan Reddy Dharma', 'pavan.dharma@nxtwave.tech', 'Anushka Biswas', 'anushka.biswas@nxtwave.co.in'),
    ('NIAT MasterClass', 'Akhil Jogiparthi', 'akhil@nxtwave.tech', 'Charan Mokara', 'mokara.charankumar@nxtwave.co.in'),
    ('Academy Student Success', 'Vamshi Gadagoju', 'vamshi@nxtwave.tech', 'Bhavani Koppada', 'bhavani.koppada@nxtwave.co.in'),
    ('HR Operations', 'Radha Alekhya Kommanaboina', 'alekhya.k@nxtwave.co.in', 'Divya Sri Nandigam', 'hr@nxtwave.tech'),
    ('Placements Support Team', 'Girish Akash', 'girish@nxtwave.tech', 'Hemanth Peddinti', 'hemanth.peddinti@nxtwave.co.in'),
    ('University B2B Partnerships', 'Varshith', 'varshith@nxtwave.tech', 'Aryabo Bannerjee', 'aryabo.banerjee@nxtwave.co.in'),
    ('Tech Team', 'Revanth', 'revanth@nxtwave.tech', 'Tallaparthi Dinesh Hanumnathkumar', 'tallaparthi.dineshhanumnathkumar@nxtwave.co.in');

  FOR rec IN
    SELECT
      TRIM(team_name) AS team_name,
      TRIM(hod_name) AS hod_name,
      LOWER(TRIM(hod_email)) AS hod_email,
      TRIM(poc_name) AS poc_name,
      LOWER(TRIM(poc_email)) AS poc_email
    FROM tmp_hod_poc_seed
  LOOP
    SELECT t.id
    INTO v_team_id
    FROM public.teams t
    WHERE t.tenant_id = v_tenant_id
      AND LOWER(TRIM(t.name)) = LOWER(rec.team_name)
    ORDER BY t.created_at DESC, t.id DESC
    LIMIT 1;

    IF v_team_id IS NULL THEN
      INSERT INTO public.teams (
        tenant_id,
        name,
        poc_email,
        hod_email,
        poc_name,
        hod_name,
        is_active,
        created_at,
        updated_at,
        deleted_at
      )
      VALUES (
        v_tenant_id,
        rec.team_name,
        rec.poc_email,
        rec.hod_email,
        rec.poc_name,
        rec.hod_name,
        TRUE,
        v_now,
        v_now,
        NULL
      )
      RETURNING id INTO v_team_id;
    ELSE
      UPDATE public.teams
      SET
        name = rec.team_name,
        poc_email = rec.poc_email,
        hod_email = rec.hod_email,
        poc_name = rec.poc_name,
        hod_name = rec.hod_name,
        is_active = TRUE,
        updated_at = v_now,
        deleted_at = NULL
      WHERE id = v_team_id;
    END IF;

    SELECT u.id
    INTO v_hod_user_id
    FROM public.users u
    WHERE u.tenant_id = v_tenant_id
      AND LOWER(TRIM(u.email)) = rec.hod_email
    ORDER BY u.created_at DESC, u.id DESC
    LIMIT 1;

    IF v_hod_user_id IS NULL THEN
      IF v_users_has_team_id THEN
        INSERT INTO public.users (
          tenant_id,
          email,
          full_name,
          password_hash,
          role,
          team_id,
          is_active,
          created_at,
          updated_at,
          deleted_at
        )
        VALUES (
          v_tenant_id,
          rec.hod_email,
          rec.hod_name,
          NULL,
          'HOD',
          v_team_id,
          TRUE,
          v_now,
          v_now,
          NULL
        )
        RETURNING id INTO v_hod_user_id;
      ELSE
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
        VALUES (
          v_tenant_id,
          rec.hod_email,
          rec.hod_name,
          NULL,
          'HOD',
          TRUE,
          v_now,
          v_now,
          NULL
        )
        RETURNING id INTO v_hod_user_id;
      END IF;
    ELSE
      IF v_users_has_team_id THEN
        UPDATE public.users
        SET
          email = rec.hod_email,
          full_name = rec.hod_name,
          password_hash = NULL,
          role = 'HOD',
          team_id = v_team_id,
          is_active = TRUE,
          updated_at = v_now,
          deleted_at = NULL
        WHERE id = v_hod_user_id;
      ELSE
        UPDATE public.users
        SET
          email = rec.hod_email,
          full_name = rec.hod_name,
          password_hash = NULL,
          role = 'HOD',
          is_active = TRUE,
          updated_at = v_now,
          deleted_at = NULL
        WHERE id = v_hod_user_id;
      END IF;
    END IF;

    SELECT u.id
    INTO v_poc_user_id
    FROM public.users u
    WHERE u.tenant_id = v_tenant_id
      AND LOWER(TRIM(u.email)) = rec.poc_email
    ORDER BY u.created_at DESC, u.id DESC
    LIMIT 1;

    IF v_poc_user_id IS NULL THEN
      IF v_users_has_team_id THEN
        INSERT INTO public.users (
          tenant_id,
          email,
          full_name,
          password_hash,
          role,
          team_id,
          is_active,
          created_at,
          updated_at,
          deleted_at
        )
        VALUES (
          v_tenant_id,
          rec.poc_email,
          rec.poc_name,
          NULL,
          'POC',
          v_team_id,
          TRUE,
          v_now,
          v_now,
          NULL
        )
        RETURNING id INTO v_poc_user_id;
      ELSE
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
        VALUES (
          v_tenant_id,
          rec.poc_email,
          rec.poc_name,
          NULL,
          'POC',
          TRUE,
          v_now,
          v_now,
          NULL
        )
        RETURNING id INTO v_poc_user_id;
      END IF;
    ELSE
      IF v_users_has_team_id THEN
        UPDATE public.users
        SET
          email = rec.poc_email,
          full_name = rec.poc_name,
          password_hash = NULL,
          role = 'POC',
          team_id = v_team_id,
          is_active = TRUE,
          updated_at = v_now,
          deleted_at = NULL
        WHERE id = v_poc_user_id;
      ELSE
        UPDATE public.users
        SET
          email = rec.poc_email,
          full_name = rec.poc_name,
          password_hash = NULL,
          role = 'POC',
          is_active = TRUE,
          updated_at = v_now,
          deleted_at = NULL
        WHERE id = v_poc_user_id;
      END IF;
    END IF;

    UPDATE public.team_role_mappings trm
    SET
      active_flag = FALSE,
      replaced_by = v_hod_user_id,
      replaced_at = v_now,
      updated_at = v_now,
      deleted_at = COALESCE(trm.deleted_at, v_now)
    WHERE trm.tenant_id = v_tenant_id
      AND trm.team_id = v_team_id
      AND trm.role_type = 'HOD'
      AND trm.active_flag = TRUE
      AND LOWER(TRIM(trm.email)) <> rec.hod_email;

    UPDATE public.team_role_mappings trm
    SET
      active_flag = TRUE,
      assigned_by = COALESCE(trm.assigned_by, v_hod_user_id),
      assigned_at = COALESCE(trm.assigned_at, v_now),
      replaced_by = NULL,
      replaced_at = NULL,
      updated_at = v_now,
      deleted_at = NULL
    WHERE trm.tenant_id = v_tenant_id
      AND trm.team_id = v_team_id
      AND trm.role_type = 'HOD'
      AND LOWER(TRIM(trm.email)) = rec.hod_email;

    IF NOT FOUND THEN
      INSERT INTO public.team_role_mappings (
        tenant_id,
        team_id,
        email,
        role_type,
        active_flag,
        assigned_by,
        assigned_at,
        created_at,
        updated_at,
        deleted_at
      )
      VALUES (
        v_tenant_id,
        v_team_id,
        rec.hod_email,
        'HOD',
        TRUE,
        v_hod_user_id,
        v_now,
        v_now,
        v_now,
        NULL
      );
    END IF;

    UPDATE public.team_role_mappings trm
    SET
      active_flag = FALSE,
      replaced_by = v_poc_user_id,
      replaced_at = v_now,
      updated_at = v_now,
      deleted_at = COALESCE(trm.deleted_at, v_now)
    WHERE trm.tenant_id = v_tenant_id
      AND trm.team_id = v_team_id
      AND trm.role_type = 'POC'
      AND trm.active_flag = TRUE
      AND LOWER(TRIM(trm.email)) <> rec.poc_email;

    UPDATE public.team_role_mappings trm
    SET
      active_flag = TRUE,
      assigned_by = COALESCE(trm.assigned_by, v_poc_user_id),
      assigned_at = COALESCE(trm.assigned_at, v_now),
      replaced_by = NULL,
      replaced_at = NULL,
      updated_at = v_now,
      deleted_at = NULL
    WHERE trm.tenant_id = v_tenant_id
      AND trm.team_id = v_team_id
      AND trm.role_type = 'POC'
      AND LOWER(TRIM(trm.email)) = rec.poc_email;

    IF NOT FOUND THEN
      INSERT INTO public.team_role_mappings (
        tenant_id,
        team_id,
        email,
        role_type,
        active_flag,
        assigned_by,
        assigned_at,
        created_at,
        updated_at,
        deleted_at
      )
      VALUES (
        v_tenant_id,
        v_team_id,
        rec.poc_email,
        'POC',
        TRUE,
        v_poc_user_id,
        v_now,
        v_now,
        v_now,
        NULL
      );
    END IF;
  END LOOP;
END;
$$;
