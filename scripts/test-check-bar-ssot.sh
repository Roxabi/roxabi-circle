#!/usr/bin/env bash
# Self-test for scripts/check-bar-ssot.sh
#
# Exit 0 only if fixture matrix + live kit tree pass.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd -P)"
SCRIPT="${ROOT}/scripts/check-bar-ssot.sh"

if [[ ! -f "${SCRIPT}" ]]; then
  echo "FAIL: missing ${SCRIPT}" >&2
  exit 1
fi
chmod +x "${SCRIPT}" 2>/dev/null || true

PASS=0
FAIL=0

assert_exit() {
  local name="$1"
  local expect="$2"
  local tree="$3"
  local expect_tag="${4:-}"
  local got=0
  local out
  set +e
  out="$(BAR_SSOT_ROOT="${tree}" bash "${SCRIPT}" 2>&1)"
  got=$?
  set -e
  if [[ "${got}" -ne "${expect}" ]]; then
    echo "  FAIL: ${name} expected exit ${expect}, got ${got}" >&2
    echo "    out: $(echo "${out}" | tr '\n' ' ')" >&2
    FAIL=$((FAIL + 1))
    return
  fi
  if [[ -n "${expect_tag}" ]] && ! echo "${out}" | grep -Fq "${expect_tag}"; then
    echo "  FAIL: ${name} expected output to contain '${expect_tag}'" >&2
    echo "    out: $(echo "${out}" | tr '\n' ' ')" >&2
    FAIL=$((FAIL + 1))
    return
  fi
  echo "  PASS: ${name} (exit ${got})"
  PASS=$((PASS + 1))
}

seed_ok() {
  local tree="$1"
  mkdir -p "${tree}/docs"
  cat >"${tree}/package.json" <<'EOF'
{
  "scripts": {
    "validate:full": "bun run uniquely-zz-gate && bun run lint && bun run typecheck && bun run banlist && bun run zod-major && bun run ts-major && bun run import-boundary && bun run test:kit-schema-sync && bun run wrangler-migrations:check && bun run test:wrangler-migrations && bun run zero-edit && bun run extract-dry-run"
  }
}
EOF
  cat >"${tree}/AGENTS.md" <<'EOF'
# kit
pre-push runs `bun run validate:full` (SSoT: root package.json).
EOF
  cat >"${tree}/docs/testing.md" <<'EOF'
# testing
Primary bar: `bun run validate:full`.
EOF
  cat >"${tree}/lefthook.yml" <<'EOF'
# steps = package.json `validate:full` — do not copy them here.
pre-push:
  commands:
    validate-full:
      run: bun run validate:full
EOF
}

echo "== CP-BAR-SSOT =="
TMP="$(mktemp -d -t cp-bar-ssot-XXXXXX)"
trap 'rm -rf "$TMP"' EXIT

assert_exit "live kit tree → 0" 0 "${ROOT}" "check-bar-ssot: OK"

OK="${TMP}/ok"
seed_ok "${OK}"
assert_exit "pointer-only docs → 0" 0 "${OK}" "check-bar-ssot: OK"

BAD_LINE="${TMP}/bad-line"
seed_ok "${BAD_LINE}"
cat >"${BAD_LINE}/AGENTS.md" <<'EOF'
# kit
CI = validate:full (= lint · typecheck · banlist · zod-major · test:kit-schema-sync · wrangler-migrations)
EOF
assert_exit "single-line inventory → 1" 1 "${BAD_LINE}" "step list belongs in package.json"

BAD_WRAP="${TMP}/bad-wrap"
seed_ok "${BAD_WRAP}"
cat >"${BAD_WRAP}/lefthook.yml" <<'EOF'
# validate:full = uniquely-zz-gate · lint ·
#                 typecheck · banlist
pre-push:
  commands:
    validate-full:
      run: bun run validate:full
EOF
assert_exit "wrapped middot inventory → 1" 1 "${BAD_WRAP}" "wrapped validate:full"

TWO="${TMP}/two-markers"
seed_ok "${TWO}"
cat >"${TWO}/docs/testing.md" <<'EOF'
| **CP-KIT-SCHEMA** | sync + wrangler | `bun run test:kit-schema-sync` · `bun run wrangler-migrations:check` |
EOF
assert_exit "two markers on a CP row → 0" 0 "${TWO}" "check-bar-ssot: OK"

THREE="${TMP}/three-no-vf"
seed_ok "${THREE}"
cat >"${THREE}/docs/testing.md" <<'EOF'
| **CP-KIT-SCHEMA** | sync + wrangler | `bun run test:kit-schema-sync` · `bun run wrangler-migrations:check` · `bun run test:wrangler-migrations` |
EOF
assert_exit "three markers without validate:full → 0" 0 "${THREE}" "check-bar-ssot: OK"

NEW_MARKERS="${TMP}/new-markers"
seed_ok "${NEW_MARKERS}"
cat >"${NEW_MARKERS}/AGENTS.md" <<'EOF'
# kit
CI = validate:full (= uniquely-zz-gate · lint · typecheck)
EOF
assert_exit "tokenizer unique name from fixture package.json → 1" 1 "${NEW_MARKERS}" "step list belongs in package.json"

BAD_LH="${TMP}/bad-lefthook"
seed_ok "${BAD_LH}"
cat >"${BAD_LH}/lefthook.yml" <<'EOF'
pre-push:
  commands:
    validate-full:
      run: bun run lint && bun run typecheck && bun run ts-major && bun run import-boundary
EOF
assert_exit "lefthook copies inner steps → 1" 1 "${BAD_LH}" "by name"

BAD_CI="${TMP}/bad-ci"
seed_ok "${BAD_CI}"
mkdir -p "${BAD_CI}/.github/workflows"
cat >"${BAD_CI}/.github/workflows/ci.yml" <<'EOF'
jobs:
  quality:
    steps:
      - run: echo "bun run validate:full"
EOF
assert_exit "ci echo substring is not invoke by name → 1" 1 "${BAD_CI}" "by name"

OK_CI="${TMP}/ok-ci"
seed_ok "${OK_CI}"
mkdir -p "${OK_CI}/.github/workflows"
cat >"${OK_CI}/.github/workflows/ci.yml" <<'EOF'
jobs:
  quality:
    steps:
      - run: bun run validate:full
EOF
assert_exit "ci run: bun run validate:full → 0" 0 "${OK_CI}" "check-bar-ssot: OK"

MISSING_DOCS="${TMP}/missing-docs"
seed_ok "${MISSING_DOCS}"
rm -f "${MISSING_DOCS}/docs/testing.md"
assert_exit "missing docs/testing.md → 1" 1 "${MISSING_DOCS}" "missing docs/testing.md"

MISSING_PKG="${TMP}/missing-pkg"
mkdir -p "${MISSING_PKG}"
echo '# only agents' >"${MISSING_PKG}/AGENTS.md"
assert_exit "missing package.json → 1" 1 "${MISSING_PKG}" "missing package.json"

echo "== summary: ${PASS} passed, ${FAIL} failed =="
if [[ "${FAIL}" -ne 0 ]]; then
  exit 1
fi
echo "CP-BAR-SSOT: OK"
exit 0
