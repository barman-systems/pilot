#!/usr/bin/env bash
set -euo pipefail

: "${SOURCE_DATABASE_URL:?SOURCE_DATABASE_URL is required}"
: "${TARGET_DB_HOST:?TARGET_DB_HOST is required}"
: "${TARGET_DB_PASSWORD:?TARGET_DB_PASSWORD is required}"
: "${AUTHENTICATOR_PASSWORD:?AUTHENTICATOR_PASSWORD is required}"

TARGET_DB_PORT="${TARGET_DB_PORT:-5432}"
TARGET_DB_NAME="${TARGET_DB_NAME:-dabbir}"
TARGET_DB_USER="${TARGET_DB_USER:-dabbir_admin}"
WORKDIR="$(mktemp -d /tmp/dabbir-rds-migration.XXXXXX)"
SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
TARGET_CONN="host=${TARGET_DB_HOST} port=${TARGET_DB_PORT} dbname=${TARGET_DB_NAME} user=${TARGET_DB_USER} sslmode=require"
export PGPASSWORD="${TARGET_DB_PASSWORD}"

cleanup() {
  rm -rf "${WORKDIR}"
  unset PGPASSWORD TARGET_DB_PASSWORD AUTHENTICATOR_PASSWORD SOURCE_DATABASE_URL
}
trap cleanup EXIT

psql_target() {
  psql "${TARGET_CONN}" -X -v ON_ERROR_STOP=1 "$@"
}

source_scalar() {
  psql "${SOURCE_DATABASE_URL}" -X -A -t -v ON_ERROR_STOP=1 -c "$1" | tr -d '[:space:]'
}

target_scalar() {
  psql "${TARGET_CONN}" -X -A -t -v ON_ERROR_STOP=1 -c "$1" | tr -d '[:space:]'
}

require_empty_target() {
  local count
  count="$(target_scalar "select count(*) from information_schema.tables where table_schema='dabbir_private' or (table_schema='public' and (table_name like 'dabbir%' or table_name='account_access_state')); ")"
  if [[ "${count}" != "0" ]]; then
    echo "Refusing migration: target already contains ${count} DABBIR relations." >&2
    exit 3
  fi
}

export_public_functions() {
  psql "${SOURCE_DATABASE_URL}" -X -A -t -v ON_ERROR_STOP=1 >"${WORKDIR}/public-functions.sql" <<'SQL'
select pg_get_functiondef(p.oid) || E';\n'
from pg_proc p
join pg_namespace n on n.oid=p.pronamespace
where p.prokind in ('f','p')
  and n.nspname='public'
  and p.proname like 'dabbir%'
order by p.proname,pg_get_function_identity_arguments(p.oid);
SQL

  psql "${SOURCE_DATABASE_URL}" -X -A -t -v ON_ERROR_STOP=1 >"${WORKDIR}/public-function-acl.sql" <<'SQL'
with funcs as (
  select p.oid,p.proname,p.proowner,p.proacl,pg_get_function_identity_arguments(p.oid) args
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where p.prokind in ('f','p') and n.nspname='public' and p.proname like 'dabbir%'
), revoked as (
  select oid,0 ord,
    format('REVOKE ALL ON FUNCTION public.%I(%s) FROM PUBLIC;',proname,args) stmt
  from funcs
), grants as (
  select f.oid,1 ord,
    format(
      'GRANT %s ON FUNCTION public.%I(%s) TO %s%s;',
      x.privilege_type,
      f.proname,
      f.args,
      case when x.grantee=0 then 'PUBLIC' else quote_ident(pg_get_userbyid(x.grantee)) end,
      case when x.is_grantable then ' WITH GRANT OPTION' else '' end
    ) stmt
  from funcs f
  cross join lateral aclexplode(coalesce(f.proacl,acldefault('f',f.proowner))) x
  where x.privilege_type='EXECUTE'
    and x.grantee<>f.proowner
)
select stmt from (
  select * from revoked
  union all
  select * from grants
) q
order by oid,ord,stmt;
SQL
}

