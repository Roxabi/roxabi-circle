#!/usr/bin/env bash
# Incremental cocoindex refresh. No-op when ccc or the project index is absent.
# EXIT: always 0 (agent hooks are fail-open).
set -u

root="${CLAUDE_PROJECT_DIR:-${GROK_WORKSPACE_ROOT:-}}"
if [[ -z "$root" ]]; then
  root="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
fi

command -v ccc >/dev/null 2>&1 || exit 0
[[ -d "$root/.cocoindex_code" ]] || exit 0

cd "$root" || exit 0
ccc index >/dev/null 2>&1 || true
exit 0
