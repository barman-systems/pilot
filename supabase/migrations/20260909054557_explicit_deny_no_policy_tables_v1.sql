do $$
declare r record;
begin
  for r in
    select n.nspname as schema_name,c.relname as table_name
    from pg_class c
    join pg_namespace n on n.oid=c.relnamespace
    where c.relkind in ('r','p')
      and c.relrowsecurity
      and n.nspname in ('public','dabbir_private')
      and not exists(select 1 from pg_policy p where p.polrelid=c.oid)
    order by n.nspname,c.relname
  loop
    execute format('revoke all on table %I.%I from anon, authenticated',r.schema_name,r.table_name);
    execute format('create policy dabbir_explicit_deny_client_v1 on %I.%I as restrictive for all to anon, authenticated using (false) with check (false)',r.schema_name,r.table_name);
  end loop;
end
$$;
