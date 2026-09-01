#!/usr/bin/env bash
set -euo pipefail

# Compare the source DABBIR database with the managed UAE RDS target BEFORE
# applying target-only runtime compatibility policies.
# Usage:
#   SOURCE_DATABASE_URL=postgresql://... TARGET_DATABASE_URL=postgresql://... ./verify-dabbir-migration.sh

: "${SOURCE_DATABASE_URL:?SOURCE_DATABASE_URL is required}"
: "${TARGET_DATABASE_URL:?TARGET_DATABASE_URL is required}"
PSQL_BIN="${PSQL_BIN:-psql}"

sql_scalar() {
  local url="$1" sql="$2"
  "${PSQL_BIN}" "${url}" -X -A -t -v ON_ERROR_STOP=1 -c "${sql}" | tr -d '[:space:]'
}

object_count_sql() {
  cat <<'SQL'
with target_tables as (
  select table_schema,table_name from information_schema.tables
  where table_type='BASE TABLE'
    and (table_schema='dabbir_private' or (table_schema='public' and (table_name like 'dabbir%' or table_name='account_access_state')))
), target_functions as (
  select n.nspname,p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where p.prokind in ('f','p') and (n.nspname='dabbir_private' or (n.nspname='public' and p.proname like 'dabbir%'))
), target_policies as (
  select schemaname,tablename,policyname from pg_policies
  where schemaname='dabbir_private' or (schemaname='public' and (tablename like 'dabbir%' or tablename='account_access_state'))
), target_triggers as (
  select event_object_schema,event_object_table,trigger_name from information_schema.triggers
  where event_object_schema='dabbir_private' or (event_object_schema='public' and (event_object_table like 'dabbir%' or event_object_table='account_access_state'))
)
select concat(
  (select count(*) from target_tables),'|',
  (select count(*) from target_functions),'|',
  (select count(*) from target_policies),'|',
  (select count(distinct (event_object_schema,event_object_table,trigger_name)) from target_triggers)
);
SQL
}

relation_fingerprint_sql() {
  cat <<'SQL'
select md5(string_agg(x,E'\n' order by x)) from (
  select concat(table_schema,'.',table_name,':',column_name,':',data_type,':',is_nullable,':',coalesce(column_default,'')) x
  from information_schema.columns
  where table_schema='dabbir_private' or (table_schema='public' and (table_name like 'dabbir%' or table_name='account_access_state'))
) q;
SQL
}

function_fingerprint_sql() {
  cat <<'SQL'
select md5(string_agg(def,E'\n' order by schema_name,function_name,args)) from (
  select n.nspname schema_name,p.proname function_name,pg_get_function_identity_arguments(p.oid) args,pg_get_functiondef(p.oid) def
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where p.prokind in ('f','p')
    and (n.nspname='dabbir_private' or (n.nspname='public' and p.proname like 'dabbir%'))
) q;
SQL
}

policy_fingerprint_sql() {
  cat <<'SQL'
select md5(string_agg(x,E'\n' order by x)) from (
  select concat_ws('|',schemaname,tablename,policyname,permissive,cmd,array_to_string(roles,','),coalesce(qual,''),coalesce(with_check,'')) x
  from pg_policies
  where schemaname='dabbir_private' or (schemaname='public' and (tablename like 'dabbir%' or tablename='account_access_state'))
) q;
SQL
}

trigger_fingerprint_sql() {
  cat <<'SQL'
select md5(string_agg(x,E'\n' order by x)) from (
  select concat(n.nspname,'.',c.relname,':',t.tgname,':',pg_get_triggerdef(t.oid,true)) x
  from pg_trigger t
  join pg_class c on c.oid=t.tgrelid
  join pg_namespace n on n.oid=c.relnamespace
  where not t.tgisinternal
    and (n.nspname='dabbir_private' or (n.nspname='public' and (c.relname like 'dabbir%' or c.relname='account_access_state')))
) q;
SQL
}

auth_mirror_count_sql() {
  cat <<'SQL'
select count(*) from auth.users u
where u.id in (select user_id from public.dabbir_user_accounts);
SQL
}

auth_mirror_fingerprint_sql() {
  cat <<'SQL'
select md5(string_agg(x,E'\n' order by x)) from (
  select concat_ws('|',u.id::text,coalesce(u.email,''),coalesce(u.phone,''),coalesce(u.created_at::text,''),coalesce(u.last_sign_in_at::text,''),coalesce(u.email_confirmed_at::text,''),coalesce(u.phone_confirmed_at::text,''),coalesce(u.banned_until::text,''),coalesce(u.deleted_at::text,'')) x
  from auth.users u
  where u.id in (select user_id from public.dabbir_user_accounts)
) q;
SQL
}

