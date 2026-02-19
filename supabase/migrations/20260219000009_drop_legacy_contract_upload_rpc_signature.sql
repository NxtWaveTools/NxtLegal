-- Remove legacy create_contract_with_audit overload without actor role
-- to enforce actor metadata persistence on all contract uploads.

DROP FUNCTION IF EXISTS public.create_contract_with_audit(
  UUID,
  UUID,
  TEXT,
  TEXT,
  TEXT,
  TEXT,
  TEXT,
  BIGINT,
  TEXT
);
