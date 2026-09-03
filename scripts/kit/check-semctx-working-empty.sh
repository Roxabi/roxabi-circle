#!/usr/bin/env bash
# PR/main attestation: tree of SEMCTX_WORKING_TREE (default HEAD) has only
# .semctx/working/.gitkeep. Inspects git ls-tree — never the runner workdir.
# Feature branches may keep handoff/change files; do not put this on pre-push.
set -euo pipefail
unset GIT_DIR GIT_WORK_TREE GIT_COMMON_DIR 2>/dev/null || true

ROOT="${SEMCTX_WORKING_ROOT:-$(cd "$(dirname "$0")/../.." && pwd -P)}"
cd "$ROOT"

DIR=".semctx/working"
KEEP="${DIR}/.gitkeep"
TREE="${SEMCTX_WORKING_TREE:-HEAD}"

if ! git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  echo "check-semctx-working-empty: not a git work tree" >&2
  exit 1
fi

if ! git rev-parse --verify "${TREE}^{commit}" >/dev/null 2>&1; then
  echo "check-semctx-working-empty: cannot resolve tree ${TREE}" >&2
  exit 1
fi

mapfile -t files < <(git ls-tree -r --name-only "${TREE}" -- "${DIR}" | LC_ALL=C sort)

if [[ "${#files[@]}" -eq 0 || -z "${files[0]:-}" ]]; then
  echo "check-semctx-working-empty: missing ${KEEP} in ${TREE} (track an empty dir)" >&2
  exit 1
fi

keep_found=0
bad=()
for f in "${files[@]}"; do
  [[ -z "$f" ]] && continue
  if [[ "$f" == "$KEEP" ]]; then
    keep_found=1
    continue
  fi
  bad+=("$f")
done

if [[ "$keep_found" -eq 0 ]]; then
  echo "check-semctx-working-empty: missing ${KEEP} in ${TREE} (track an empty dir)" >&2
  exit 1
fi

if [[ "${#bad[@]}" -gt 0 ]]; then
  echo "check-semctx-working-empty: ${DIR}/ must contain only .gitkeep in ${TREE}" >&2
  for f in "${bad[@]}"; do
    echo "  extra: ${f}" >&2
  done
  echo "Empty this directory (keep .gitkeep) before opening or updating a PR." >&2
  echo "Feature branches may keep files; this gate is PR/main only." >&2
  exit 1
fi

echo "check-semctx-working-empty: OK (${TREE})"
exit 0