hidden_dependency_sql() {
  cat <<'SQL'
with dabbir_funcs as (
  select p.oid,p.prosrc from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where p.prokind in ('f','p') and (n.nspname='dabbir_private' or (n.nspname='public' and p.proname like 'dabbir%'))
), candidates as (
  select c.relname from pg_class c join pg_namespace n on n.oid=c.relnamespace
  where n.nspname='public' and c.relkind in ('r','v','m') and c.relname not like 'dabbir%'
)
select coalesce(string_agg(concat(relname,':',refs),',' order by relname),'') from (
  select c.relname,count(distinct f.oid) refs
  from candidates c join dabbir_funcs f
    on f.prosrc ~ ('(^|[^a-zA-Z0-9_])' || c.relname || '([^a-zA-Z0-9_]|$)')
  group by c.relname
) q;
SQL
}

managed_dependency_sql() {
  cat <<'SQL'
with funcs as (
  select pg_get_functiondef(p.oid) definition
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where p.prokind in ('f','p') and (n.nspname='dabbir_private' or (n.nspname='public' and p.proname like 'dabbir%'))
)
select concat(
  count(*) filter (where definition ilike '%vault.%'),'|',
  count(*) filter (where definition ilike '%pg_net%' or definition ilike '%net.http_%'),'|',
  count(*) filter (where definition ilike '%pgmq%')
) from funcs;
SQL
}

runtime_capability_sql() {
  cat <<'SQL'
select concat(
  case when to_regprocedure('gen_random_uuid()') is not null then 'uuid-ok' else 'uuid-missing' end,'|',
  case when to_regprocedure('auth.uid()') is not null then 'uid-ok' else 'uid-missing' end,'|',
  case when to_regprocedure('auth.jwt()') is not null then 'jwt-ok' else 'jwt-missing' end
);
SQL
}

compare_exact() {
  local name="$1" sql="$2" source target
  source="$(sql_scalar "$SOURCE_DATABASE_URL" "$sql")"
  target="$(sql_scalar "$TARGET_DATABASE_URL" "$sql")"
  printf '%-32s source=%s target=%s\n' "$name" "$source" "$target"
  [[ "$source" == "$target" ]] || { echo "FAIL: $name mismatch" >&2; return 1; }
}

main() {
  local failed=0
  compare_exact "schema objects T/F/P/R" "$(object_count_sql)" || failed=1
  compare_exact "column fingerprint" "$(relation_fingerprint_sql)" || failed=1
  compare_exact "function fingerprint" "$(function_fingerprint_sql)" || failed=1
  compare_exact "policy fingerprint" "$(policy_fingerprint_sql)" || failed=1
  compare_exact "trigger fingerprint" "$(trigger_fingerprint_sql)" || failed=1
  compare_exact "DABBIR auth mirror users" "$(auth_mirror_count_sql)" || failed=1
  compare_exact "DABBIR auth mirror fields" "$(auth_mirror_fingerprint_sql)" || failed=1
  compare_exact "hidden dependencies" "$(hidden_dependency_sql)" || failed=1
  compare_exact "pre-compat managed deps V/N/Q" "$(managed_dependency_sql)" || failed=1
  compare_exact "runtime DB capabilities" "$(runtime_capability_sql)" || failed=1

  local source_objects tables functions policies triggers
  source_objects="$(sql_scalar "$SOURCE_DATABASE_URL" "$(object_count_sql)")"
  IFS='|' read -r tables functions policies triggers <<<"$source_objects"
  if (( tables < 123 || functions < 184 || policies < 205 || triggers < 90 )); then
    echo 'FAIL: source DABBIR schema fell below audited 2026-09-01 baseline.' >&2
    failed=1
  fi

  local source_auth source_managed deps
  source_auth="$(sql_scalar "$SOURCE_DATABASE_URL" "$(auth_mirror_count_sql)")"
  if (( source_auth < 56 )); then
    echo 'FAIL: source DABBIR auth users fell below audited baseline of 56.' >&2
    failed=1
  fi

  source_managed="$(sql_scalar "$SOURCE_DATABASE_URL" "$(managed_dependency_sql)")"
  if [[ "$source_managed" != '1|0|0' ]]; then
    echo "FAIL: source Supabase-only dependency baseline changed ($source_managed); re-audit required." >&2
    failed=1
  fi

  deps="$(sql_scalar "$SOURCE_DATABASE_URL" "$(hidden_dependency_sql)")"
  if [[ "$deps" != *'account_access_state:9'* ]]; then
    echo 'FAIL: audited hidden dependency account_access_state is missing or changed.' >&2
    failed=1
  fi

  if (( failed != 0 )); then
    echo 'DABBIR managed UAE migration gate: FAILED' >&2
    exit 1
  fi
  echo 'DABBIR managed UAE migration gate: PASSED'
}

main "$@"
