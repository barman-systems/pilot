#!/usr/bin/env bash
set -u

# Vercel ignoreCommand contract:
#   exit 0 => skip/ignore deployment
#   exit 1 => continue building
#
# Release-integrity rule:
# Compare against the last successful deployment when Vercel provides it, so a
# failed runtime commit cannot be hidden by a later docs/test-only follow-up.
# If that baseline is unavailable or unrelated, fail safe and build. When there
# is no successful-deployment baseline (for example a first branch build), fall
# back to the triggering commit's direct parent.
current="${VERCEL_GIT_COMMIT_SHA:-HEAD}"
previous_success="${VERCEL_GIT_PREVIOUS_SHA:-}"

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
    .github/*|docs/*|test/*|db/*|supabase/*|README.md|.gitignore)
      ;;
    *)
      echo "Runtime or unknown path changed since verification baseline: $path; continue deployment."
      exit 1
      ;;
  esac
done <<< "$changed"

echo "Only non-runtime DABBIR paths changed since verification baseline; skip Vercel deployment."
exit 0
