#!/usr/bin/env bash
set -euo pipefail

# Compare the source DABBIR database with the managed UAE RDS target before cutover.
# Usage:
#   SOURCE_DATABASE_URL=postgresql://... TARGET_DATABASE_URL=postgresql://... ./verify-dabbir-migration.sh
# Credentials are supplied at runtime only; never commit them.

: "${SOURCE_DATABASE_URL:?SOURCE_DATABASE_URL is required}"
: "${TARGET_DATABASE_URL:?TARGET_DATABASE_URL is required}"

PSQL_BIN="${PSQL_BIN:-psql}"

sql_scalar() {
  local url="$1"
  local sql="$2"
  "${PSQL_BIN}" "${url}" -X -A -t -v ON_ERROR_STOP=1 -c "${sql}" | tr -d '[:space:]'
}

object_count_sql() {
  cat <<'SQL'
with target_tables as (
  select table_schema,table_name
  from information_schema.tables
  where table_type='BASE TABLE'
    and (
      table_schema='dabbir_private'
      or (table_schema='public' and (table_name like 'dabbir%' or table_name='account_access_state'))
    )
), target_functions as (
  select n.nspname schema_name,p.proname function_name
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='dabbir_private' or (n.nspname='public' and p.proname like 'dabbir%')
), target_policies as (
  select schemaname,tablename,policyname
  from pg_policies
  where schemaname='dabbir_private'
     or (schemaname='public' and (tablename like 'dabbir%' or tablename='account_access_state'))
), target_triggers as (
  select event_object_schema,event_object_table,trigger_name
  from information_schema.triggers
  where event_object_schema='dabbir_private'
     or (event_object_schema='public' and (event_object_table like 'dabbir%' or event_object_table='account_access_state'))
)
select concat(
  (select count(*) from target_tables), '|',
  (select count(*) from target_functions), '|',
  (select count(*) from target_policies), '|',
  (select count(distinct (event_object_schema,event_object_table,trigger_name)) from target_triggers)
);
SQL
}

auth_count_sql() {
  cat <<'SQL'
with ids as (select user_id from public.dabbir_user_accounts)
select concat(
  (select count(*) from auth.users u where u.id in (select user_id from ids)), '|',
  (select count(*) from auth.identities x where x.user_id in (select user_id from ids)), '|',
  (select count(*) from auth.mfa_factors x where x.user_id in (select user_id from ids))
);
SQL
}

runtime_extension_sql() {
  cat <<'SQL'
select coalesce(string_agg(extname, ',' order by extname),'')
from pg_extension
where extname in ('pg_stat_statements','pgcrypto');
SQL
}

relation_fingerprint_sql() {
  cat <<'SQL'
select md5(string_agg(x, E'\n' order by x))
from (
  select concat(table_schema,'.',table_name,':',column_name,':',data_type,':',is_nullable,':',coalesce(column_default,'')) x
  from information_schema.columns
  where table_schema='dabbir_private'
     or (table_schema='public' and (table_name like 'dabbir%' or table_name='account_access_state'))
) q;
SQL
}

hidden_dependency_sql() {
  cat <<'SQL'
with dabbir_funcs as (
  select p.oid,p.prosrc
  from pg_proc p
  join pg_namespace n on n.oid=p.pronamespace
  where p.prokind in ('f','p')
    and (n.nspname='dabbir_private' or (n.nspname='public' and p.proname like 'dabbir%'))
), candidates as (
  select c.relname
  from pg_class c
  join pg_namespace n on n.oid=c.relnamespace
  where n.nspname='public' and c.relkind in ('r','v','m') and c.relname not like 'dabbir%'
)
select coalesce(string_agg(concat(c.relname,':',refs), ',' order by c.relname),'')
from (
  select c.relname,count(distinct f.oid) refs
  from candidates c
  join dabbir_funcs f
    on f.prosrc ~ ('(^|[^a-zA-Z0-9_])' || c.relname || '([^a-zA-Z0-9_]|$)')
  group by c.relname
) c;
SQL
}

