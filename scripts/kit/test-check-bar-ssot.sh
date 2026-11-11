#!/usr/bin/env bash
# Self-test for scripts/kit/check-bar-ssot.sh
#
# Exit 0 only if fixture matrix + live kit tree pass.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd -P)"
SCRIPT="${ROOT}/scripts/kit/check-bar-ssot.sh"

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
  echo "  PASS: ${name} (exit ${got})"
  PASS=$((PASS + 1))
}

seed_ok() {
  local tree="$1"
  mkdir -p "${tree}/docs/kit/standards" "${tree}/docs/kit/processes" "${tree}/scripts/kit"
  cp "${ROOT}/scripts/kit/root-gate.ts" "${tree}/scripts/kit/root-gate.ts"
  cat >"${tree}/package.json" <<'EOF'
{
  "scripts": {
    "validate:full": "bun run scripts/kit/root-gate.ts uniquely-zz-gate lint typecheck banlist zod-major ts-major import-boundary test:kit-schema-sync wrangler-migrations:check test:wrangler-migrations zero-edit extract-dry-run test:coverage",
    "uniquely-zz-gate": "true", "lint": "true", "typecheck": "true", "banlist": "true",
    "zod-major": "true", "ts-major": "true", "import-boundary": "true",
    "test:kit-schema-sync": "true", "wrangler-migrations:check": "true",
    "test:wrangler-migrations": "true", "zero-edit": "true", "extract-dry-run": "true",
    "test:coverage": "true"
  }
}
EOF
  cat >"${tree}/AGENTS.md" <<'EOF'
# kit
pre-push runs `bun run validate:full` (SSoT: root package.json).
EOF
  cat >"${tree}/docs/kit/testing.md" <<'EOF'
# testing
Primary bar: `bun run validate:full`.
EOF
  cat >"${tree}/docs/kit/README.md" <<'EOF'
# docs
Primary bar: `bun run validate:full`.
EOF
  cat >"${tree}/docs/kit/standards/stack.md" <<'EOF'
# stack
Primary bar: `bun run validate:full`.
EOF
  cat >"${tree}/docs/kit/processes/dev-process.md" <<'EOF'
# development process
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

assert_exit "live kit tree → 0" 0 "${ROOT}"

OK="${TMP}/ok"
seed_ok "${OK}"
assert_exit "pointer-only docs → 0" 0 "${OK}"

BAD_LINE="${TMP}/bad-line"
seed_ok "${BAD_LINE}"
cat >"${BAD_LINE}/AGENTS.md" <<'EOF'
# kit
CI = validate:full (= lint · typecheck · banlist · zod-major · test:kit-schema-sync · wrangler-migrations)
EOF
assert_exit "single-line inventory → 1" 1 "${BAD_LINE}"

BAD_STANDARD="${TMP}/bad-standard"
seed_ok "${BAD_STANDARD}"
cat >"${BAD_STANDARD}/docs/kit/standards/stack.md" <<'EOF'
# stack
CI = validate:full (= lint · typecheck · banlist · zod-major)
EOF
assert_exit "normative stack inventory → 1" 1 "${BAD_STANDARD}"

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
assert_exit "wrapped middot inventory → 1" 1 "${BAD_WRAP}"

TWO="${TMP}/two-markers"
seed_ok "${TWO}"
cat >"${TWO}/docs/kit/testing.md" <<'EOF'
| **CP-KIT-SCHEMA** | sync + wrangler | `bun run test:kit-schema-sync` · `bun run wrangler-migrations:check` |
EOF
assert_exit "two markers on a CP row → 0" 0 "${TWO}"

THREE="${TMP}/three-no-vf"
seed_ok "${THREE}"
cat >"${THREE}/docs/kit/testing.md" <<'EOF'
| **CP-KIT-SCHEMA** | sync + wrangler | `bun run test:kit-schema-sync` · `bun run wrangler-migrations:check` · `bun run test:wrangler-migrations` |
EOF
assert_exit "three markers without validate:full → 0" 0 "${THREE}"

NEW_MARKERS="${TMP}/new-markers"
seed_ok "${NEW_MARKERS}"
cat >"${NEW_MARKERS}/AGENTS.md" <<'EOF'
# kit
CI = validate:full (= uniquely-zz-gate · lint · typecheck)
EOF
assert_exit "tokenizer unique name from fixture package.json → 1" 1 "${NEW_MARKERS}"

BAD_LH="${TMP}/bad-lefthook"
seed_ok "${BAD_LH}"
cat >"${BAD_LH}/lefthook.yml" <<'EOF'
pre-push:
  commands:
    validate-full:
      run: bun run lint && bun run typecheck && bun run ts-major && bun run import-boundary
EOF
assert_exit "lefthook copies inner steps → 1" 1 "${BAD_LH}"

PLAN_LH="${TMP}/plan-lefthook"
seed_ok "${PLAN_LH}"
cat >"${PLAN_LH}/lefthook.yml" <<'EOF'
pre-push:
  commands:
    validate-full:
      run: bun run validate:full -- --plan
EOF
assert_exit "lefthook plan is not full execution → 1" 1 "${PLAN_LH}"

PLAN_CI="${TMP}/plan-ci"
seed_ok "${PLAN_CI}"
mkdir -p "${PLAN_CI}/.github/workflows"
cat >"${PLAN_CI}/.github/workflows/ci.yml" <<'EOF'
jobs:
  quality:
    steps:
      - run: bun run validate:full -- --plan
EOF
assert_exit "ci plan is not full execution → 1" 1 "${PLAN_CI}"

PARTIAL_CI="${TMP}/partial-ci"
seed_ok "${PARTIAL_CI}"
mkdir -p "${PARTIAL_CI}/.github/workflows"
cat >"${PARTIAL_CI}/.github/workflows/ci.yml" <<'EOF'
jobs:
  quality:
    steps:
      - run: bun run validate:full -- --ci-group core --receipt /tmp/root-core.json
EOF
assert_exit "ci partial group is not full execution → 1" 1 "${PARTIAL_CI}"

BAD_CI="${TMP}/bad-ci"
seed_ok "${BAD_CI}"
mkdir -p "${BAD_CI}/.github/workflows"
cat >"${BAD_CI}/.github/workflows/ci.yml" <<'EOF'
jobs:
  quality:
    steps:
      - run: echo "bun run validate:full"
EOF
assert_exit "ci echo substring is not invoke by name → 1" 1 "${BAD_CI}"

COMMENT_CI="${TMP}/comment-ci"
seed_ok "${COMMENT_CI}"
mkdir -p "${COMMENT_CI}/.github/workflows"
printf '%s\n' '# bun run validate:full' >"${COMMENT_CI}/.github/workflows/ci.yml"
assert_exit "ci comment is not invocation → 1" 1 "${COMMENT_CI}"

BAD_RECIPE="${TMP}/bad-recipe"
seed_ok "${BAD_RECIPE}"
TREE="${BAD_RECIPE}" bun -e 'const p = `${process.env.TREE}/package.json`; const j = await Bun.file(p).json(); j.scripts["validate:full"] += " test:coverage"; await Bun.write(p, JSON.stringify(j))'
assert_exit "duplicate coverage in canonical recipe → 1" 1 "${BAD_RECIPE}"

OK_CI="${TMP}/ok-ci"
seed_ok "${OK_CI}"
mkdir -p "${OK_CI}/.github/workflows"
cat >"${OK_CI}/.github/workflows/ci.yml" <<'EOF'
jobs:
  quality:
    steps:
      - run: bun run validate:full
EOF
assert_exit "ci run: bun run validate:full → 0" 0 "${OK_CI}"

MISSING_DOCS="${TMP}/missing-docs"
seed_ok "${MISSING_DOCS}"
rm -f "${MISSING_DOCS}/docs/kit/testing.md"
assert_exit "missing docs/kit/testing.md → 1" 1 "${MISSING_DOCS}"

MISSING_PKG="${TMP}/missing-pkg"
mkdir -p "${MISSING_PKG}"
echo '# only agents' >"${MISSING_PKG}/AGENTS.md"
assert_exit "missing package.json → 1" 1 "${MISSING_PKG}"

echo "== summary: ${PASS} passed, ${FAIL} failed =="
if [[ "${FAIL}" -ne 0 ]]; then
  exit 1
fi
echo "CP-BAR-SSOT: OK"
exit 0
