alter table public.contracts
  add column if not exists legal_effective_date date,
  add column if not exists legal_termination_date date,
  add column if not exists legal_notice_period text,
  add column if not exists legal_auto_renewal boolean;