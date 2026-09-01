#!/usr/bin/env bash
set -euo pipefail

: "${TARGET_DATABASE_URL:?TARGET_DATABASE_URL is required}"
PSQL_BIN="${PSQL_BIN:-psql}"

scalar() {
  "$PSQL_BIN" "$TARGET_DATABASE_URL" -X -A -t -v ON_ERROR_STOP=1 -c "$1" | tr -d '[:space:]'
}

fail=0

roles="$(scalar "select count(*) from pg_roles where rolname in ('anon','authenticated','service_role','authenticator');")"
[[ "$roles" == '4' ]] || { echo "FAIL roles=$roles expected=4" >&2; fail=1; }

membership="$(scalar "select count(*) from pg_auth_members m join pg_roles parent on parent.oid=m.roleid join pg_roles child on child.oid=m.member where child.rolname='authenticator' and parent.rolname in ('anon','authenticated','service_role');")"
[[ "$membership" == '3' ]] || { echo "FAIL authenticator memberships=$membership expected=3" >&2; fail=1; }

mirror="$(scalar "select count(*) from auth.users u where u.id in (select user_id from public.dabbir_user_accounts);")"
accounts="$(scalar "select count(*) from public.dabbir_user_accounts;")"
[[ "$mirror" == "$accounts" ]] || { echo "FAIL auth mirror=$mirror accounts=$accounts" >&2; fail=1; }

sensitive_auth_tables="$(scalar "select count(*) from information_schema.tables where table_schema='auth' and table_name in ('identities','mfa_factors','sessions','refresh_tokens','one_time_tokens');")"
[[ "$sensitive_auth_tables" == '0' ]] || { echo "FAIL managed RDS contains sensitive Auth tables=$sensitive_auth_tables" >&2; fail=1; }

helpers="$(scalar "select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='auth' and p.proname in ('uid','jwt','role','email');")"
[[ "$helpers" == '4' ]] || { echo "FAIL auth helpers=$helpers expected=4" >&2; fail=1; }

pre_request="$(scalar "select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='dabbir_private' and p.proname='ensure_auth_mirror';")"
[[ "$pre_request" == '1' ]] || { echo "FAIL ensure_auth_mirror missing" >&2; fail=1; }

relations="$(scalar "select count(*) from pg_tables where schemaname='dabbir_private' or (schemaname='public' and (tablename like 'dabbir%' or tablename='account_access_state'));")"
service_policies="$(scalar "select count(*) from pg_policies where policyname='dabbir_service_role_all' and (schemaname='dabbir_private' or (schemaname='public' and (tablename like 'dabbir%' or tablename='account_access_state')));")"
[[ "$service_policies" == "$relations" ]] || { echo "FAIL service policies=$service_policies relations=$relations" >&2; fail=1; }

managed_deps="$(scalar "with funcs as (select pg_get_functiondef(p.oid) definition from pg_proc p join pg_namespace n on n.oid=p.pronamespace where p.prokind in ('f','p') and (n.nspname='dabbir_private' or (n.nspname='public' and p.proname like 'dabbir%'))) select concat(count(*) filter (where definition ilike '%vault.%'),'|',count(*) filter (where definition ilike '%pg_net%' or definition ilike '%net.http_%'),'|',count(*) filter (where definition ilike '%pgmq%')) from funcs;")"
[[ "$managed_deps" == '0|0|0' ]] || { echo "FAIL Supabase-only DB dependencies remain=$managed_deps" >&2; fail=1; }

qa_stub="$(scalar "select case when pg_get_functiondef(p.oid) ilike '%DABBIR_PROTECTED_QA_SHARE_MOVED_TO_AWS%' then 'ok' else 'bad' end from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='dabbir_qa_consume_protected_share' limit 1;")"
[[ "$qa_stub" == 'ok' ]] || { echo "FAIL QA vault helper not replaced" >&2; fail=1; }

uuid_cap="$(scalar "select case when to_regprocedure('gen_random_uuid()') is null then 'missing' else 'ok' end;")"
[[ "$uuid_cap" == 'ok' ]] || { echo "FAIL gen_random_uuid unavailable" >&2; fail=1; }

if (( fail != 0 )); then
  echo 'DABBIR RDS runtime gate: FAILED' >&2
  exit 1
fi

echo "DABBIR RDS runtime gate: PASSED accounts=$accounts relations=$relations"
