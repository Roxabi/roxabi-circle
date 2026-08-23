#!/usr/bin/env bash
# CP-EXTRACT — self-test for extract-residency + kit app allowlist
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
RESIDENCY="${ROOT}/scripts/kit/extract-residency.ts"

PASS=0
FAIL=0

assert_exit() {
  local name="$1" expect="$2" cmd="$3"
  local got=0 out
  set +e
  out="$(eval "$cmd" 2>&1)"
  got=$?
  set -e
  if [[ "$got" -ne "$expect" ]]; then
    echo "  FAIL: $name expected exit $expect, got $got" >&2
    echo "    out: $(echo "$out" | tr '\n' ' ')" >&2
    FAIL=$((FAIL + 1))
    return
  fi
  echo "  PASS: $name (exit $got)"
  PASS=$((PASS + 1))
}

check_kit_allowlist() {
  local tree="$1"
  local mode="${2:-kit}"
  [[ "$mode" == "kit" || "$mode" == "strict" ]] || return 0
  local -a allow=(example-api example-web example-web-branded mcp-example)
  for app_dir in "$tree"/apps/*/; do
    [[ -d "$app_dir" ]] || continue
    local app_name ok=0
    app_name="$(basename "$app_dir")"
    for a in "${allow[@]}"; do
      if [[ "$app_name" == "$a" ]]; then ok=1; break; fi
    done
    if [[ "$ok" -eq 0 ]]; then
      echo "UNEXPECTED app (not in kit allowlist): apps/$app_name" >&2
      return 1
    fi
  done
  return 0
}

echo "== CP-EXTRACT self-test =="
TMP="$(mktemp -d -t cp-extract-XXXXXX)"
trap 'rm -rf "$TMP"' EXIT

# 1) planted kit table under apps/example-api → residency exit ≠ 0
FIX1="$TMP/residency-fail"
mkdir -p "$FIX1/packages/auth/src" "$FIX1/apps/example-api/src"
cat >"$FIX1/packages/auth/src/schema.ts" <<'EOF'
import { sqliteTable, text } from 'drizzle-orm/sqlite-core'
export const baOrganization = sqliteTable('organization', { id: text('id').primaryKey() })
EOF
cat >"$FIX1/apps/example-api/src/bad-schema.ts" <<'EOF'
import { sqliteTable, text } from 'drizzle-orm/sqlite-core'
export const bad = sqliteTable('organization', { id: text('id').primaryKey() })
EOF
assert_exit "residency rejects kit table in apps" 1 "EXTRACT_ROOT='$FIX1' bun run '$RESIDENCY'"

# 2) planted non-allowlisted app → allowlist exit ≠ 0 in kit mode
FIX2="$TMP/allowlist-fail"
mkdir -p "$FIX2/apps/example-api" "$FIX2/apps/acme-api"
assert_exit "allowlist rejects acme-api in kit mode" 1 "check_kit_allowlist '$FIX2' kit"

# 3) clean worktree residency passes
assert_exit "residency clean on live tree" 0 "EXTRACT_ROOT='$ROOT' bun run '$RESIDENCY'"

echo ""
echo "CP-EXTRACT self-test: $PASS passed, $FAIL failed"
[[ "$FAIL" -eq 0 ]]
