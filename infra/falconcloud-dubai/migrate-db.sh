#!/usr/bin/env bash
set -euo pipefail

# DABBIR | دبّر — selective managed-Supabase -> self-hosted-Supabase migration.
# Moves DABBIR state only; unrelated ZAJEL / R&A / Barman project data is excluded.
# Run on the Dubai VM after bootstrap.sh and verify.sh.

: "${SOURCE_DATABASE_URL:?SOURCE_DATABASE_URL is required}"
: "${TARGET_DATABASE_URL:?TARGET_DATABASE_URL is required}"
[[ "$SOURCE_DATABASE_URL" != "$TARGET_DATABASE_URL" ]] || { echo "Source and target URLs must differ" >&2; exit 2; }

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd -- "${SCRIPT_DIR}/../.." && pwd)"
VERIFY_SCRIPT="${REPO_ROOT}/infra/aws-uae/verify-dabbir-migration.sh"
[[ -x "$VERIFY_SCRIPT" ]] || { echo "Missing executable verifier: $VERIFY_SCRIPT" >&2; exit 1; }

WORKDIR="${DUMP_DIR:-/opt/dabbir/migration/$(date -u +%Y%m%dT%H%M%SZ)}"
mkdir -p "$WORKDIR"
chmod 700 "$WORKDIR"

for cmd in psql pg_dump pg_restore sha256sum diff; do
  command -v "$cmd" >/dev/null || { echo "Missing required command: $cmd" >&2; exit 1; }
done

src(){ PGOPTIONS='-c timezone=UTC' psql "$SOURCE_DATABASE_URL" -X -v ON_ERROR_STOP=1 "$@"; }
tgt(){ PGOPTIONS='-c timezone=UTC' psql "$TARGET_DATABASE_URL" -X -v ON_ERROR_STOP=1 "$@"; }
scalar(){ local url="$1" sql="$2"; PGOPTIONS='-c timezone=UTC' psql "$url" -X -A -t -v ON_ERROR_STOP=1 -c "$sql" | tr -d '[:space:]'; }

source_major="$(scalar "$SOURCE_DATABASE_URL" 'show server_version_num')"
target_major="$(scalar "$TARGET_DATABASE_URL" 'show server_version_num')"
[[ "${source_major:0:2}" == "17" && "${target_major:0:2}" == "17" ]] || {
  echo "PostgreSQL 17 required on both sides: source=$source_major target=$target_major" >&2; exit 3;
}

# Fresh-target gate.
target_existing="$(scalar "$TARGET_DATABASE_URL" "select count(*) from information_schema.tables where table_schema='dabbir_private' or (table_schema='public' and (table_name like 'dabbir%' or table_name='account_access_state'))")"
[[ "$target_existing" == "0" ]] || { echo "Target already has $target_existing DABBIR tables; refusing destructive overwrite." >&2; exit 4; }

# Only extensions actually required by DABBIR runtime are enabled on the dedicated target.
for ext in pgcrypto uuid-ossp supabase_vault; do
  available="$(scalar "$TARGET_DATABASE_URL" "select count(*) from pg_available_extensions where name='${ext}'")"
  [[ "$available" == "1" ]] || { echo "Required extension unavailable on target: $ext" >&2; exit 5; }
  tgt -c "create extension if not exists \"$ext\";"
done

# Export DABBIR-owned relations only.
pg_dump "$SOURCE_DATABASE_URL" --format=custom --no-owner --no-privileges \
  --table='public.dabbir*' --table='public.account_access_state' \
  --file="$WORKDIR/public-relations.dump"
pg_dump "$SOURCE_DATABASE_URL" --format=custom --no-owner --no-privileges \
  --schema=dabbir_private --file="$WORKDIR/private-schema.dump"

