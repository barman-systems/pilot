create or replace function public.dabbir_qa_consume_protected_share()
returns text
language plpgsql
security definer
set search_path = pg_catalog, public, vault
as $$
declare
  v_id uuid;
  v_secret text;
  v_created_at timestamptz;
begin
  select id, decrypted_secret, created_at
    into v_id, v_secret, v_created_at
  from vault.decrypted_secrets
  where name = 'dabbir_protected_qa_once'
  order by created_at desc
  limit 1;

  if v_id is null or coalesce(v_secret, '') = '' then
    raise exception 'DABBIR_PROTECTED_QA_SHARE_NOT_FOUND';
  end if;

  if v_created_at < now() - interval '2 hours' then
    delete from vault.secrets where id = v_id;
    raise exception 'DABBIR_PROTECTED_QA_SHARE_EXPIRED';
  end if;

  delete from vault.secrets where id = v_id;
  return v_secret;
end;
$$;

revoke all on function public.dabbir_qa_consume_protected_share() from public;
revoke all on function public.dabbir_qa_consume_protected_share() from anon;
revoke all on function public.dabbir_qa_consume_protected_share() from authenticated;
grant execute on function public.dabbir_qa_consume_protected_share() to service_role;
