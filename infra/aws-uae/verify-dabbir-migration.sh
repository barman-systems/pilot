#!/usr/bin/env bash
set -euo pipefail

# Compare a source DABBIR database with its UAE target before cutover.
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
    and (table_schema='dabbir_private' or (table_schema='public' and table_name like 'dabbir%'))
), target_functions as (
  select n.nspname schema_name,p.proname function_name
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='dabbir_private' or (n.nspname='public' and p.proname like 'dabbir%')
), target_policies as (
  select schemaname,tablename,policyname
  from pg_policies
  where schemaname='dabbir_private' or (schemaname='public' and tablename like 'dabbir%')
), target_triggers as (
  select event_object_schema,event_object_table,trigger_name
  from information_schema.triggers
  where event_object_schema='dabbir_private' or (event_object_schema='public' and event_object_table like 'dabbir%')
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
select count(*)
from auth.users u
join public.dabbir_user_accounts d on d.user_id=u.id;
SQL
}

extension_sql() {
  cat <<'SQL'
select coalesce(string_agg(extname, ',' order by extname),'')
from pg_extension
where extname in ('pg_cron','pg_net','pg_stat_statements','pgcrypto','pgmq','supabase_vault','uuid-ossp');
SQL
}

relation_fingerprint_sql() {
  cat <<'SQL'
select md5(string_agg(x, E'\n' order by x))
from (
  select concat(table_schema,'.',table_name,':',column_name,':',data_type,':',is_nullable,':',coalesce(column_default,'')) x
  from information_schema.columns
  where table_schema='dabbir_private' or (table_schema='public' and table_name like 'dabbir%')
) q;
SQL
}

compare_exact() {
  local name="$1"
  local sql="$2"
  local source target
  source="$(sql_scalar "${SOURCE_DATABASE_URL}" "${sql}")"
  target="$(sql_scalar "${TARGET_DATABASE_URL}" "${sql}")"
  printf '%-26s source=%s target=%s\n' "${name}" "${source}" "${target}"
  if [[ "${source}" != "${target}" ]]; then
    echo "FAIL: ${name} mismatch" >&2
    return 1
  fi
}

main() {
  local failed=0

  compare_exact "schema objects T/F/P/R" "$(object_count_sql)" || failed=1
  compare_exact "DABBIR auth users" "$(auth_count_sql)" || failed=1
  compare_exact "required extensions" "$(extension_sql)" || failed=1
  compare_exact "column fingerprint" "$(relation_fingerprint_sql)" || failed=1

  # Minimum baseline recorded 2026-09-01. Source may grow, but must never fall below this unexpectedly.
  local source_objects tables functions policies triggers
  source_objects="$(sql_scalar "${SOURCE_DATABASE_URL}" "$(object_count_sql)")"
  IFS='|' read -r tables functions policies triggers <<<"${source_objects}"
  if (( tables < 122 || functions < 184 || policies < 204 || triggers < 89 )); then
    echo "FAIL: source DABBIR schema is below the audited baseline (122 tables / 184 functions / 204 policies / 89 triggers)." >&2
    failed=1
  fi

  if (( failed != 0 )); then
    echo "DABBIR UAE migration gate: FAILED" >&2
    exit 1
  fi

  echo "DABBIR UAE migration gate: PASSED"
}

main "$@"
