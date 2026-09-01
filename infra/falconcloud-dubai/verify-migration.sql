\pset tuples_only on
\pset format unaligned
select 'auth.users|' || count(*) from auth.users;
select 'storage.objects|' || count(*) from storage.objects;
select 'public.tables|' || count(*) from pg_tables where schemaname='public';
select 'dabbir_private.tables|' || count(*) from pg_tables where schemaname='dabbir_private';
select 'public.rows_estimate|' || coalesce(sum(c.reltuples::bigint),0) from pg_class c join pg_namespace n on n.oid=c.relnamespace where c.relkind='r' and n.nspname='public';
select 'dabbir_private.rows_estimate|' || coalesce(sum(c.reltuples::bigint),0) from pg_class c join pg_namespace n on n.oid=c.relnamespace where c.relkind='r' and n.nspname='dabbir_private';
select 'dabbir_customers|' || count(*) from public.dabbir_customers;
select 'dabbir_conversations|' || count(*) from public.dabbir_conversations;
select 'dabbir_messages|' || count(*) from public.dabbir_messages;
select 'dabbir_user_accounts|' || count(*) from public.dabbir_user_accounts;
select 'recovery_change_journal|' || count(*) from dabbir_private.recovery_change_journal;
select 'extensions|' || string_agg(extname || ':' || extversion, ',' order by extname) from pg_extension;
