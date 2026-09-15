#!/usr/bin/env bash
set -euo pipefail

CUTOVER_VERSION="${DABBIR_MIGRATION_CUTOVER_VERSION:-20260915124900}"
PROJECT_REF="${DABBIR_PROJECT_REF:-fphpoysqdsceniwduxjq}"

require_env(){
  local name="$1"
  [[ -n "${!name:-}" ]] || { echo "${name}_REQUIRED" >&2; exit 80; }
}
require_env GITHUB_EVENT_NAME
require_env GITHUB_REPOSITORY
require_env GITHUB_REF
require_env GITHUB_SHA
require_env GITHUB_ACTOR
require_env GITHUB_RUN_ID
require_env GH_TOKEN
require_env SUPABASE_DB_URL

[[ "$GITHUB_EVENT_NAME" == "push" ]] || { echo 'PUSH_EVENT_REQUIRED' >&2; exit 81; }
[[ "$GITHUB_REPOSITORY" == "barman-systems/pilot" ]] || { echo 'REPOSITORY_DENIED' >&2; exit 82; }
[[ "$GITHUB_REF" == "refs/heads/main" ]] || { echo 'MAIN_REF_REQUIRED' >&2; exit 83; }
[[ "$GITHUB_SHA" =~ ^[0-9a-f]{40}$ ]] || { echo 'MERGE_SHA_INVALID' >&2; exit 84; }
[[ "$GITHUB_ACTOR" =~ ^[A-Za-z0-9-]+$ ]] || { echo 'ACTOR_INVALID' >&2; exit 85; }
[[ "$GITHUB_RUN_ID" =~ ^[0-9]+$ ]] || { echo 'RUN_ID_INVALID' >&2; exit 86; }
[[ "$(git rev-parse HEAD)" == "$GITHUB_SHA" ]] || { echo 'CHECKOUT_SHA_MISMATCH' >&2; exit 87; }

gh_api(){
  curl --fail --silent --show-error \
    -H "Authorization: Bearer ${GH_TOKEN}" \
    -H 'Accept: application/vnd.github+json' \
    -H 'X-GitHub-Api-Version: 2022-11-28' \
    "https://api.github.com$1"
}

