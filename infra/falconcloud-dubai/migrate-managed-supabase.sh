#!/usr/bin/env bash
set -euo pipefail

# Managed Supabase migration wrapper: preserves DABBIR Auth and replays only the
# 43 DABBIR foreign keys that reference the managed auth.users table.
SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
MIGRATE_SCRIPT="${SCRIPT_DIR}/migrate-db.sh"

python3 - "$MIGRATE_SCRIPT" <<'PY'
from pathlib import Path
import sys

path = Path(sys.argv[1])
text = path.read_text()

old_auth = r'''cat >"$WORKDIR/restore-auth.psql" <<EOF
set session_replication_role = replica;
\\copy auth.users(${users_cols}) from '${WORKDIR}/auth-users.csv' with (format csv)
\\copy auth.identities(${identities_cols}) from '${WORKDIR}/auth-identities.csv' with (format csv)
\\copy auth.mfa_factors(${mfa_cols}) from '${WORKDIR}/auth-mfa-factors.csv' with (format csv)
set session_replication_role = origin;
EOF
chmod 600 "$WORKDIR/restore-auth.psql"
tgt -f "$WORKDIR/restore-auth.psql"
'''
new_auth = r'''cat >"$WORKDIR/restore-auth.psql" <<EOF
truncate table public.migration_auth_users_stage, public.migration_auth_identities_stage, public.migration_auth_mfa_factors_stage;
\\copy public.migration_auth_users_stage(${users_cols}) from '${WORKDIR}/auth-users.csv' with (format csv)
\\copy public.migration_auth_identities_stage(${identities_cols}) from '${WORKDIR}/auth-identities.csv' with (format csv)
\\copy public.migration_auth_mfa_factors_stage(${mfa_cols}) from '${WORKDIR}/auth-mfa-factors.csv' with (format csv)
select public.migration_commit_auth_stage_v1();
EOF
chmod 600 "$WORKDIR/restore-auth.psql"
tgt -f "$WORKDIR/restore-auth.psql"
'''
if old_auth not in text:
    raise SystemExit('ERROR: expected Auth restore block was not found in migrate-db.sh')
text = text.replace(old_auth, new_auth, 1)

old_functions = 'tgt -f "$WORKDIR/public-functions.sql"'
new_functions = '''sed -i '1i set check_function_bodies=off;' "$WORKDIR/public-functions.sql"
tgt -f "$WORKDIR/public-functions.sql"'''
if old_functions not in text:
    raise SystemExit('ERROR: expected public function restore command was not found in migrate-db.sh')
text = text.replace(old_functions, new_functions, 1)

old_post = r'''pg_restore --exit-on-error --no-owner --section=post-data --dbname="$TARGET_DATABASE_URL" "$WORKDIR/private-schema.dump"
pg_restore --exit-on-error --no-owner --section=post-data --dbname="$TARGET_DATABASE_URL" "$WORKDIR/public-relations.dump"
tgt -f "$WORKDIR/public-function-acl.sql"
'''
new_post = r'''tgt -X -A -t -c "select constraint_name from public.migration_auth_fk_specs order by constraint_name" > "$WORKDIR/auth-fk-names.txt"
auth_fk_spec_count="$(wc -l < "$WORKDIR/auth-fk-names.txt" | tr -d '[:space:]')"
[[ "$auth_fk_spec_count" == "43" ]] || { echo "Expected 43 managed Auth FK specs, found $auth_fk_spec_count" >&2; exit 10; }

filter_postdata_toc(){
  local dump="$1" filtered="$2" count_file="$3"
  pg_restore --list "$dump" > "${filtered}.all"
  python3 - "${filtered}.all" "$filtered" "$WORKDIR/auth-fk-names.txt" "$count_file" <<'PYFILTER'
from pathlib import Path
import sys
src, dst, names_path, count_path = map(Path, sys.argv[1:])
names = [x.strip() for x in names_path.read_text().splitlines() if x.strip()]
kept = []
matched = set()
for line in src.read_text().splitlines(True):
    hits = [name for name in names if name in line]
    if hits:
        matched.update(hits)
        continue
    kept.append(line)
dst.write_text(''.join(kept))
count_path.write_text(str(len(matched)))
PYFILTER
}

filter_postdata_toc "$WORKDIR/private-schema.dump" "$WORKDIR/private-post.filtered.list" "$WORKDIR/private-post.skipped"
filter_postdata_toc "$WORKDIR/public-relations.dump" "$WORKDIR/public-post.filtered.list" "$WORKDIR/public-post.skipped"
private_skipped="$(cat "$WORKDIR/private-post.skipped")"
public_skipped="$(cat "$WORKDIR/public-post.skipped")"
total_skipped="$((private_skipped + public_skipped))"
[[ "$total_skipped" == "43" ]] || { echo "Expected to exclude exactly 43 managed Auth FKs from pg_restore, excluded $total_skipped" >&2; exit 11; }
echo "PASS: excluded exactly 43 managed Auth FKs from pg_restore post-data."

# public has the referenced unique/primary keys; restore it before the sole
# dabbir_private -> public cross-schema FK.
pg_restore --exit-on-error --no-owner --section=post-data --use-list="$WORKDIR/public-post.filtered.list" --dbname="$TARGET_DATABASE_URL" "$WORKDIR/public-relations.dump"
pg_restore --exit-on-error --no-owner --section=post-data --use-list="$WORKDIR/private-post.filtered.list" --dbname="$TARGET_DATABASE_URL" "$WORKDIR/private-schema.dump"

tgt -X -A -t -c "select public.migration_apply_auth_fks_v1();"
target_auth_fks="$(tgt -X -A -t -c "select count(*) from pg_constraint con join pg_class c on c.oid=con.conrelid join pg_namespace n on n.oid=c.relnamespace where con.contype='f' and con.confrelid='auth.users'::regclass and (n.nspname='dabbir_private' or (n.nspname='public' and (c.relname like 'dabbir%' or c.relname='account_access_state')))" | tr -d '[:space:]')"
[[ "$target_auth_fks" == "43" ]] || { echo "Expected 43 managed Auth FKs after replay, found $target_auth_fks" >&2; exit 12; }
echo "PASS: all 43 managed Auth FKs replayed on Mumbai."

tgt -f "$WORKDIR/public-function-acl.sql"
'''
if old_post not in text:
    raise SystemExit('ERROR: expected post-data restore block was not found in migrate-db.sh')
text = text.replace(old_post, new_post, 1)

path.write_text(text)
PY

exec bash "$MIGRATE_SCRIPT"
