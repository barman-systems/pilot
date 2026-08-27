#!/usr/bin/env bash
set -u

# Vercel ignoreCommand contract:
#   exit 0 => skip/ignore deployment
#   exit 1 => continue building
# Compare the triggering commit to its direct parent. VERCEL_GIT_PREVIOUS_SHA is
# the last successful deployment, not necessarily the prior commit in a PR.
# Fail safe: any uncertainty, unavailable parent, or unknown path builds.
current="${VERCEL_GIT_COMMIT_SHA:-HEAD}"

if ! git cat-file -e "${current}^{commit}" 2>/dev/null; then
  echo "Current commit unavailable; build for safety."
  exit 1
fi

parent="$(git rev-parse "${current}^" 2>/dev/null)" || {
  echo "Current commit parent unavailable; build for safety."
  exit 1
}
if ! git cat-file -e "${parent}^{commit}" 2>/dev/null; then
  echo "Current commit parent unavailable in checkout; build for safety."
  exit 1
fi

changed="$(git diff --name-only "$parent" "$current" --)"
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

echo "Only non-runtime DABBIR paths changed in current commit; skip Vercel deployment."
exit 0