# Public DABBIR functions are not guaranteed to follow a selected table dump, export definitions + ACL explicitly.
src -A -t >"$WORKDIR/public-functions.sql" <<'SQL'
select pg_get_functiondef(p.oid) || E';\n'
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where p.prokind in ('f','p') and n.nspname='public' and p.proname like 'dabbir%'
order by p.proname,pg_get_function_identity_arguments(p.oid);
SQL
src -A -t >"$WORKDIR/public-function-acl.sql" <<'SQL'
with funcs as (
  select p.oid,p.proname,p.proowner,p.proacl,pg_get_function_identity_arguments(p.oid) args
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where p.prokind in ('f','p') and n.nspname='public' and p.proname like 'dabbir%'
), revoked as (
  select oid,0 ord,format('REVOKE ALL ON FUNCTION public.%I(%s) FROM PUBLIC;',proname,args) stmt from funcs
), grants as (
  select f.oid,1 ord,format('GRANT %s ON FUNCTION public.%I(%s) TO %s%s;',x.privilege_type,f.proname,f.args,
    case when x.grantee=0 then 'PUBLIC' else quote_ident(pg_get_userbyid(x.grantee)) end,
    case when x.is_grantable then ' WITH GRANT OPTION' else '' end) stmt
  from funcs f cross join lateral aclexplode(coalesce(f.proacl,acldefault('f',f.proowner))) x
  where x.privilege_type='EXECUTE' and x.grantee<>f.proowner
)
select stmt from (select * from revoked union all select * from grants) q order by oid,ord,stmt;
SQL

# DABBIR has 56 Auth users at the audited source snapshot. Use the DABBIR account table as the identity boundary.
DABBIR_USER_FILTER="id in (select user_id from public.dabbir_user_accounts)"
DABBIR_IDENTITY_FILTER="user_id in (select user_id from public.dabbir_user_accounts)"

insertable_columns(){
  local url="$1" table="$2"
  scalar "$url" "select string_agg(quote_ident(column_name),',' order by ordinal_position) from information_schema.columns where table_schema='auth' and table_name='${table}' and is_generated='NEVER' and identity_generation is null"
}
column_signature(){
  local url="$1" table="$2"
  scalar "$url" "select md5(string_agg(column_name||':'||data_type||':'||is_nullable||':'||is_generated,',' order by ordinal_position)) from information_schema.columns where table_schema='auth' and table_name='${table}'"
}

for table in users identities mfa_factors; do
  s_sig="$(column_signature "$SOURCE_DATABASE_URL" "$table")"
  t_sig="$(column_signature "$TARGET_DATABASE_URL" "$table")"
  [[ "$s_sig" == "$t_sig" ]] || { echo "Auth schema mismatch for auth.$table" >&2; exit 6; }
done

users_cols="$(insertable_columns "$SOURCE_DATABASE_URL" users)"
identities_cols="$(insertable_columns "$SOURCE_DATABASE_URL" identities)"
mfa_cols="$(insertable_columns "$SOURCE_DATABASE_URL" mfa_factors)"

src -c "\\copy (select ${users_cols} from auth.users where ${DABBIR_USER_FILTER} order by id) to '${WORKDIR}/auth-users.csv' with (format csv)"
src -c "\\copy (select ${identities_cols} from auth.identities where ${DABBIR_IDENTITY_FILTER} order by id) to '${WORKDIR}/auth-identities.csv' with (format csv)"
src -c "\\copy (select ${mfa_cols} from auth.mfa_factors where ${DABBIR_IDENTITY_FILTER} order by id) to '${WORKDIR}/auth-mfa-factors.csv' with (format csv)"

