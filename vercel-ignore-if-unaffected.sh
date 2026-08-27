#!/usr/bin/env bash
set -u

# Vercel ignoreCommand contract:
#   exit 0 => skip/ignore deployment
#   exit 1 => continue building
# Fail safe: any uncertainty or unknown path builds.
previous="${VERCEL_GIT_PREVIOUS_SHA:-}"
current="${VERCEL_GIT_COMMIT_SHA:-HEAD}"

if [[ -z "$previous" ]]; then
  echo "No VERCEL_GIT_PREVIOUS_SHA; build for safety."
  exit 1
fi
if ! git cat-file -e "${previous}^{commit}" 2>/dev/null; then
  echo "Previous commit unavailable; build for safety."
  exit 1
fi
if ! git cat-file -e "${current}^{commit}" 2>/dev/null; then
  echo "Current commit unavailable; build for safety."
  exit 1
fi

changed="$(git diff --name-only "$previous" "$current" --)"
if [[ -z "$changed" ]]; then
  echo "No changed files; skip deployment."
  exit 0
fi

while IFS= read -r path; do
  case "$path" in
    .github/*|docs/*|test/*|db/*|supabase/*|README.md|.gitignore)
      ;;
    *)
      echo "Runtime or unknown path changed: $path; continue deployment."
      exit 1
      ;;
  esac
done <<< "$changed"

echo "Only non-runtime DABBIR paths changed; skip Vercel deployment."
exit 0
