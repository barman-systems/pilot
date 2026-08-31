-- Match DABBIR's fail-closed tenant-table posture: table owners must not bypass RLS.
alter table public.dabbir_business_branches force row level security;
