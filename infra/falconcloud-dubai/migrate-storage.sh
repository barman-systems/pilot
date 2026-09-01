#!/usr/bin/env bash
set -euo pipefail

# Migrate DABBIR-owned Supabase Storage buckets, object bytes, and DABBIR-specific storage RLS policies.
: "${SOURCE_DATABASE_URL:?SOURCE_DATABASE_URL is required}"
: "${TARGET_DATABASE_URL:?TARGET_DATABASE_URL is required}"
: "${SOURCE_SUPABASE_URL:?SOURCE_SUPABASE_URL is required}"
: "${SOURCE_SERVICE_ROLE_KEY:?SOURCE_SERVICE_ROLE_KEY is required}"
: "${TARGET_SUPABASE_URL:?TARGET_SUPABASE_URL is required}"
: "${TARGET_SERVICE_ROLE_KEY:?TARGET_SERVICE_ROLE_KEY is required}"

SOURCE_SUPABASE_URL="${SOURCE_SUPABASE_URL%/}"
TARGET_SUPABASE_URL="${TARGET_SUPABASE_URL%/}"
WORKDIR="$(mktemp -d /opt/dabbir/storage-migration.XXXXXX)"
chmod 700 "$WORKDIR"
trap 'rm -rf "$WORKDIR"' EXIT

src(){ psql "$SOURCE_DATABASE_URL" -X -A -t -v ON_ERROR_STOP=1 "$@"; }
tgt(){ psql "$TARGET_DATABASE_URL" -X -A -t -v ON_ERROR_STOP=1 "$@"; }
urlpath(){ python3 -c 'import sys,urllib.parse; print(urllib.parse.quote(sys.argv[1], safe="/"))' "$1"; }

api_headers_source=(-H "Authorization: Bearer ${SOURCE_SERVICE_ROLE_KEY}" -H "apikey: ${SOURCE_SERVICE_ROLE_KEY}")
api_headers_target=(-H "Authorization: Bearer ${TARGET_SERVICE_ROLE_KEY}" -H "apikey: ${TARGET_SERVICE_ROLE_KEY}")

# Only buckets owned by DABBIR naming are transferred. Current audited set is
# dabbir-owner-live and dabbir-car-wash-evidence; the query re-discovers at cutover.
src -c "select json_build_object('id',id,'name',name,'public',public,'file_size_limit',file_size_limit,'allowed_mime_types',allowed_mime_types)::text from storage.buckets where id like 'dabbir-%' order by id" > "$WORKDIR/buckets.jsonl"

bucket_count=$(grep -c . "$WORKDIR/buckets.jsonl" || true)
(( bucket_count >= 2 )) || { echo "DABBIR storage bucket baseline changed: found $bucket_count" >&2; exit 2; }

while IFS= read -r bucket_json; do
  [[ -n "$bucket_json" ]] || continue
  bucket="$(jq -r '.id' <<<"$bucket_json")"
  [[ "$bucket" =~ ^dabbir-[a-z0-9-]+$ ]] || { echo "Unsafe bucket id: $bucket" >&2; exit 3; }
  # Fresh target is expected. A pre-existing bucket is treated as a failed clean-room migration.
  if curl -sS -o /dev/null -w '%{http_code}' "${TARGET_SUPABASE_URL}/storage/v1/bucket/${bucket}" "${api_headers_target[@]}" | grep -q '^200$'; then
    echo "Target bucket already exists: $bucket" >&2; exit 4
  fi
  curl -fsS -X POST "${TARGET_SUPABASE_URL}/storage/v1/bucket" \
    "${api_headers_target[@]}" -H 'content-type: application/json' \
    --data-binary "$bucket_json" >/dev/null
  echo "CREATED bucket $bucket"
done < "$WORKDIR/buckets.jsonl"

# Copy each DABBIR object and prove byte-for-byte equality by SHA-256 after re-download.
src -c "select json_build_object('bucket_id',bucket_id,'name',name,'mimetype',coalesce(metadata->>'mimetype','application/octet-stream'),'cache_control',coalesce(metadata->>'cacheControl','3600'),'size',coalesce((metadata->>'size')::bigint,0))::text from storage.objects where bucket_id like 'dabbir-%' order by bucket_id,name" > "$WORKDIR/objects.jsonl"

object_count=0
while IFS= read -r object_json; do
  [[ -n "$object_json" ]] || continue
  object_count=$((object_count+1))
  bucket="$(jq -r '.bucket_id' <<<"$object_json")"
  name="$(jq -r '.name' <<<"$object_json")"
  mimetype="$(jq -r '.mimetype' <<<"$object_json")"
  cache_control="$(jq -r '.cache_control' <<<"$object_json")"
  encoded="$(urlpath "$name")"
  src_file="$WORKDIR/source-${object_count}.bin"
  dst_file="$WORKDIR/target-${object_count}.bin"

  curl -fsS "${SOURCE_SUPABASE_URL}/storage/v1/object/${bucket}/${encoded}" \
    "${api_headers_source[@]}" -o "$src_file"

  curl -fsS -X POST "${TARGET_SUPABASE_URL}/storage/v1/object/${bucket}/${encoded}" \
    "${api_headers_target[@]}" \
    -H 'x-upsert: true' -H "content-type: ${mimetype}" -H "cache-control: ${cache_control}" \
    --data-binary "@$src_file" >/dev/null

  curl -fsS "${TARGET_SUPABASE_URL}/storage/v1/object/${bucket}/${encoded}" \
    "${api_headers_target[@]}" -o "$dst_file"

  [[ "$(sha256sum "$src_file" | cut -d' ' -f1)" == "$(sha256sum "$dst_file" | cut -d' ' -f1)" ]] || {
    echo "Storage byte mismatch: $bucket/$name" >&2; exit 5;
  }
  echo "PASS object $bucket/$name"
done < "$WORKDIR/objects.jsonl"

# Recreate only DABBIR-specific policies on storage objects/buckets; unrelated project policies stay behind.
src > "$WORKDIR/storage-policies.sql" <<'SQL'
select format(
  'create policy %I on %I.%I as %s for %s to %s%s%s;',
  policyname, schemaname, tablename, permissive, cmd,
  array_to_string(array(select quote_ident(r) from unnest(roles) r), ','),
  case when qual is not null then ' using (' || qual || ')' else '' end,
  case when with_check is not null then ' with check (' || with_check || ')' else '' end
)
from pg_policies
where schemaname='storage'
  and (policyname ilike 'dabbir%' or coalesce(qual,'') ilike '%dabbir%' or coalesce(with_check,'') ilike '%dabbir%')
order by tablename,policyname;
SQL
if [[ -s "$WORKDIR/storage-policies.sql" ]]; then
  tgt -f "$WORKDIR/storage-policies.sql"
fi

source_buckets="$(src -c "select count(*) from storage.buckets where id like 'dabbir-%'" | tr -d '[:space:]')"
target_buckets="$(tgt -c "select count(*) from storage.buckets where id like 'dabbir-%'" | tr -d '[:space:]')"
source_objects="$(src -c "select count(*) from storage.objects where bucket_id like 'dabbir-%'" | tr -d '[:space:]')"
target_objects="$(tgt -c "select count(*) from storage.objects where bucket_id like 'dabbir-%'" | tr -d '[:space:]')"
[[ "$source_buckets" == "$target_buckets" && "$source_objects" == "$target_objects" ]] || {
  echo "Storage count mismatch source buckets/objects=${source_buckets}/${source_objects} target=${target_buckets}/${target_objects}" >&2; exit 6;
}

echo "PASS: DABBIR Storage migrated: buckets=$target_buckets objects=$target_objects"
