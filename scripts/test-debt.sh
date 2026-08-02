#!/usr/bin/env bash
# CP-DEBT — table-driven self-test for scripts/check-debt.ts
#
# Plants suppressions in a temp monorepo tree (never under live packages/apps).
# Exit 0 only if all cases pass.
set -euo pipefail

unset GIT_DIR GIT_WORK_TREE GIT_COMMON_DIR 2>/dev/null || true

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SCANNER="${ROOT}/scripts/check-debt.ts"

if [[ ! -f "${SCANNER}" ]]; then
  echo "FAIL: missing ${SCANNER}" >&2
  exit 1
fi

PASS=0
FAIL=0

assert_case() {
  local name="$1"
  local expect="$2"
  local root="$3"
  local untagged_mode="${4:-fail}"
  local expiry_mode="${5:-off}"
  local expect_tag="${6:-}"
  local got=0
  local out
  set +e
  out="$(
    DEBT_ROOT="${root}" \
      DEBT_UNTAGGED_MODE="${untagged_mode}" \
      DEBT_EXPIRY_MODE="${expiry_mode}" \
      bun run "${SCANNER}" 2>&1
  )"
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

seed_clean() {
  local base="$1"
  mkdir -p "${base}/packages/core/src" "${base}/apps/example-api/src"
  cat >"${base}/packages/core/src/ok.ts" <<'EOF'
export const ok = 1
// no suppressions
EOF
  cat >"${base}/apps/example-api/src/ok.ts" <<'EOF'
export const api = 1
EOF
}

seed_untagged() {
  local base="$1"
  seed_clean "${base}"
  cat >"${base}/packages/core/src/bad.ts" <<'EOF'
// biome-ignore lint/suspicious/noExplicitAny: missing debt tag
export const x: any = 1
EOF
}

seed_tagged() {
  local base="$1"
  seed_clean "${base}"
  cat >"${base}/packages/core/src/tagged.ts" <<'EOF'
// biome-ignore lint/suspicious/noExplicitAny: intentional — DEBT:demo-any #1
export const x: any = 1
EOF
}

seed_ts_expect() {
  local base="$1"
  seed_clean "${base}"
  cat >"${base}/packages/core/src/ts.ts" <<'EOF'
// @ts-expect-error legacy — DEBT:legacy-binding
export const y = 1 as never
EOF
}

echo "== CP-DEBT self-test =="
TMP="$(mktemp -d -t cp-debt-XXXXXX)"
trap 'rm -rf "$TMP"' EXIT

# 1. Clean tree → exit 0
C1="${TMP}/clean"
seed_clean "${C1}"
assert_case "clean tree" 0 "${C1}" fail off "clean"

# 2. Untagged + fail mode → exit 1 + UNTAGGED-ish message
C2="${TMP}/untagged"
seed_untagged "${C2}"
assert_case "untagged fail" 1 "${C2}" fail off "untagged"

# 3. Untagged + warn mode → exit 0 but still reports
C3="${TMP}/untagged-warn"
seed_untagged "${C3}"
assert_case "untagged warn" 0 "${C3}" warn off "untagged"

# 4. Tagged DEBT → exit 0
C4="${TMP}/tagged"
seed_tagged "${C4}"
assert_case "tagged DEBT" 0 "${C4}" fail off "clean"

# 5. @ts-expect-error with DEBT → exit 0
C5="${TMP}/tse"
seed_ts_expect "${C5}"
assert_case "ts-expect-error tagged" 0 "${C5}" fail off "clean"

# 6. @ts-expect-error untagged + fail
C6="${TMP}/tse-bad"
seed_clean "${C6}"
cat >"${C6}/packages/core/src/bad-ts.ts" <<'EOF'
// @ts-expect-error no tag
export const z = 1 as never
EOF
assert_case "ts-expect-error untagged" 1 "${C6}" fail off "untagged"

echo ""
echo "CP-DEBT: ${PASS} passed, ${FAIL} failed"
if [[ "${FAIL}" -gt 0 ]]; then
  exit 1
fi
exit 0
