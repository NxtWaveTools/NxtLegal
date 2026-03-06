DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.table_constraints
    WHERE table_schema = 'public'
      AND table_name = 'contracts'
      AND constraint_name = 'contracts_status_check'
  ) THEN
    ALTER TABLE public.contracts
      DROP CONSTRAINT contracts_status_check;
  END IF;
END $$;

ALTER TABLE public.contracts
  ADD CONSTRAINT contracts_status_check
  CHECK (
    status = ANY (
      ARRAY[
        'DRAFT'::text,
        'UPLOADED'::text,
        'HOD_PENDING'::text,
        'UNDER_REVIEW'::text,
        'PENDING_WITH_INTERNAL_STAKEHOLDERS'::text,
        'PENDING_WITH_EXTERNAL_STAKEHOLDERS'::text,
        'OFFLINE_EXECUTION'::text,
        'ON_HOLD'::text,
        'COMPLETED'::text,
        'SIGNING'::text,
        'EXECUTED'::text,
        'VOID'::text,
        'REJECTED'::text
      ]
    )
  );

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'contract_transition_graph_status_check'
      AND conrelid = 'public.contract_transition_graph'::regclass
  ) THEN
    ALTER TABLE public.contract_transition_graph
      DROP CONSTRAINT contract_transition_graph_status_check;
  END IF;
END $$;

ALTER TABLE public.contract_transition_graph
  ADD CONSTRAINT contract_transition_graph_status_check CHECK (
    from_status IN (
      'DRAFT',
      'UPLOADED',
      'HOD_PENDING',
      'UNDER_REVIEW',
      'PENDING_WITH_INTERNAL_STAKEHOLDERS',
      'PENDING_WITH_EXTERNAL_STAKEHOLDERS',
      'OFFLINE_EXECUTION',
      'ON_HOLD',
      'COMPLETED',
      'SIGNING',
      'EXECUTED',
      'VOID',
      'REJECTED'
    )
    AND to_status IN (
      'DRAFT',
      'UPLOADED',
      'HOD_PENDING',
      'UNDER_REVIEW',
      'PENDING_WITH_INTERNAL_STAKEHOLDERS',
      'PENDING_WITH_EXTERNAL_STAKEHOLDERS',
      'OFFLINE_EXECUTION',
      'ON_HOLD',
      'COMPLETED',
      'SIGNING',
      'EXECUTED',
      'VOID',
      'REJECTED'
    )
  );