managed_incompatible_dependency_sql() {
  cat <<'SQL'
with funcs as (
  select p.oid,p.proname,pg_get_functiondef(p.oid) definition
  from pg_proc p
  join pg_namespace n on n.oid=p.pronamespace
  where p.prokind in ('f','p')
    and (n.nspname='dabbir_private' or (n.nspname='public' and p.proname like 'dabbir%'))
)
select concat(
  count(*) filter (where definition ilike '%vault.%'), '|',
  count(*) filter (where definition ilike '%pg_net%' or definition ilike '%net.http_%'), '|',
  count(*) filter (where definition ilike '%pgmq%')
)
from funcs;
SQL
}

qa_share_function_sql() {
  cat <<'SQL'
select case when exists (
  select 1
  from pg_proc p
  join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public'
    and p.proname='dabbir_qa_consume_protected_share'
    and p.prokind in ('f','p')
) then 'present' else 'missing' end;
SQL
}

compare_exact() {
  local name="$1"
  local sql="$2"
  local source target
  source="$(sql_scalar "${SOURCE_DATABASE_URL}" "${sql}")"
  target="$(sql_scalar "${TARGET_DATABASE_URL}" "${sql}")"
  printf '%-30s source=%s target=%s\n' "${name}" "${source}" "${target}"
  if [[ "${source}" != "${target}" ]]; then
    echo "FAIL: ${name} mismatch" >&2
    return 1
  fi
}

main() {
  local failed=0

  compare_exact "schema objects T/F/P/R" "$(object_count_sql)" || failed=1
  compare_exact "auth users/identities/MFA" "$(auth_count_sql)" || failed=1
  compare_exact "RDS runtime extensions" "$(runtime_extension_sql)" || failed=1
  compare_exact "column fingerprint" "$(relation_fingerprint_sql)" || failed=1
  compare_exact "hidden dependencies" "$(hidden_dependency_sql)" || failed=1
  compare_exact "QA share function presence" "$(qa_share_function_sql)" || failed=1

  # Minimum audited baseline recorded 2026-09-01. Source may grow, but must never fall below this unexpectedly.
  local source_objects tables functions policies triggers
  source_objects="$(sql_scalar "${SOURCE_DATABASE_URL}" "$(object_count_sql)")"
  IFS='|' read -r tables functions policies triggers <<<"${source_objects}"
  if (( tables < 123 || functions < 184 || policies < 205 || triggers < 90 )); then
    echo "FAIL: source DABBIR schema is below the audited baseline (123 tables / 184 functions / 205 policies / 90 triggers)." >&2
    failed=1
  fi

  local source_auth users identities mfa
  source_auth="$(sql_scalar "${SOURCE_DATABASE_URL}" "$(auth_count_sql)")"
  IFS='|' read -r users identities mfa <<<"${source_auth}"
  if (( users < 56 || identities < 56 || mfa < 26 )); then
    echo "FAIL: source DABBIR auth state is below the audited baseline (56 users / 56 identities / 26 MFA factors)." >&2
    failed=1
  fi

  local deps
  deps="$(sql_scalar "${SOURCE_DATABASE_URL}" "$(hidden_dependency_sql)")"
  if [[ "${deps}" != *"account_access_state:9"* ]]; then
    echo "FAIL: audited hidden dependency account_access_state is missing or changed." >&2
    failed=1
  fi

  # The old Supabase project has exactly one DABBIR QA helper that reads Supabase Vault.
  # Managed RDS must replace that helper while preserving its function name; runtime DABBIR code
  # must not depend on Supabase-only vault/pg_net/pgmq extensions after migration.
  local source_incompatible target_incompatible
  source_incompatible="$(sql_scalar "${SOURCE_DATABASE_URL}" "$(managed_incompatible_dependency_sql)")"
  target_incompatible="$(sql_scalar "${TARGET_DATABASE_URL}" "$(managed_incompatible_dependency_sql)")"
  printf '%-30s source=%s target=%s\n' "managed-only dependencies V/N/Q" "$source_incompatible" "$target_incompatible"
  if [[ "$source_incompatible" != '1|0|0' ]]; then
    echo "FAIL: source managed-incompatible dependency baseline changed; re-audit before migration." >&2
    failed=1
  fi
  if [[ "$target_incompatible" != '0|0|0' ]]; then
    echo "FAIL: target still depends on Supabase-only Vault/pg_net/pgmq runtime features." >&2
    failed=1
  fi

  if (( failed != 0 )); then
    echo "DABBIR managed UAE migration gate: FAILED" >&2
    exit 1
  fi

  echo "DABBIR managed UAE migration gate: PASSED"
}

main "$@"
