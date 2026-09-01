#!/usr/bin/env bash
set -euo pipefail

# DABBIR | دبّر — platform Supabase -> self-hosted Supabase migration.
# This follows Supabase's official restore-to-self-hosted procedure.
# Required env vars:
#   SOURCE_DB_URL  current managed Supabase session/direct Postgres URL
#   TARGET_DB_URL  self-hosted Postgres/Supavisor URL on the Dubai VM
# Optional:
#   DUMP_DIR=/opt/dabbir/migration

: "${SOURCE_DB_URL:?SOURCE_DB_URL is required}"
: "${TARGET_DB_URL:?TARGET_DB_URL is required}"
[[ "$SOURCE_DB_URL" != "$TARGET_DB_URL" ]] || { echo "Source and target URLs must differ" >&2; exit 2; }

DUMP_DIR="${DUMP_DIR:-/opt/dabbir/migration}"
mkdir -p "$DUMP_DIR"
chmod 700 "$DUMP_DIR"

for cmd in supabase psql sha256sum diff; do
  command -v "$cmd" >/dev/null || { echo "Missing required command: $cmd" >&2; exit 1; }
done
command -v docker >/dev/null || { echo "Docker is required by supabase db dump" >&2; exit 1; }

stamp="$(date -u +%Y%m%dT%H%M%SZ)"
roles="$DUMP_DIR/roles-$stamp.sql"
schema="$DUMP_DIR/schema-$stamp.sql"
data="$DUMP_DIR/data-$stamp.sql"

# Supabase CLI intentionally filters managed-platform internals and reserved roles.
supabase db dump --db-url "$SOURCE_DB_URL" -f "$roles" --role-only
supabase db dump --db-url "$SOURCE_DB_URL" -f "$schema"
supabase db dump --db-url "$SOURCE_DB_URL" -f "$data" --use-copy --data-only

sha256sum "$roles" "$schema" "$data" | tee "$DUMP_DIR/sha256-$stamp.txt"

# The source is PostgreSQL 17.6 and fresh self-hosted Supabase is PostgreSQL 17 by default.
source_major="$(psql "$SOURCE_DB_URL" -Atc "show server_version_num" | cut -c1-2)"
target_major="$(psql "$TARGET_DB_URL" -Atc "show server_version_num" | cut -c1-2)"
[[ "$source_major" == "17" ]] || { echo "Unexpected source PG major: $source_major" >&2; exit 3; }
[[ "$target_major" == "17" ]] || { echo "Target must run PostgreSQL 17, got: $target_major" >&2; exit 3; }

# Confirm required source extensions are available on target before restore.
required_exts="$(psql "$SOURCE_DB_URL" -Atc "select extname from pg_extension where extname not in ('plpgsql') order by 1")"
while IFS= read -r ext; do
  [[ -z "$ext" ]] && continue
  if ! psql "$TARGET_DB_URL" -Atc "select 1 from pg_available_extensions where name='${ext//\'/\'\'}'" | grep -q '^1$'; then
    echo "Target does not provide required extension: $ext" >&2
    exit 4
  fi
done <<< "$required_exts"

# Official restore sequence. session_replication_role=replica prevents trigger side-effects
# (for example double encryption) while loading data.
psql \
  --single-transaction \
  --variable ON_ERROR_STOP=1 \
  --file "$roles" \
  --file "$schema" \
  --command 'SET session_replication_role = replica' \
  --file "$data" \
  --dbname "$TARGET_DB_URL"

# Evidence pack. Exact verification is intentionally limited to stable counts plus extensions;
# business-level smoke tests run after this step.
verify_sql="$(dirname "$0")/verify-migration.sql"
psql "$SOURCE_DB_URL" -v ON_ERROR_STOP=1 -Atf "$verify_sql" > "$DUMP_DIR/source-$stamp.verify"
psql "$TARGET_DB_URL" -v ON_ERROR_STOP=1 -Atf "$verify_sql" > "$DUMP_DIR/target-$stamp.verify"

diff -u "$DUMP_DIR/source-$stamp.verify" "$DUMP_DIR/target-$stamp.verify"

echo "PASS: database/auth/storage-metadata restore verified."
echo "Storage object bytes, Edge Functions, Auth provider config, SMTP and production keys still require separate cutover steps."
