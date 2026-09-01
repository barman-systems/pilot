#!/usr/bin/env bash
set -euo pipefail

# Deploy only DABBIR-owned Edge Functions to the self-hosted functions runtime.
: "${DABBIR_DB_DOMAIN:?DABBIR_DB_DOMAIN is required}"
SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd -- "${SCRIPT_DIR}/../.." && pwd)"
SUPA_DIR="${SUPA_DIR:-/opt/dabbir/supabase-project}"
SOURCE_DIR="${REPO_ROOT}/infra/aws-uae/functions"

[[ -d "$SUPA_DIR/volumes/functions" ]] || { echo "Self-hosted functions volume not found" >&2; exit 1; }

for fn in dabbir-owner-broker dabbir-salon-reminder-worker; do
  [[ -s "$SOURCE_DIR/$fn/index.ts" ]] || { echo "Missing captured live source: $fn" >&2; exit 2; }
  rm -rf "$SUPA_DIR/volumes/functions/$fn"
  mkdir -p "$SUPA_DIR/volumes/functions/$fn"
  cp "$SOURCE_DIR/$fn/index.ts" "$SUPA_DIR/volumes/functions/$fn/index.ts"
done

# These two functions were deployed on the managed source with verify_jwt=false.
# Their own security controls remain authoritative: owner-broker uses its OTP/session protocol;
# salon-reminder-worker cryptographically verifies the Vercel production OIDC identity.
python3 - "$SUPA_DIR/.env" <<'PY'
from pathlib import Path
import sys
p=Path(sys.argv[1])
s=p.read_text()
key='FUNCTIONS_VERIFY_JWT'
value='false'
out=[]; seen=False
for line in s.splitlines():
    if line.startswith(key+'='):
        line=f'{key}={value}'; seen=True
    out.append(line)
if not seen: out.append(f'{key}={value}')
p.write_text('\n'.join(out)+'\n')
PY

# Remove the sample public function from a production-only DABBIR runtime.
rm -rf "$SUPA_DIR/volumes/functions/hello"

cd "$SUPA_DIR"
sh run.sh recreate functions

base="https://${DABBIR_DB_DOMAIN}/functions/v1"
owner_code="$(curl -sS -o /tmp/dabbir-owner-probe.json -w '%{http_code}' -X POST "$base/dabbir-owner-broker" -H 'content-type: application/json' --data '{"action":"__health_probe__"}')"
[[ "$owner_code" == "400" ]] || { echo "Owner broker load probe failed HTTP $owner_code" >&2; cat /tmp/dabbir-owner-probe.json >&2; exit 3; }

reminder_code="$(curl -sS -o /tmp/dabbir-reminder-probe.json -w '%{http_code}' -X POST "$base/dabbir-salon-reminder-worker" -H 'content-type: application/json' --data '{"action":"claim","limit":1}')"
[[ "$reminder_code" == "401" ]] || { echo "Reminder worker auth probe failed HTTP $reminder_code" >&2; cat /tmp/dabbir-reminder-probe.json >&2; exit 4; }

rm -f /tmp/dabbir-owner-probe.json /tmp/dabbir-reminder-probe.json
echo "PASS: DABBIR Edge Functions deployed; unrelated project functions were not copied."