# Prove this protected-main commit came from exactly one fresh squash-merged PR.
prs="$(gh_api "/repos/${GITHUB_REPOSITORY}/commits/${GITHUB_SHA}/pulls?per_page=100")"
pr="$(jq -cer --arg sha "$GITHUB_SHA" '
  [.[] | select(.merged_at != null and .base.ref == "main" and ((.merge_commit_sha // "") | ascii_downcase) == $sha)]
  | if length == 1 then .[0] else error("MERGED_PR_PROVENANCE_REQUIRED") end
' <<<"$prs")"
pr_number="$(jq -er '.number' <<<"$pr")"
head_sha="$(jq -er '.head.sha | ascii_downcase' <<<"$pr")"
base_sha="$(jq -er '.base.sha | ascii_downcase' <<<"$pr")"
[[ "$head_sha" =~ ^[0-9a-f]{40}$ ]] || { echo 'PR_HEAD_SHA_INVALID' >&2; exit 88; }
[[ "$base_sha" =~ ^[0-9a-f]{40}$ ]] || { echo 'PR_BASE_SHA_INVALID' >&2; exit 89; }

commit="$(gh_api "/repos/${GITHUB_REPOSITORY}/commits/${GITHUB_SHA}")"
parent_count="$(jq -er '.parents | length' <<<"$commit")"
parent_sha="$(jq -er '.parents[0].sha | ascii_downcase' <<<"$commit")"
[[ "$parent_count" == "1" ]] || { echo 'SQUASH_MERGE_REQUIRED' >&2; exit 90; }
[[ "$parent_sha" == "$base_sha" ]] || { echo 'MERGE_BASE_FRESHNESS_MISMATCH' >&2; exit 91; }

statuses="$(gh_api "/repos/${GITHUB_REPOSITORY}/commits/${head_sha}/statuses?per_page=100")"
latest_state(){
  jq -er --arg context "$1" '[.[] | select(.context == $context)][0].state // "missing"' <<<"$statuses"
}
[[ "$(latest_state test)" == "success" ]] || { echo 'REQUIRED_TEST_STATUS_MISSING' >&2; exit 92; }
[[ "$(latest_state Vercel)" == "success" ]] || { echo 'REQUIRED_VERCEL_STATUS_MISSING' >&2; exit 93; }

runs="$(gh_api "/repos/${GITHUB_REPOSITORY}/actions/runs?event=pull_request&head_sha=${head_sha}&per_page=100")"
require_run(){
  local name="$1"
  jq -e --arg name "$name" --arg head "$head_sha" '
    [.workflow_runs[] | select(.name == $name and ((.head_sha // "") | ascii_downcase) == $head)]
    | sort_by(.created_at)
    | last
    | .status == "completed" and .conclusion == "success"
  ' <<<"$runs" >/dev/null || { echo "REQUIRED_PR_WORKFLOW_MISSING:${name}" >&2; exit 94; }
}
require_run 'DABBIR CI'
require_run 'DABBIR Security Gate'

printf 'MERGED_PR=%s\nHEAD_SHA=%s\nBASE_SHA=%s\n' "$pr_number" "$head_sha" "$base_sha" | tee migration-source-proof.txt

# Post-cutover migration history is immutable in Git.
parent="$(git rev-parse "${GITHUB_SHA}^")"
changes="$(mktemp)"
git diff --name-status "$parent" "$GITHUB_SHA" -- supabase/migrations/ > "$changes"
while IFS=$'\t' read -r status path rest; do
  [[ -z "${status:-}" ]] && continue
  [[ "$status" == "A" ]] || { echo "IMMUTABLE_MIGRATION_HISTORY:${status}:${path}:${rest:-}" >&2; exit 95; }
  node scripts/dabbir-migration-contract.mjs "$path" "$CUTOVER_VERSION" >/dev/null
done < "$changes"
rm -f "$changes"

# Build the exact complete post-cutover Git manifest. First run intentionally
# reconciles the already-merged Episode Correlation Authority migrations.
: > migration-manifest.tsv
count=0
while IFS= read -r file; do
  [[ -z "$file" ]] && continue
  base="${file##*/}"
  if [[ ! "$base" =~ ^([0-9]{14})_ ]]; then continue; fi
  [[ "${BASH_REMATCH[1]}" > "$CUTOVER_VERSION" ]] || continue
  meta="$(node scripts/dabbir-migration-contract.mjs "$file" "$CUTOVER_VERSION")"
  version="$(jq -er '.version' <<<"$meta")"
  name="$(jq -er '.name' <<<"$meta")"
  sha256="$(sha256sum "$file" | awk '{print $1}')"
  blob="$(git hash-object "$file")"
  idem="dabbir-ci-v1:${GITHUB_REPOSITORY}:${version}:${sha256}:${blob}"
  printf '%s\t%s\t%s\t%s\t%s\t%s\n' "$version" "$name" "$idem" "$sha256" "$blob" "$file" >> migration-manifest.tsv
  count=$((count+1))
  (( count <= 500 )) || { echo 'POST_CUTOVER_MANIFEST_TOO_LARGE' >&2; exit 96; }
done < <(find supabase/migrations -maxdepth 1 -type f -name '*.sql' -print | sort)
(( count > 0 )) || { echo 'POST_CUTOVER_MANIFEST_EMPTY' >&2; exit 97; }
sort -o migration-manifest.tsv migration-manifest.tsv

# Normalize the existing protected Production credential only after every source
# and manifest check above has passed.
echo "::add-mask::$SUPABASE_DB_URL"
DATABASE_URL="$(printf '%s' "$SUPABASE_DB_URL" | sed -E "s#^(postgres(ql)?://)[^:]+:#\\1postgres.${PROJECT_REF}:#")"
[[ "$DATABASE_URL" == postgres://* || "$DATABASE_URL" == postgresql://* ]] || { echo 'DATABASE_URL_INVALID' >&2; exit 98; }
echo "::add-mask::$DATABASE_URL"
export DATABASE_URL
export PGAPPNAME=dabbir-ci-migrator

psql_query(){
  local query="$1"
  docker run --rm \
    -e DATABASE_URL -e PGAPPNAME \
    postgres:17 \
    sh -c 'psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 -AtF "|" -c "$1"' sh "$query"
}

created_by="dabbir-ci-migrator:${GITHUB_ACTOR}:${GITHUB_SHA}:run:${GITHUB_RUN_ID}"
while IFS=$'\t' read -r version name idem sha256 blob file; do
  existing="$(psql_query "select name,coalesce(idempotency_key,''),coalesce(encode(extensions.digest(convert_to(statements[1],'UTF8'),'sha256'),'hex'),''),coalesce(encode(extensions.digest(convert_to('blob '||octet_length(convert_to(statements[1],'UTF8'))::text,'UTF8')||decode('00','hex')||convert_to(statements[1],'UTF8'),'sha1'),'hex'),'') from supabase_migrations.schema_migrations where version='${version}'")"
  if [[ -n "$existing" ]]; then
    IFS='|' read -r db_name db_idem db_sha db_blob <<<"$existing"
    [[ "$db_name" == "$name" && "$db_idem" == "$idem" && "$db_sha" == "$sha256" && "$db_blob" == "$blob" ]] \
      || { echo "UNATTESTED_OR_DRIFTED_MIGRATION_VERSION:${version}" >&2; exit 99; }
    echo "ATTESTED_REPLAY $version $name"
    continue
  fi

  source_b64="$(base64 -w0 "$file")"
  apply_sql="$(mktemp)"
  cat > "$apply_sql" <<SQL
select pg_advisory_xact_lock(hashtextextended('DABBIR_MIGRATION:${version}',0));
do \$guard\$
begin
  if exists(select 1 from supabase_migrations.schema_migrations where version='${version}') then
    raise exception 'MIGRATION_VERSION_RACE:${version}';
  end if;
end
\$guard\$;
\i /work/${file}
insert into supabase_migrations.schema_migrations(version,statements,name,created_by,idempotency_key,rollback)
values(
  '${version}',
  array[convert_from(decode('${source_b64}','base64'),'UTF8')]::text[],
  '${name}',
  '${created_by}',
  '${idem}',
  null::text[]
);
SQL
  docker run --rm \
    -e DATABASE_URL -e PGAPPNAME \
    -v "$PWD:/work:ro" \
    -v "$apply_sql:/tmp/apply.sql:ro" \
    postgres:17 \
    sh -c 'psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 --single-transaction -f /tmp/apply.sql'
  rm -f "$apply_sql"
  echo "APPLIED $version $name"
done < migration-manifest.tsv

# Post-deploy drift proof compares the actual SQL stored in Production, not names.
cut -f1-5 migration-manifest.tsv > repo-migration-manifest.tsv
query="select version,name,coalesce(idempotency_key,''),coalesce(encode(extensions.digest(convert_to(statements[1],'UTF8'),'sha256'),'hex'),''),coalesce(encode(extensions.digest(convert_to('blob '||octet_length(convert_to(statements[1],'UTF8'))::text,'UTF8')||decode('00','hex')||convert_to(statements[1],'UTF8'),'sha1'),'hex'),''),coalesce(created_by,'') from supabase_migrations.schema_migrations where version > '${CUTOVER_VERSION}' order by version"
docker run --rm \
  -e DATABASE_URL -e PGAPPNAME \
  -v "$PWD:/work" \
  postgres:17 \
  sh -c 'psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 -AtF "|" -c "$1" > /work/db-migration-manifest-with-actor.txt' sh "$query"

awk -F '|' 'BEGIN{OFS="\t"} {print $1,$2,$3,$4,$5}' db-migration-manifest-with-actor.txt > db-migration-manifest.tsv
awk -F '|' '$6 !~ /^dabbir-ci-migrator:[A-Za-z0-9-]+:[0-9a-f]{40}:run:[0-9]+$/ {bad=1; print "UNATTESTED_CREATED_BY:" $1 ":" $6 > "/dev/stderr"} END{exit bad}' db-migration-manifest-with-actor.txt
diff -u repo-migration-manifest.tsv db-migration-manifest.tsv || { echo 'DABBIR_MIGRATION_DRIFT_DETECTED' >&2; exit 100; }

rows="$(wc -l < db-migration-manifest.tsv | tr -d ' ')"
printf 'state=PASS\nrepository=%s\ncommit_sha=%s\nmanifest_count=%s\n' "$GITHUB_REPOSITORY" "$GITHUB_SHA" "$rows" | tee migration-drift-proof.txt
