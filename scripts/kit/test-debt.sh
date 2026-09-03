#!/usr/bin/env bash
# CP-DEBT — table-driven self-test for scripts/kit/check-debt.ts
#
# Plants suppressions in a temp monorepo tree (never under live packages/apps).
# Covers untagged + expiry (git-seeded stale / pin / warn).
# Exit 0 only if all cases pass.
set -euo pipefail

unset GIT_DIR GIT_WORK_TREE GIT_COMMON_DIR 2>/dev/null || true

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
SCANNER="${ROOT}/scripts/kit/check-debt.ts"

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
  local months="${7:-6}"
  local got=0
  local out
  set +e
  out="$(
    DEBT_ROOT="${root}" \
      DEBT_UNTAGGED_MODE="${untagged_mode}" \
      DEBT_EXPIRY_MODE="${expiry_mode}" \
      DEBT_EXPIRY_MONTHS="${months}" \
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

# Init git repo under DEBT_ROOT with an old commit date (file inactivity proxy).
git_seed_old() {
  local base="$1"
  local marker_line="$2"
  seed_clean "${base}"
  cat >"${base}/packages/core/src/debt.ts" <<EOF
${marker_line}
export const x: any = 1
EOF
  git -C "${base}" init -q
  git -C "${base}" config user.email "cp-debt@test.local"
  git -C "${base}" config user.name "CP-DEBT"
  git -C "${base}" add -A
  # Old commit → older than DEBT_EXPIRY_MONTHS=6
  GIT_AUTHOR_DATE="2020-01-15T12:00:00 +0000" \
    GIT_COMMITTER_DATE="2020-01-15T12:00:00 +0000" \
    git -C "${base}" -c commit.gpgsign=false commit -q -m "old debt"
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

# 7. @ts-ignore untagged + fail
C7="${TMP}/tsi-bad"
seed_clean "${C7}"
cat >"${C7}/packages/core/src/bad-tsi.ts" <<'EOF'
// @ts-ignore no tag
export const w = 1 as never
EOF
assert_case "ts-ignore untagged" 1 "${C7}" fail off "untagged"

# 8. Stale DEBT (old git date, no pin) + expiry fail → exit 1 + stale
C8="${TMP}/stale-fail"
git_seed_old "${C8}" '// biome-ignore lint/suspicious/noExplicitAny: old — DEBT:stale-demo'
assert_case "stale expiry fail" 1 "${C8}" fail fail "stale"

# 9. Stale DEBT + expiry warn → exit 0 + stale
C9="${TMP}/stale-warn"
git_seed_old "${C9}" '// biome-ignore lint/suspicious/noExplicitAny: old — DEBT:stale-demo'
assert_case "stale expiry warn" 0 "${C9}" fail warn "stale"

# 10. Stale file + DEBT pin after slug → not stale (hard pin)
C10="${TMP}/stale-pin"
git_seed_old "${C10}" '// biome-ignore lint/suspicious/noExplicitAny: old — DEBT:stale-demo #42'
assert_case "stale with pin exempt" 0 "${C10}" fail fail "clean"

# 11. Accidental #333 in reason (before DEBT) must NOT pin → still stale under fail
C11="${TMP}/false-pin"
git_seed_old "${C11}" '// biome-ignore lint/suspicious/noExplicitAny: color #333 — DEBT:stale-demo'
assert_case "mid-reason hash does not pin" 1 "${C11}" fail fail "stale"

# 12. No git history → not stale (fail-open on untracked / no log)
C12="${TMP}/no-git"
seed_clean "${C12}"
cat >"${C12}/packages/core/src/debt.ts" <<'EOF'
// biome-ignore lint/suspicious/noExplicitAny: untracked — DEBT:no-git-demo
export const x: any = 1
EOF
assert_case "no git history not stale" 0 "${C12}" fail fail "clean"

echo ""
echo "CP-DEBT: ${PASS} passed, ${FAIL} failed"
if [[ "${FAIL}" -gt 0 ]]; then
  exit 1
fi
exit 0
