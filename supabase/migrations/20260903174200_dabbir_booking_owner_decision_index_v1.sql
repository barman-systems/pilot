create index if not exists dabbir_appointments_owner_decided_by_idx
  on public.dabbir_appointments(owner_decided_by)
  where owner_decided_by is not null;
