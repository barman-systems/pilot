#!/usr/bin/env bash
set -euo pipefail

# Zero-surprise database migration helper for DABBIR.
# Required env vars:
#   SOURCE_DB_URL  - current Supabase direct Postgres URL (SSL enabled)
#   TARGET_DB_URL  - Falconcloud self-hosted Postgres URL (reachable through SSH tunnel/private network)
# Optional:
#   DUMP_DIR=/opt/dabbir/migration

: "${SOURCE_DB_URL:?SOURCE_DB_URL is required}"
: "${TARGET_DB_URL:?TARGET_DB_URL is required}"
DUMP_DIR="${DUMP_DIR:-/opt/dabbir/migration}"
mkdir -p "$DUMP_DIR"
chmod 700 "$DUMP_DIR"

for cmd in pg_dump pg_restore psql sha256sum; do
  command -v "$cmd" >/dev/null || { echo "Missing $cmd" >&2; exit 1; }
done

stamp="$(date -u +%Y%m%dT%H%M%SZ)"
dump="$DUMP_DIR/dabbir-$stamp.dump"
manifest="$dump.sha256"

# Keep Supabase system-owned schemas on the target installation. Move application schemas,
# Auth data and Storage metadata. Realtime schema state is recreated by the target stack.
pg_dump "$SOURCE_DB_URL" \
  --format=custom \
  --no-owner \
  --no-privileges \
  --verbose \
  --schema=public \
  --schema=dabbir_private \
  --schema=auth \
  --schema=storage \
  --file="$dump"

sha256sum "$dump" | tee "$manifest"

# Pre-cutover restore is intentionally destructive only to the selected application schemas.
# Never run against the source URL.
if [[ "$TARGET_DB_URL" == "$SOURCE_DB_URL" ]]; then
  echo "Refusing restore: source and target URLs are identical" >&2
  exit 2
fi

# Restore schema/data. Expected conflicts with target Supabase-owned objects must be reviewed,
# not blindly ignored. A non-zero exit blocks cutover.
pg_restore \
  --dbname="$TARGET_DB_URL" \
  --no-owner \
  --no-privileges \
  --exit-on-error \
  --verbose \
  "$dump"

# Evidence pack: counts and checksums are compared by verify-migration.sql.
psql "$SOURCE_DB_URL" -v ON_ERROR_STOP=1 -Atf "$(dirname "$0")/verify-migration.sql" > "$DUMP_DIR/source-$stamp.verify"
psql "$TARGET_DB_URL" -v ON_ERROR_STOP=1 -Atf "$(dirname "$0")/verify-migration.sql" > "$DUMP_DIR/target-$stamp.verify"

diff -u "$DUMP_DIR/source-$stamp.verify" "$DUMP_DIR/target-$stamp.verify"

echo "Database migration verification passed. Production cutover is still NOT authorized until API/Auth/Storage smoke tests pass."
