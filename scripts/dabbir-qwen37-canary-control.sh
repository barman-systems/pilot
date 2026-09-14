#!/usr/bin/env bash
set -Eeuo pipefail

test -n "${VERCEL_TOKEN:-}" || { echo 'VERCEL_TOKEN_REQUIRED'; exit 10; }
echo "::add-mask::$VERCEL_TOKEN"

: "${VERCEL_PROJECT_ID:?VERCEL_PROJECT_ID_REQUIRED}"
: "${VERCEL_TEAM_ID:?VERCEL_TEAM_ID_REQUIRED}"
: "${PRODUCTION_HOST:?PRODUCTION_HOST_REQUIRED}"
: "${GITHUB_SHA:?GITHUB_SHA_REQUIRED}"

mode="${REQUESTED_MODE:-enable}"
case "$mode" in enable|disable) ;; *) echo "INVALID_MODE=$mode"; exit 11;; esac

auth=(-H "Authorization: Bearer ${VERCEL_TOKEN}")
json=(-H 'Content-Type: application/json')
previous_id=''
rollback_id=''

upsert_env() {
  local enabled="$1" percent="$2" response status payload
  payload="$(jq -cn --arg enabled "$enabled" --arg percent "$percent" '[
    {key:"DABBIR_QWEN37_CANARY_ENABLED",value:$enabled,type:"plain",target:["production"],comment:"DABBIR bounded Qwen3.7 semantic canary kill switch"},
    {key:"DABBIR_QWEN37_CANARY_PERCENT",value:$percent,type:"plain",target:["production"],comment:"DABBIR Qwen3.7 semantic canary percentage; code hard-caps at 1%"}
  ]')"
  response="$(mktemp)"
  status="$(curl -sS -o "$response" -w '%{http_code}' -X POST \
    "https://api.vercel.com/v10/projects/${VERCEL_PROJECT_ID}/env?upsert=true&teamId=${VERCEL_TEAM_ID}" \
    "${auth[@]}" "${json[@]}" --data "$payload" || true)"
  [[ "$status" =~ ^2 ]] || { echo "VERCEL_ENV_UPSERT_HTTP_${status:-000}"; return 1; }

  local envs count_enabled count_percent
  envs="$(curl -fsS "https://api.vercel.com/v10/projects/${VERCEL_PROJECT_ID}/env?decrypt=false&teamId=${VERCEL_TEAM_ID}" "${auth[@]}")"
  count_enabled="$(jq '[.envs[] | select(.key=="DABBIR_QWEN37_CANARY_ENABLED" and ((.target // []) | index("production")))] | length' <<<"$envs")"
  count_percent="$(jq '[.envs[] | select(.key=="DABBIR_QWEN37_CANARY_PERCENT" and ((.target // []) | index("production")))] | length' <<<"$envs")"
  test "$count_enabled" -eq 1 || { echo "CANARY_ENABLED_ENV_COUNT=$count_enabled"; return 1; }
  test "$count_percent" -eq 1 || { echo "CANARY_PERCENT_ENV_COUNT=$count_percent"; return 1; }
  echo 'CANARY_ENV_METADATA_OK enabled_target=production percent_target=production'
}

current_alias_id() {
  curl -fsS "https://api.vercel.com/v4/aliases/${PRODUCTION_HOST}?projectId=${VERCEL_PROJECT_ID}&teamId=${VERCEL_TEAM_ID}" "${auth[@]}" \
    | jq -r '.deploymentId // .deployment.id // empty'
}

wait_deployment() {
  local id="$1" state body
  for _ in $(seq 1 240); do
    body="$(curl -fsS "https://api.vercel.com/v13/deployments/${id}?teamId=${VERCEL_TEAM_ID}" "${auth[@]}")"
    state="$(jq -r '.readyState // .status // .state // empty' <<<"$body")"
    case "$state" in
      READY) echo "DEPLOYMENT_READY=$id"; return 0;;
      ERROR|CANCELED) echo "DEPLOYMENT_${state}=$id"; return 1;;
    esac
    sleep 2
  done
  echo "DEPLOYMENT_READY_TIMEOUT=$id"
  return 1
}

wait_alias() {
  local expected="$1" observed=''
  for _ in $(seq 1 120); do
    observed="$(current_alias_id || true)"
    if [ "$observed" = "$expected" ]; then
      echo "PRODUCTION_ALIAS_READY=$expected"
      return 0
    fi
    sleep 2
  done
  echo "PRODUCTION_ALIAS_TIMEOUT expected=$expected observed=${observed:-none}"
  return 1
}

wait_exact_source() {
  local exact state id deployments
  for _ in $(seq 1 180); do
    deployments="$(curl -fsS "https://api.vercel.com/v6/deployments?projectId=${VERCEL_PROJECT_ID}&target=production&limit=40&teamId=${VERCEL_TEAM_ID}" "${auth[@]}")"
    exact="$(jq -c --arg sha "$GITHUB_SHA" '[.deployments[] | select(.meta.githubCommitSha==$sha)] | sort_by(.created) | last // empty' <<<"$deployments")"
    if [ -n "$exact" ]; then
      state="$(jq -r '.readyState // .state // empty' <<<"$exact")"
      id="$(jq -r '.uid // .id // empty' <<<"$exact")"
      case "$state" in
        READY) echo "$id"; return 0;;
        ERROR|CANCELED) echo "EXACT_SOURCE_${state}=$id sha=$GITHUB_SHA" >&2; return 1;;
      esac
    fi
    sleep 2
  done
  echo "EXACT_SOURCE_TIMEOUT sha=$GITHUB_SHA" >&2
  return 1
}

