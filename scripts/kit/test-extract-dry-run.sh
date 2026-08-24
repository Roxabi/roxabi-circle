#!/usr/bin/env bash
# CP-EXTRACT — self-test for extract identity (ADR-0009 D5), residency, kit app allowlist
set -euo pipefail

unset GIT_DIR GIT_WORK_TREE GIT_COMMON_DIR 2>/dev/null || true

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
RESIDENCY="${ROOT}/scripts/kit/extract-residency.ts"
IDENTITY="${ROOT}/scripts/kit/resolve-tree-identity.mjs"
ZONES_SRC="${ROOT}/config/kit/zero-edit-zones.json"

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

assert_output() {
  local name="$1" expect_pat="$2" cmd="$3"
  local got=0 out
  set +e
  out="$(eval "$cmd" 2>&1)"
  got=$?
  set -e
  if [[ "$got" -ne 0 ]]; then
    echo "  FAIL: $name expected exit 0, got $got" >&2
    echo "    out: $(echo "$out" | tr '\n' ' ')" >&2
    FAIL=$((FAIL + 1))
    return
  fi
  if ! echo "$out" | grep -qE "$expect_pat"; then
    echo "  FAIL: $name output missing pattern: $expect_pat" >&2
    echo "    out: $(echo "$out" | tr '\n' ' ')" >&2
    FAIL=$((FAIL + 1))
    return
  fi
  echo "  PASS: $name"
  PASS=$((PASS + 1))
}

check_kit_allowlist() {
  local tree="$1"
  local mode="${2:-kit}"
  [[ "$mode" == "kit" ]] || return 0
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

make_repo() {
  local dir="$1"
  mkdir -p "${dir}/config/kit" "${dir}/config/product"
  cp "${ZONES_SRC}" "${dir}/config/kit/zero-edit-zones.json"
  git --git-dir="${dir}/.git" --work-tree="${dir}" init -q
  git --git-dir="${dir}/.git" --work-tree="${dir}" config user.email "extract-test@example.com"
  git --git-dir="${dir}/.git" --work-tree="${dir}" config user.name "extract-test"
  echo "fixture" >"${dir}/README"
  git --git-dir="${dir}/.git" --work-tree="${dir}" add README config
  LEFTHOOK=0 git --git-dir="${dir}/.git" --work-tree="${dir}" commit -q -m "init"
}

set_origin() {
  local dir="$1" url="$2"
  if git --git-dir="${dir}/.git" --work-tree="${dir}" remote get-url origin >/dev/null 2>&1; then
    git --git-dir="${dir}/.git" --work-tree="${dir}" remote set-url origin "${url}"
  else
    git --git-dir="${dir}/.git" --work-tree="${dir}" remote add origin "${url}"
  fi
}

mark_product() {
  local dir="$1"
  mkdir -p "${dir}/config/product"
  printf '%s\n' '{"version":1,"upstreamCommit":"deadbeefdeadbeefdeadbeefdeadbeefdeadbeef"}' \
    >"${dir}/config/product/inheritance.json"
}

resolve_mode() {
  local dir="$1"
  shift
  env -u GIT_DIR -u GIT_WORK_TREE -u GIT_COMMON_DIR \
    ROOT="${dir}" "$@" node "${IDENTITY}" 2>&1 | sed -n 's/^mode=\([^ ]*\).*/\1/p'
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

# 4) live kit tree classifies as kit
assert_output "live tree classifies kit" '^mode=kit' "ROOT='$ROOT' node '$IDENTITY'"

# 5) product tree with acme-api classifies product + allowlist skipped
PRODUCT="$TMP/product-pass"
make_repo "${PRODUCT}"
set_origin "${PRODUCT}" "https://github.com/acme/product-consumer.git"
mark_product "${PRODUCT}"
mkdir -p "${PRODUCT}/apps/example-api" "${PRODUCT}/apps/acme-api"
mode="$(resolve_mode "${PRODUCT}")"
if [[ "$mode" != "product" ]]; then
  echo "  FAIL: product tree expected mode=product, got mode=${mode}" >&2
  FAIL=$((FAIL + 1))
else
  echo "  PASS: product tree classifies product"
  PASS=$((PASS + 1))
fi
assert_exit "product tree skips kit allowlist for acme-api" 0 "check_kit_allowlist '${PRODUCT}' product"

# 6) kit fixture with acme-api fails allowlist
KIT="$TMP/kit-fail"
make_repo "${KIT}"
set_origin "${KIT}" "https://github.com/Roxabi/roxabi-boilerplate-cf.git"
mkdir -p "${KIT}/apps/example-api" "${KIT}/apps/acme-api"
mode="$(resolve_mode "${KIT}")"
if [[ "$mode" != "kit" ]]; then
  echo "  FAIL: kit fixture expected mode=kit, got mode=${mode}" >&2
  FAIL=$((FAIL + 1))
else
  echo "  PASS: kit fixture classifies kit"
  PASS=$((PASS + 1))
fi
assert_exit "kit fixture rejects acme-api" 1 "check_kit_allowlist '${KIT}' kit"

# 7) product tree + harness force-kit still fails on product apps
SENTINEL="$TMP/harness-sentinel"
touch "${SENTINEL}"
mode="$(resolve_mode "${PRODUCT}" EXTRACT_MODE=kit EXTRACT_HARNESS_SENTINEL="${SENTINEL}")"
if [[ "$mode" != "kit" ]]; then
  echo "  FAIL: harness force-kit expected mode=kit, got mode=${mode}" >&2
  FAIL=$((FAIL + 1))
else
  echo "  PASS: harness force-kit on product tree → kit mode"
  PASS=$((PASS + 1))
fi
assert_exit "product + EXTRACT_MODE=kit + sentinel fails allowlist" 1 \
  "check_kit_allowlist '${PRODUCT}' kit"

# 8) EXTRACT_MODE=mono without sentinel → die
assert_exit "EXTRACT_MODE=mono without sentinel rejected" 1 \
  "ROOT='${KIT}' EXTRACT_MODE=mono node '${IDENTITY}'"

# 9) kit tree + EXTRACT_MODE=mono with sentinel still kit mode (no allowlist bypass)
mode="$(resolve_mode "${KIT}" EXTRACT_MODE=mono EXTRACT_HARNESS_SENTINEL="${SENTINEL}")"
if [[ "$mode" != "kit" ]]; then
  echo "  FAIL: kit + mono sentinel expected effective mode=kit, got ${mode}" >&2
  FAIL=$((FAIL + 1))
else
  echo "  PASS: kit + mono sentinel stays kit (no allowlist bypass)"
  PASS=$((PASS + 1))
fi
assert_exit "kit + mono sentinel still rejects acme-api" 1 "check_kit_allowlist '${KIT}' kit"

echo ""
echo "CP-EXTRACT self-test: $PASS passed, $FAIL failed"
[[ "$FAIL" -eq 0 ]]
