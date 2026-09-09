do $$
declare
  r record;
  v_columns text;
  v_index_name text;
begin
  for r in
    select con.oid, n.nspname as schema_name, c.relname as table_name, con.conname, con.conrelid, con.conkey
    from pg_constraint con
    join pg_class c on c.oid=con.conrelid
    join pg_namespace n on n.oid=c.relnamespace
    where con.contype='f'
      and n.nspname in ('public','dabbir_private')
      and not exists (
        select 1
        from pg_index i
        where i.indrelid=con.conrelid
          and i.indisvalid
          and i.indisready
          and (
            select array_agg(k order by ord)
            from unnest(i.indkey::smallint[]) with ordinality x(k,ord)
            where ord<=array_length(con.conkey,1)
          ) = con.conkey
      )
    order by n.nspname,c.relname,con.conname
  loop
    select string_agg(quote_ident(a.attname),', ' order by u.ord)
      into v_columns
    from unnest(r.conkey) with ordinality u(attnum,ord)
    join pg_attribute a on a.attrelid=r.conrelid and a.attnum=u.attnum;

    v_index_name := 'dabbir_fk_' || substr(md5(r.schema_name || '.' || r.table_name || '.' || r.conname),1,24);
    execute format('create index if not exists %I on %I.%I (%s)',v_index_name,r.schema_name,r.table_name,v_columns);
  end loop;
end
$$;
