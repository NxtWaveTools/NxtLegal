-- Extend audit event taxonomy for legal owner/collaborator assignment events

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'audit_event_type') THEN
    IF NOT EXISTS (
      SELECT 1
      FROM pg_enum
      WHERE enumtypid = 'audit_event_type'::regtype
        AND enumlabel = 'CONTRACT_ASSIGNEE_SET'
    ) THEN
      ALTER TYPE audit_event_type ADD VALUE 'CONTRACT_ASSIGNEE_SET';
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM pg_enum
      WHERE enumtypid = 'audit_event_type'::regtype
        AND enumlabel = 'CONTRACT_COLLABORATOR_ADDED'
    ) THEN
      ALTER TYPE audit_event_type ADD VALUE 'CONTRACT_COLLABORATOR_ADDED';
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM pg_enum
      WHERE enumtypid = 'audit_event_type'::regtype
        AND enumlabel = 'CONTRACT_COLLABORATOR_REMOVED'
    ) THEN
      ALTER TYPE audit_event_type ADD VALUE 'CONTRACT_COLLABORATOR_REMOVED';
    END IF;
  END IF;
END $$;
