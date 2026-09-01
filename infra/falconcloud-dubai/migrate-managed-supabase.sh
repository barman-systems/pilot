#!/usr/bin/env bash
set -euo pipefail

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

path.write_text(text)
PY

exec bash "$MIGRATE_SCRIPT"