redeploy() {
  local source_id="$1" response status id payload
  payload="$(jq -cn --arg id "$source_id" '{deploymentId:$id,name:"dabbir",project:"dabbir",target:"production"}')"
  response="$(mktemp)"
  status="$(curl -sS -o "$response" -w '%{http_code}' -X POST \
    "https://api.vercel.com/v13/deployments?forceNew=1&teamId=${VERCEL_TEAM_ID}" \
    "${auth[@]}" "${json[@]}" --data "$payload" || true)"
  [[ "$status" =~ ^2 ]] || { echo "VERCEL_REDEPLOY_HTTP_${status:-000}" >&2; return 1; }
  id="$(jq -r '.id // .uid // empty' "$response")"
  test -n "$id" || { echo 'VERCEL_REDEPLOY_ID_MISSING' >&2; return 1; }
  echo "$id"
}

verify_runtime() {
  local expected_enabled="$1" expected_percent="$2" expected_id="$3" expected_sha="$4"
  local release readiness observed_sha observed_id enabled percent model
  release="$(curl -fsS --retry 6 --retry-delay 2 "https://${PRODUCTION_HOST}/api/release-evidence?t=$(date +%s)")"
  readiness="$(curl -fsS --retry 6 --retry-delay 2 "https://${PRODUCTION_HOST}/api/dabbir-qwen37-canary-readiness?t=$(date +%s)")"
  observed_sha="$(jq -r '.commit_sha // empty' <<<"$release")"
  observed_id="$(jq -r '.deployment_id // empty' <<<"$release")"
  enabled="$(jq -r '.enabled // false' <<<"$readiness")"
  percent="$(jq -r '.percent // -1' <<<"$readiness")"
  model="$(jq -r '.model // empty' <<<"$readiness")"
  test "$observed_id" = "$expected_id" || { echo "RUNTIME_DEPLOYMENT_MISMATCH expected=$expected_id observed=${observed_id:-none}"; return 1; }
  if [ -n "$expected_sha" ]; then
    test "$observed_sha" = "$expected_sha" || { echo "RUNTIME_SHA_MISMATCH expected=$expected_sha observed=${observed_sha:-none}"; return 1; }
  fi
  test "$enabled" = "$expected_enabled" || { echo "RUNTIME_ENABLED_MISMATCH expected=$expected_enabled observed=$enabled"; return 1; }
  test "$percent" = "$expected_percent" || { echo "RUNTIME_PERCENT_MISMATCH expected=$expected_percent observed=$percent"; return 1; }
  test "$model" = 'alibaba/qwen3.7-flash' || { echo "RUNTIME_MODEL_MISMATCH observed=${model:-none}"; return 1; }
  echo "RUNTIME_CANARY_VERIFIED deployment=$expected_id enabled=$enabled percent=$percent sha=${observed_sha:-none}"
}

promote_rollback() {
  local target="$1" response status
  test -n "$target" || return 1
  response="$(mktemp)"
  status="$(curl -sS -o "$response" -w '%{http_code}' -X POST \
    "https://api.vercel.com/v10/projects/${VERCEL_PROJECT_ID}/promote/${target}?teamId=${VERCEL_TEAM_ID}" \
    "${auth[@]}" "${json[@]}" --data '{}' || true)"
  if [[ ! "$status" =~ ^2 ]]; then
    status="$(curl -sS -o "$response" -w '%{http_code}' -X POST \
      "https://api.vercel.com/v1/projects/${VERCEL_PROJECT_ID}/rollback/${target}?teamId=${VERCEL_TEAM_ID}" \
      "${auth[@]}" "${json[@]}" --data '{}' || true)"
  fi
  [[ "$status" =~ ^2 ]] || { echo "ROLLBACK_PROMOTE_HTTP_${status:-000}"; return 1; }
  wait_alias "$target"
}

rollback() {
  local rc=$?
  trap - ERR
  set +e
  echo "QWEN37_CANARY_ACTIVATION_ROLLBACK rc=$rc"
  upsert_env 0 0
  if [ -n "${rollback_id:-}" ]; then
    promote_rollback "$rollback_id"
    verify_runtime false 0 "$rollback_id" ''
  elif [ -n "${previous_id:-}" ]; then
    promote_rollback "$previous_id"
  fi
  exit "$rc"
}

previous_id="$(current_alias_id)"
test -n "$previous_id" || { echo 'CURRENT_PRODUCTION_DEPLOYMENT_MISSING'; exit 12; }
echo "PREVIOUS_PRODUCTION_DEPLOYMENT=$previous_id"
trap rollback ERR

upsert_env 0 0

if [ "$mode" = 'disable' ]; then
  off_id="$(redeploy "$previous_id")"
  wait_deployment "$off_id"
  wait_alias "$off_id"
  verify_runtime false 0 "$off_id" ''
  rollback_id="$off_id"
  trap - ERR
  echo "QWEN37_CANARY_DISABLED deployment=$off_id"
  exit 0
fi

source_id="$(wait_exact_source)"
test -n "$source_id"
safe_id="$(redeploy "$source_id")"
wait_deployment "$safe_id"
wait_alias "$safe_id"
verify_runtime false 0 "$safe_id" "$GITHUB_SHA"
rollback_id="$safe_id"
echo "QWEN37_CANARY_SAFE_OFF_DEPLOYMENT=$safe_id"

upsert_env 1 1
active_id="$(redeploy "$safe_id")"
wait_deployment "$active_id"
wait_alias "$active_id"
verify_runtime true 1 "$active_id" "$GITHUB_SHA"

trap - ERR
echo "QWEN37_CANARY_ACTIVATED percent=1 deployment=$active_id rollback=$safe_id sha=$GITHUB_SHA"
