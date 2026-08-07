#!/usr/bin/env bash
# CP-TS-MAJOR — table-driven self-test for scripts/check-typescript-major.sh
#
# Plants pin/lock fixtures in a temp monorepo tree (never under live packages/apps).
# Exit 0 only if all cases pass.
set -euo pipefail

unset GIT_DIR GIT_WORK_TREE GIT_COMMON_DIR 2>/dev/null || true

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SCANNER="${ROOT}/scripts/check-typescript-major.sh"

if [[ ! -f "${SCANNER}" ]]; then
  echo "FAIL: missing ${SCANNER}" >&2
  exit 1
fi

PASS=0
FAIL=0

# Same census as check-typescript-major.sh PIN_FILES
PIN_PATHS=(
  package.json
  packages/api-client/package.json
  packages/auth/package.json
  packages/core/package.json
  packages/db/package.json
  packages/email/package.json
  packages/flows/package.json
  packages/i18n/package.json
  packages/mcp/package.json
  packages/storage/package.json
  packages/types/package.json
  packages/ui/package.json
  apps/example-api/package.json
  apps/example-web/package.json
  apps/mcp-example/package.json
)

assert_case() {
  local name="$1"
  local expect="$2"
  local tree="$3"
  local expect_tag="${4:-}"
  local got=0
  local out
  set +e
  out="$(TS_MAJOR_ROOT="${tree}" bash "${SCANNER}" 2>&1)"
  got=$?
  set -e
  if [[ "${got}" -ne "${expect}" ]]; then
    echo "  FAIL: ${name} expected exit ${expect}, got ${got}" >&2
    echo "    out: $(echo "${out}" | tr '\n' ' ')" >&2
    FAIL=$((FAIL + 1))
    return
  fi
  if [[ -n "${expect_tag}" ]] && ! echo "${out}" | grep -q "${expect_tag}"; then
    echo "  FAIL: ${name} expected output to contain '${expect_tag}'" >&2
    echo "    out: $(echo "${out}" | tr '\n' ' ')" >&2
    FAIL=$((FAIL + 1))
    return
  fi
  echo "  PASS: ${name} (exit ${got})"
  PASS=$((PASS + 1))
}

write_pin() {
  local file="$1"
  local range="$2"
  mkdir -p "$(dirname "${file}")"
  # Minimal package.json — only typescript pin matters for the checker
  cat >"${file}" <<EOF
{
  "name": "fixture",
  "private": true,
  "devDependencies": {
    "typescript": "${range}"
  }
}
EOF
}

seed_pins() {
  local base="$1"
  local range="$2"
  local p
  for p in "${PIN_PATHS[@]}"; do
    write_pin "${base}/${p}" "${range}"
  done
}

# Minimal bun.lock lines the checker greps (not a full valid lockfile)
write_lock_ts7() {
  local base="$1"
  cat >"${base}/bun.lock" <<'EOF'
{
  "lockfileVersion": 1,
  "packages": {
    "typescript": ["typescript@7.0.2", "", {}, "sha512-fixture"]
  }
}
EOF
}

write_lock_ts5() {
  local base="$1"
  # Positive 7.x present + non-allowlisted nested residual @5 (D2 residual ban)
  cat >"${base}/bun.lock" <<'EOF'
{
  "lockfileVersion": 1,
  "packages": {
    "typescript": ["typescript@7.0.2", "", {}, "sha512-fixture"],
    "evil-tool/typescript": ["typescript@5.9.3", "", {}, "sha512-fixture-5"]
  }
}
EOF
}

write_lock_empty() {
  local base="$1"
  cat >"${base}/bun.lock" <<'EOF'
{
  "lockfileVersion": 1,
  "packages": {}
}
EOF
}

echo "== CP-TS-MAJOR self-test =="
TMP="$(mktemp -d -t cp-ts-major-XXXXXX)"
trap 'rm -rf "$TMP"' EXIT

# --- 0 golden ^7 + typescript@7 lock → 0 ---
G0="${TMP}/golden"
seed_pins "${G0}" "^7.0.2"
write_lock_ts7 "${G0}"
assert_case "0 golden ^7.0.2 + lock@7 → 0" 0 "${G0}" "OK"

# --- 1 pin still ^5.9 → 1 ---
B5="${TMP}/pin5"
seed_pins "${B5}" "^5.9.0"
write_lock_ts7 "${B5}"
assert_case "1 pin ^5.9.0 → 1" 1 "${B5}" "exclusive ^7"

# --- 2 dual-range pin → 1 ---
OR="${TMP}/or-range"
seed_pins "${OR}" "^7.0.2 || ^5.9.0"
write_lock_ts7 "${OR}"
assert_case "2 pin dual-range || → 1" 1 "${OR}" "exclusive ^7"

# --- 3 lock residual typescript@5 → 1 ---
L5="${TMP}/lock5"
seed_pins "${L5}" "^7.0.2"
write_lock_ts5 "${L5}"
assert_case "3 lock typescript@5 → 1" 1 "${L5}" "typescript@5/6"

# --- 4 lock missing typescript@7 → 1 ---
L0="${TMP}/lock-empty"
seed_pins "${L0}" "^7.0.2"
write_lock_empty "${L0}"
assert_case "4 lock missing typescript@7 → 1" 1 "${L0}" "missing positive typescript@7"

# --- 5 pin ^6 → 1 ---
B6="${TMP}/pin6"
seed_pins "${B6}" "^6.0.2"
write_lock_ts7 "${B6}"
assert_case "5 pin ^6.0.2 → 1" 1 "${B6}" "exclusive ^7"

# --- 6 bare 7.0.2 (no caret) → 1 ---
BARE="${TMP}/bare"
seed_pins "${BARE}" "7.0.2"
write_lock_ts7 "${BARE}"
assert_case "6 pin bare 7.0.2 → 1" 1 "${BARE}" "exclusive ^7"

echo "== CP-TS-MAJOR summary: ${PASS} pass, ${FAIL} fail =="
if [[ "${FAIL}" -ne 0 ]]; then
  exit 1
fi
exit 0
