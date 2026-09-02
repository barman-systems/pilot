#!/usr/bin/env bash
set -u

# Vercel ignoreCommand contract:
#   exit 0 => skip/ignore deployment
#   exit 1 => continue building
#
# Release-integrity rule:
# 1) Every non-main Git branch must run the real Vercel Build Gate. A preview
#    commit is evidence, not an optimization target; test/docs follow-ups may
#    contain the repair for a previously failing runtime commit.
# 2) On main, compare against Vercel's last successful deployment baseline and
#    build whenever any application, database migration, or unknown path changed
#    in that range. Database schema is part of the Production artifact contract;
#    a migration must not leave main SHA ahead of the deployed SHA.
# 3) Executable exact-SHA Production verification contracts are deployment-
#    affecting even when their source files live under .github/, test/ or config/.
#    Static BAR-12 evidence snapshots under docs/evidence are different: they are
#    bound to the authoritative runtime SHA inside the evidence and must never
#    manufacture a new Production runtime merely by recording that proof.
# 4) Native iOS/App Store-only files and standalone UAE infrastructure-as-code are
#    explicitly outside the Vercel web runtime. They may reuse the last web-runtime
#    journey only when no web/database/runtime/release-contract path changed in the
#    same comparison range.
# 5) Only explicitly non-runtime paths may skip. Any uncertainty fails safe to a build.
current="${VERCEL_GIT_COMMIT_SHA:-HEAD}"
ref="${VERCEL_GIT_COMMIT_REF:-}"
previous_success="${VERCEL_GIT_PREVIOUS_SHA:-}"

if [[ -n "$ref" && "$ref" != "main" ]]; then
  echo "Non-main branch $ref requires full verification; continue deployment."
  exit 1
fi

if ! git cat-file -e "${current}^{commit}" 2>/dev/null; then
  echo "Current commit unavailable; build for safety."
  exit 1
fi

baseline=""
if [[ -n "$previous_success" ]]; then
  if ! git cat-file -e "${previous_success}^{commit}" 2>/dev/null; then
    echo "Last successful deployment commit unavailable; build for safety."
    exit 1
  fi
  if ! git merge-base --is-ancestor "$previous_success" "$current" 2>/dev/null; then
    echo "Last successful deployment is not an ancestor of current commit; build for safety."
    exit 1
  fi
  baseline="$previous_success"
else
  baseline="$(git rev-parse "${current}^" 2>/dev/null)" || {
    echo "Current commit parent unavailable; build for safety."
    exit 1
  }
  if ! git cat-file -e "${baseline}^{commit}" 2>/dev/null; then
    echo "Current commit parent unavailable in checkout; build for safety."
    exit 1
  fi
fi

changed="$(git diff --name-only "$baseline" "$current" --)"
if [[ -z "$changed" ]]; then
  echo "No changed files since verification baseline; skip deployment."
  exit 0
fi

while IFS= read -r path; do
  case "$path" in
    test/dabbir-protected-live-smoke.mjs|\
    .github/workflows/dabbir-protected-live-smoke.yml|\
    .github/workflows/dabbir-ai-customer-journey.yml|\
    .github/workflows/dabbir-bar12-readiness.yml|\
    .github/scripts/dabbir-bar12-*|\
    scripts/dabbir-readiness-gate.mjs|\
    test/ai-full-customer-journey-v2.mjs|\
    test/dabbir-protected-full-journey-preload.mjs|\
    test/dabbir-protected-journey-access.test.mjs|\
    test/dabbir-authorized-journey-workflow.test.mjs|\
    test/support/dabbir-protected-journey-access.mjs|\
    test/dabbir-capacity-load.mjs|\
    test/dabbir-activity-regression.test.mjs|\
    test/dabbir-bar12-*|\
    config/barman-integration-contract.json|\
    config/dabbir-release*.json)
      echo "Exact-SHA Production verification contract changed; deploy exact SHA for truthful release evidence: $path"
      exit 1
      ;;
    mobile/*|scripts/dabbir-app-store-preflight.mjs|infra/aws-uae/*)
      echo "Non-Vercel runtime path does not change the web runtime: $path"
      ;;
    .github/*|docs/*|test/*|README.md|.gitignore)
      ;;
    *)
      echo "Runtime or unknown path changed since verification baseline (database paths are runtime-affecting): $path; continue deployment."
      exit 1
      ;;
  esac
done <<< "$changed"

echo "Only explicitly non-runtime DABBIR paths changed since verification baseline; skip Vercel deployment."
exit 0