#!/usr/bin/env bash
# CP-IMPORT — table-driven self-test for scripts/check-import-boundaries.ts
#
# Plants illegal edges in a temp monorepo tree (never under live packages/apps).
# Exit 0 only if all cases pass.
set -euo pipefail

unset GIT_DIR GIT_WORK_TREE GIT_COMMON_DIR 2>/dev/null || true

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SCANNER="${ROOT}/scripts/check-import-boundaries.ts"

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
  local expect_tag="${4:-}"
  local got=0
  local out
  set +e
  out="$(IMPORT_BOUNDARY_ROOT="${root}" bun run "${SCANNER}" 2>&1)"
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

# Minimal workspace: one package + example-web + example-api with package.json names.
seed_workspace() {
  local base="$1"
  mkdir -p \
    "${base}/packages/core/src" \
    "${base}/apps/example-web/src" \
    "${base}/apps/example-api/src" \
    "${base}/tools"

  cat >"${base}/packages/core/package.json" <<'EOF'
{ "name": "@gosilex/core", "private": true }
EOF
  cat >"${base}/apps/example-web/package.json" <<'EOF'
{ "name": "@gosilex/example-web", "private": true }
EOF
  cat >"${base}/apps/example-api/package.json" <<'EOF'
{ "name": "@gosilex/example-api", "private": true }
EOF

  # Clean baseline sources (no violations)
  echo "export const ok = 1" >"${base}/packages/core/src/index.ts"
  echo "export const web = 1" >"${base}/apps/example-web/src/index.ts"
  echo "export const api = 1" >"${base}/apps/example-api/src/index.ts"

  # Empty exemptions with valid header only
  cat >"${base}/tools/import-boundary-exemptions.txt" <<'EOF'
# test exemptions
EOF
}

echo "== CP-IMPORT self-test =="
TMP="$(mktemp -d -t cp-import-XXXXXX)"
trap 'rm -rf "$TMP"' EXIT

# --- clean tree → 0 ---
CLEAN="${TMP}/clean"
seed_workspace "${CLEAN}"
assert_case "0 clean tree → 0" 0 "${CLEAN}"

# --- R1 workspace packages → apps ---
R1="${TMP}/r1"
seed_workspace "${R1}"
echo "import { api } from '@gosilex/example-api'" >"${R1}/packages/core/src/bad-r1.ts"
assert_case "1 R1 workspace packages→apps → 1" 1 "${R1}" "R1"

# --- R2 relative packages → apps ---
R2="${TMP}/r2"
seed_workspace "${R2}"
# packages/core/src → ../../../ = monorepo root
echo "import { api } from '../../../apps/example-api/src/index'" >"${R2}/packages/core/src/bad-r2.ts"
assert_case "2 R2 relative packages→apps → 1" 1 "${R2}" "R2"

# --- R3 example-web → example-api (workspace) ---
R3="${TMP}/r3"
seed_workspace "${R3}"
echo "import { api } from '@gosilex/example-api'" >"${R3}/apps/example-web/src/bad-r3.ts"
assert_case "3 R3 web→api → 1" 1 "${R3}" "R3"

# --- R3 relative web → api ---
R3R="${TMP}/r3rel"
seed_workspace "${R3R}"
echo "import { api } from '../../example-api/src/index'" >"${R3R}/apps/example-web/src/bad-r3-rel.ts"
assert_case "3b R3 relative web→api → 1" 1 "${R3R}" "R3"

# --- R4 cloudflare:workers from web ---
R4="${TMP}/r4"
seed_workspace "${R4}"
echo "import { env } from 'cloudflare:workers'" >"${R4}/apps/example-web/src/bad-r4.ts"
assert_case "4 R4 cloudflare:workers → 1" 1 "${R4}" "R4"

# --- R1 via export … from (fromRe / re-export) ---
R1E="${TMP}/r1export"
seed_workspace "${R1E}"
echo "export { api } from '@gosilex/example-api'" >"${R1E}/packages/core/src/bad-export.ts"
assert_case "1b R1 export-from → 1" 1 "${R1E}" "R1"

# --- R4 side-effect import '…' ---
R4S="${TMP}/r4side"
seed_workspace "${R4S}"
echo "import 'cloudflare:workers'" >"${R4S}/apps/example-web/src/bad-r4-side.ts"
assert_case "4b R4 side-effect import → 1" 1 "${R4S}" "R4"

# --- R1 dynamic import() ---
R1D="${TMP}/r1dyn"
seed_workspace "${R1D}"
echo "const m = await import('@gosilex/example-api')" >"${R1D}/packages/core/src/bad-dyn.ts"
assert_case "1c R1 import() → 1" 1 "${R1D}" "R1"

# --- R1 workspace with Vite query suffix (?raw) ---
R1Q="${TMP}/r1query"
seed_workspace "${R1Q}"
echo "import x from '@gosilex/example-api?raw'" >"${R1Q}/packages/core/src/bad-query.ts"
assert_case "1d R1 workspace?raw → 1" 1 "${R1Q}" "R1"

# --- comment must NOT trip R1 (comment strip) ---
CMT="${TMP}/comment"
seed_workspace "${CMT}"
echo "// import { api } from '@gosilex/example-api'" >"${CMT}/packages/core/src/ok-comment.ts"
assert_case "0b comment is not an edge → 0" 0 "${CMT}"

# --- exemption without reason (missing #) → exit 2 ---
E2="${TMP}/e2"
seed_workspace "${E2}"
echo "import { api } from '@gosilex/example-api'" >"${E2}/packages/core/src/bad.ts"
echo "packages/core/src/bad.ts" >"${E2}/tools/import-boundary-exemptions.txt"
assert_case "5 exemption without reason → 2" 2 "${E2}" "CONFIG"

# --- exemption empty reason after # → exit 2 ---
E2B="${TMP}/e2b"
seed_workspace "${E2B}"
echo "import { api } from '@gosilex/example-api'" >"${E2B}/packages/core/src/bad.ts"
echo "packages/core/src/bad.ts  #" >"${E2B}/tools/import-boundary-exemptions.txt"
assert_case "5b exemption empty reason → 2" 2 "${E2B}" "CONFIG"

# --- valid exemption suppresses R1 (paired: same tree without exemption would fail case 1) ---
EX="${TMP}/ex"
seed_workspace "${EX}"
echo "import { api } from '@gosilex/example-api'" >"${EX}/packages/core/src/bad.ts"
# without exemption → 1
assert_case "6a before exemption → 1" 1 "${EX}" "R1"
echo "packages/core/src/bad.ts  # temporary plant — #69" >"${EX}/tools/import-boundary-exemptions.txt"
assert_case "6b after exemption → 0" 0 "${EX}"

echo ""
echo "CP-IMPORT self-test: ${PASS} passed, ${FAIL} failed"
if [[ "${FAIL}" -gt 0 ]]; then
  exit 1
fi
exit 0
