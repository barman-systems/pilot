\set ON_ERROR_STOP on

-- Read-only migration verification. Run on source before export and target after restore.
-- No secrets or application data are printed.

select current_database() as database_name, version() as postgres_version;

with dabbir_tables as (
  select c.oid
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where c.relkind in ('r','p')
    and ((n.nspname = 'public' and c.relname like 'dabbir_%') or n.nspname = 'dabbir_private')
)
select
  (select count(*) from dabbir_tables) as dabbir_tables,
  (select count(*) from pg_policies where (schemaname='public' and tablename like 'dabbir_%') or schemaname='dabbir_private') as rls_policies,
  (select count(*) from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace where not t.tgisinternal and ((n.nspname='public' and c.relname like 'dabbir_%') or n.nspname='dabbir_private')) as triggers,
  (select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where p.prokind <> 'a' and ((n.nspname='public' and p.proname like 'dabbir_%') or n.nspname='dabbir_private')) as functions,
  (select count(*) from pg_indexes where (schemaname='public' and tablename like 'dabbir_%') or schemaname='dabbir_private') as indexes;

-- DABBIR customer/auth cardinality. These should match the source snapshot used for cutover.
select 'dabbir_user_accounts' as metric, count(*)::bigint as value from public.dabbir_user_accounts
union all select 'dabbir_businesses', count(*) from public.dabbir_businesses
union all select 'dabbir_memberships', count(*) from public.dabbir_memberships
union all select 'dabbir_customers', count(*) from public.dabbir_customers
union all select 'dabbir_orders', count(*) from public.dabbir_orders
union all select 'dabbir_appointments', count(*) from public.dabbir_appointments;

-- There must be no DABBIR FK dependency on unrelated application tables.
with dabbir_rel as (
  select c.oid
  from pg_class c join pg_namespace n on n.oid=c.relnamespace
  where c.relkind in ('r','p')
    and ((n.nspname='public' and c.relname like 'dabbir_%') or n.nspname='dabbir_private')
)
select ns.nspname as source_schema, src.relname as source_table,
       nt.nspname as external_schema, dst.relname as external_table, con.conname
from pg_constraint con
join pg_class src on src.oid=con.conrelid
join pg_namespace ns on ns.oid=src.relnamespace
join pg_class dst on dst.oid=con.confrelid
join pg_namespace nt on nt.oid=dst.relnamespace
where con.contype='f' and con.conrelid in (select oid from dabbir_rel)
  and not ((nt.nspname='public' and dst.relname like 'dabbir_%') or nt.nspname in ('dabbir_private','auth'))
order by 1,2;

-- These source-control functions are control-plane integrations, not UAE customer runtime.
-- They intentionally remain excluded unless the Barman control plane is later separated too.
select n.nspname as schema_name, p.proname as function_name
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where p.prokind <> 'a'
  and ((n.nspname='public' and p.proname like 'dabbir_%') or n.nspname='dabbir_private')
  and lower(pg_get_functiondef(p.oid)) ~ '(^|[^a-z0-9_])barman_[a-z0-9_]*[.]'
order by 1,2;

-- Confirm PostgreSQL is not accepting broad host rules on a self-hosted target.
-- Host firewall/security-group verification is performed outside SQL.
show listen_addresses;
