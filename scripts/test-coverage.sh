#!/usr/bin/env bash
# Run Vitest coverage for all kit packages/apps with thresholds.
# HTML + json-summary → coverage/<name>/
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

echo "→ Cleaning coverage/"
rm -rf coverage
mkdir -p coverage

fail=0

run_pkg() {
  local dir="$1"
  local name
  name="$(basename "$dir")"
  echo ""
  echo "════════════════════════════════════════"
  echo " coverage: $name ($dir)"
  echo "════════════════════════════════════════"
  if (cd "$dir" && bunx vitest run --coverage); then
    echo "✓ $name"
  else
    echo "✗ $name FAILED" >&2
    fail=1
  fi
}

# High bar — backend / security-critical
run_pkg packages/auth
run_pkg packages/core
run_pkg apps/example-api

# Medium — small pure packages
run_pkg packages/storage
run_pkg packages/db
run_pkg packages/types
run_pkg packages/api-client
run_pkg packages/mcp
run_pkg packages/email
run_pkg packages/i18n
run_pkg packages/flows
run_pkg packages/tasks
run_pkg packages/comments

# Lower bar — large UI surface still expanding
run_pkg packages/ui
run_pkg apps/example-web
run_pkg apps/mcp-example

echo ""
bun scripts/print-coverage-summary.mjs || true

if [[ "$fail" -ne 0 ]]; then
  echo ""
  echo "test-coverage: FAILED (see thresholds / failing suites above)" >&2
  exit 1
fi

echo ""
echo "test-coverage: OK"
echo "HTML reports: coverage/<package>/index.html"
echo "Open e.g.:  coverage/example-api/index.html"