# Evidence before restore.
sha256sum "$WORKDIR"/* | sort | tee "$WORKDIR/SHA256SUMS"
source_users="$(scalar "$SOURCE_DATABASE_URL" "select count(*) from auth.users where $DABBIR_USER_FILTER")"
source_identities="$(scalar "$SOURCE_DATABASE_URL" "select count(*) from auth.identities where $DABBIR_IDENTITY_FILTER")"
source_mfa="$(scalar "$SOURCE_DATABASE_URL" "select count(*) from auth.mfa_factors where $DABBIR_IDENTITY_FILTER")"
[[ "$source_users" == "56" ]] || { echo "DABBIR Auth baseline changed: expected 56, found $source_users. Re-audit before cutover." >&2; exit 7; }
echo "SOURCE auth users=$source_users identities=$source_identities mfa_factors=$source_mfa"

# Restore relation definitions and private-schema functions first.
pg_restore --exit-on-error --no-owner --no-privileges --section=pre-data --dbname="$TARGET_DATABASE_URL" "$WORKDIR/private-schema.dump"
pg_restore --exit-on-error --no-owner --no-privileges --section=pre-data --dbname="$TARGET_DATABASE_URL" "$WORKDIR/public-relations.dump"
tgt -f "$WORKDIR/public-functions.sql"

# Insert Auth records with generated columns omitted. Sessions/refresh tokens are deliberately not copied;
# users re-login once after cutover, while password hashes, identities and enrolled MFA factors are preserved.
cat >"$WORKDIR/restore-auth.psql" <<EOF
set session_replication_role = replica;
\\copy auth.users(${users_cols}) from '${WORKDIR}/auth-users.csv' with (format csv)
\\copy auth.identities(${identities_cols}) from '${WORKDIR}/auth-identities.csv' with (format csv)
\\copy auth.mfa_factors(${mfa_cols}) from '${WORKDIR}/auth-mfa-factors.csv' with (format csv)
set session_replication_role = origin;
EOF
tgt -f "$WORKDIR/restore-auth.psql"

# Restore all DABBIR data and then constraints/indexes/RLS/triggers/ACLs.
pg_restore --exit-on-error --no-owner --no-privileges --section=data --dbname="$TARGET_DATABASE_URL" "$WORKDIR/private-schema.dump"
pg_restore --exit-on-error --no-owner --no-privileges --section=data --dbname="$TARGET_DATABASE_URL" "$WORKDIR/public-relations.dump"
pg_restore --exit-on-error --no-owner --no-privileges --section=post-data --dbname="$TARGET_DATABASE_URL" "$WORKDIR/private-schema.dump"
pg_restore --exit-on-error --no-owner --no-privileges --section=post-data --dbname="$TARGET_DATABASE_URL" "$WORKDIR/public-relations.dump"
tgt -f "$WORKDIR/public-function-acl.sql"

# Strict DABBIR schema/data verifier already maintained by the repository.
SOURCE_DATABASE_URL="$SOURCE_DATABASE_URL" TARGET_DATABASE_URL="$TARGET_DATABASE_URL" "$VERIFY_SCRIPT"

auth_fp(){
  local url="$1" table="$2" predicate="$3"
  scalar "$url" "select md5(coalesce(string_agg(to_jsonb(x)::text,E'\\n' order by to_jsonb(x)::text),'')) from (select * from auth.${table} where ${predicate}) x"
}
for spec in "users|$DABBIR_USER_FILTER" "identities|$DABBIR_IDENTITY_FILTER" "mfa_factors|$DABBIR_IDENTITY_FILTER"; do
  IFS='|' read -r table predicate <<<"$spec"
  s="$(auth_fp "$SOURCE_DATABASE_URL" "$table" "$predicate")"
  t="$(auth_fp "$TARGET_DATABASE_URL" "$table" "$predicate")"
  [[ "$s" == "$t" ]] || { echo "Auth fingerprint mismatch: auth.$table" >&2; exit 8; }
  echo "PASS auth.$table fingerprint"
done

# Prove no unrelated Auth users were imported.
target_auth_total="$(scalar "$TARGET_DATABASE_URL" 'select count(*) from auth.users')"
[[ "$target_auth_total" == "$source_users" ]] || { echo "Target contains unexpected Auth users: $target_auth_total" >&2; exit 9; }

echo "PASS: DABBIR-only database + Auth migration verified."
echo "No production endpoint has been changed. Run migrate-storage.sh and deploy-functions.sh next."
