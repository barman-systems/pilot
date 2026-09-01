#!/usr/bin/env bash
set -euo pipefail

# Pre/post-cutover smoke checks for DABBIR. Safe: read/health probes only.
: "${DABBIR_APP_URL:?DABBIR_APP_URL is required}"
: "${DABBIR_API_URL:?DABBIR_API_URL is required}"

APP="${DABBIR_APP_URL%/}"
API="${DABBIR_API_URL%/}"

probe(){
  local name="$1" url="$2" expected="$3" method="${4:-GET}" body="${5:-}"
  local code
  if [[ "$method" == "POST" ]]; then
    code="$(curl -sS -o /tmp/dabbir-smoke-body -w '%{http_code}' --max-time 15 -X POST "$url" -H 'content-type: application/json' --data "$body" || true)"
  else
    code="$(curl -sS -o /tmp/dabbir-smoke-body -w '%{http_code}' --max-time 15 "$url" || true)"
  fi
  if [[ "$code" =~ $expected ]]; then
    echo "PASS $name HTTP $code"
  else
    echo "FAIL $name HTTP $code" >&2
    head -c 500 /tmp/dabbir-smoke-body >&2 || true
    echo >&2
    exit 1
  fi
}

probe "app root" "$APP/" '^200$'
probe "privacy" "$APP/privacy" '^200$'
probe "support" "$APP/support" '^200$'
probe "auth health" "$API/auth/v1/health" '^[1-4][0-9][0-9]$'
probe "REST gateway" "$API/rest/v1/" '^(200|400|401|404)$'
probe "owner broker loaded" "$API/functions/v1/dabbir-owner-broker" '^400$' POST '{"action":"__health_probe__"}'
probe "reminder worker rejects unauth" "$API/functions/v1/dabbir-salon-reminder-worker" '^401$' POST '{"action":"claim","limit":1}'

rm -f /tmp/dabbir-smoke-body
echo "PASS: DABBIR read-only cutover smoke checks"
