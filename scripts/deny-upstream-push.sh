#!/usr/bin/env bash
# Block product repos from pushing to the kit upstream (silex-boilerplate).
#
# Shipped **in the kit** so product forks need NOT edit lefthook.yml.
# Safe on the kit itself: when origin is silex-boilerplate, all pushes allowed.
#
# Lefthook pre-push: bash scripts/deny-upstream-push.sh {1} {2}
# {1} = remote name · {2} = remote URL
set -euo pipefail

remote_name="${1:-}"
remote_url="${2:-}"

deny() {
  echo "deny-upstream-push: blocked push to kit upstream" >&2
  echo "  remote=${remote_name:-?} url=${remote_url:-?}" >&2
  echo "  Kit changes → repo go-silex/silex-boilerplate (push origin there)." >&2
  echo "  Product repo → only: git push origin …" >&2
  exit 1
}

# Are we the kit repo? (origin points at silex-boilerplate)
origin_url="$(git remote get-url origin 2>/dev/null || true)"
if [[ "${origin_url}" == *silex-boilerplate* ]]; then
  # Kit: allow push to origin (and any other remotes).
  exit 0
fi

# Product consumer: never push to a remote named upstream
if [[ "${remote_name}" == "upstream" ]]; then
  deny
fi

# Product: never push to any URL that is the kit (rename tricks)
if [[ "${remote_url}" == *silex-boilerplate* ]]; then
  deny
fi

exit 0
