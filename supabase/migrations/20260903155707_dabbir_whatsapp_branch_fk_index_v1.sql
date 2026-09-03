drop index if exists public.dabbir_whatsapp_connections_branch_idx;
create index if not exists dabbir_whatsapp_connections_branch_business_fk_idx
  on public.dabbir_whatsapp_connections(branch_id,business_id);
