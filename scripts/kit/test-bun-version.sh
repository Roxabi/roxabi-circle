#!/usr/bin/env bash
# Hermetic self-test for check-bun-version.ts. Fixtures only; no network.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd -P)"
SCANNER="${ROOT}/scripts/kit/check-bun-version.ts"
[[ -f "$SCANNER" ]] || { echo "FAIL: missing $SCANNER" >&2; exit 1; }

PASS=0
FAIL=0
assert_case() {
  local name="$1" expected="$2" tree="$3" marker="$4"
  local output rc=0
  output="$(BUN_VERSION_ROOT="$tree" bun "$SCANNER" 2>&1)" || rc=$?
  if [[ "$rc" -eq "$expected" ]] && [[ "$output" == *"$marker"* ]]; then
    echo "PASS: $name"
    PASS=$((PASS + 1))
  else
    echo "FAIL: $name (expected rc=$expected and marker '$marker', got rc=$rc)" >&2
    echo "$output" >&2
    FAIL=$((FAIL + 1))
  fi
}

write_base() {
  local tree="$1"
  mkdir -p "$tree/.claude" "$tree/.github/workflows" "$tree/docs/kit/templates"
  cat >"$tree/package.json" <<'EOF'
{
  "name": "fixture",
  "private": true,
  "packageManager": "bun@1.3.14"
}
EOF
  cat >"$tree/.claude/stack.yml" <<'EOF'
schema_version: "1.0"
runtime: bun
package_manager: bun
EOF
  cat >"$tree/.github/workflows/ci.yml" <<'EOF'
name: CI
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: oven-sh/setup-bun@v2
        with:
          bun-version-file: package.json
      - run: bun test
EOF
  cat >"$tree/docs/kit/templates/product-ci.yaml" <<'EOF'
name: Product CI template
jobs:
  test:
    steps:
      - name: Set up Bun
        uses: oven-sh/setup-bun@v2
        with:
          bun-version-file: "package.json"
EOF
}

TMP="$(mktemp -d -t bun-version.XXXXXX)"
trap 'rm -rf "$TMP"' EXIT

echo "== Bun version self-test =="
BASE="$TMP/base"
write_base "$BASE"
assert_case "package.json version file is the only SSoT" 0 "$BASE" "check-bun-version: OK (bun@1.3.14, 2 setup-bun step(s)"

DUPLICATE="$TMP/duplicate"
cp -R "$BASE" "$DUPLICATE"
printf 'bun_version: "1.3.14"\n' >>"$DUPLICATE/.claude/stack.yml"
assert_case "duplicated stack version" 1 "$DUPLICATE" "bun_version is forbidden"

PINNED="$TMP/pinned-workflow"
cp -R "$BASE" "$PINNED"
cat >"$PINNED/.github/workflows/ci.yml" <<'EOF'
name: CI
jobs:
  test:
    steps:
      - uses: oven-sh/setup-bun@v2
        with:
          bun-version: 1.3.14
EOF
assert_case "numeric workflow pin" 1 "$PINNED" "numeric bun-version pin is forbidden: 1.3.14"

echo "== Bun version summary: $PASS pass, $FAIL fail =="
[[ "$FAIL" -eq 0 ]]