export_auth_mirror() {
  local csv="${WORKDIR}/auth-users.csv"
  psql "${SOURCE_DATABASE_URL}" -X -v ON_ERROR_STOP=1 -c "\\copy (select u.id,u.aud,u.role,u.email,u.email_confirmed_at,u.last_sign_in_at,u.raw_app_meta_data,u.raw_user_meta_data,u.created_at,u.updated_at,u.phone,u.phone_confirmed_at,u.banned_until,u.deleted_at from auth.users u where u.id in (select user_id from public.dabbir_user_accounts) order by u.id) to '${csv}' with (format csv, header false)"
}

export_dabbir() {
  echo 'Exporting DABBIR public relations only...'
  pg_dump "${SOURCE_DATABASE_URL}" \
    --format=custom \
    --no-owner \
    --table='public.dabbir*' \
    --table='public.account_access_state' \
    --file="${WORKDIR}/public-relations.dump"

  echo 'Exporting DABBIR private schema only...'
  pg_dump "${SOURCE_DATABASE_URL}" \
    --format=custom \
    --no-owner \
    --schema=dabbir_private \
    --file="${WORKDIR}/private-schema.dump"

  export_public_functions
  export_auth_mirror
}

restore_pre_data() {
  echo 'Installing minimal Auth compatibility layer...'
  psql_target -v "authenticator_password=${AUTHENTICATOR_PASSWORD}" -f "${SCRIPT_DIR}/00-rds-auth-compat.sql"

  echo 'Restoring DABBIR relation definitions...'
  pg_restore --exit-on-error --no-owner --section=pre-data --dbname="${TARGET_CONN}" "${WORKDIR}/public-relations.dump"
  pg_restore --exit-on-error --no-owner --section=pre-data --dbname="${TARGET_CONN}" "${WORKDIR}/private-schema.dump"

  echo 'Restoring public DABBIR functions...'
  psql_target -f "${WORKDIR}/public-functions.sql"
}

restore_data() {
  echo 'Restoring public DABBIR data...'
  pg_restore --exit-on-error --no-owner --section=data --dbname="${TARGET_CONN}" "${WORKDIR}/public-relations.dump"

  echo 'Restoring private DABBIR data...'
  pg_restore --exit-on-error --no-owner --section=data --dbname="${TARGET_CONN}" "${WORKDIR}/private-schema.dump"

  echo 'Restoring the  managed Auth identity mirror only...'
  psql_target -c "\\copy auth.users(id,aud,role,email,email_confirmed_at,last_sign_in_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at,phone,phone_confirmed_at,banned_until,deleted_at) from '${WORKDIR}/auth-users.csv' with (format csv, header false)"
}

restore_post_data() {
  echo 'Restoring constraints, indexes, RLS, triggers and grants...'
  pg_restore --exit-on-error --no-owner --section=post-data --dbname="${TARGET_CONN}" "${WORKDIR}/private-schema.dump"
  pg_restore --exit-on-error --no-owner --section=post-data --dbname="${TARGET_CONN}" "${WORKDIR}/public-relations.dump"
  psql_target -f "${WORKDIR}/public-function-acl.sql"
}

verify_exact_restore() {
  echo 'Running exact source-target DABBIR gate...'
  SOURCE_DATABASE_URL="${SOURCE_DATABASE_URL}" TARGET_DATABASE_URL="${TARGET_CONN}" \
    "${SCRIPT_DIR}/verify-dabbir-migration.sh"
}

apply_managed_runtime() {
  echo 'Applying RDS-only runtime compatibility...'
  psql_target -f "${SCRIPT_DIR}/20-rds-runtime-compat.sql"

  echo 'Running managed RDS runtime gate...'
  TARGET_DATABASE_URL="${TARGET_CONN}" "${SCRIPT_DIR}/verify-rds-runtime.sh"
}

main() {
  echo 'DABBIR managed UAE migration: starting selective export.'
  echo 'Source is read-only for this process; no source DDL/DML is executed.'

  require_empty_target

  local source_version target_version
  source_version="$(source_scalar "show server_version_num;")"
  target_version="$(target_scalar "show server_version_num;")"
  [[ "${source_version:0:2}" == "${target_version:0:2}" ]] || {
    echo "Refusing migration: PostgreSQL major versions differ source=${source_version} target=${target_version}." >&2
    exit 4
  }

  export_dabbir
  restore_pre_data
  restore_data
  restore_post_data
  verify_exact_restore
  apply_managed_runtime

  echo 'DABBIR managed UAE migration: PASSED all gates.'
  echo 'No production cutover has been performed.'
}

main "$@"
