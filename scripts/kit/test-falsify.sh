#!/usr/bin/env bash
# CP-FALSIFY — mechanical canary: oracle tests MUST fail (non-zero) if
# isGlobOrNullOrigin is neutered. Restores the source even on failure (trap).
# Oracle is exit status only — do not grep the failure snippet for glob|null
# (neutered globs fail isHttpOrigin with "no path", which never mentions those).
set -euo pipefail

unset GIT_DIR GIT_WORK_TREE GIT_COMMON_DIR 2>/dev/null || true

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
TARGET="${ROOT}/packages/auth/src/better-auth-env.ts"
TEST_FILE="${ROOT}/packages/auth/src/better-auth-origins.test.ts"

if [[ ! -f "${TARGET}" ]]; then
  echo "FAIL: missing ${TARGET}" >&2
  exit 1
fi
if [[ ! -f "${TEST_FILE}" ]]; then
  echo "FAIL: no oracle test file found (${TEST_FILE})" >&2
  exit 1
fi
if ! grep -q 'assertTrustedOrigins' "${TEST_FILE}"; then
  echo "FAIL: ${TEST_FILE} does not exercise assertTrustedOrigins" >&2
  exit 1
fi
if ! grep -q 'isGlobOrNullOrigin' "${TARGET}"; then
  echo "FAIL: isGlobOrNullOrigin not found in ${TARGET}" >&2
  exit 1
fi

BACKUP="$(mktemp)"
cp "${TARGET}" "${BACKUP}"
RESTORED=0
restore() {
  if [[ "${RESTORED}" -eq 1 ]]; then
    return 0
  fi
  cp "${BACKUP}" "${TARGET}" || {
    echo "FAIL: restore cp failed for ${TARGET}" >&2
    exit 1
  }
  if ! cmp -s "${BACKUP}" "${TARGET}"; then
    echo "FAIL: restore did not match backup for ${TARGET}" >&2
    exit 1
  fi
  RESTORED=1
  rm -f "${BACKUP}"
}
trap restore EXIT

python3 - "${TARGET}" <<'PY'
import pathlib
import re
import sys

path = pathlib.Path(sys.argv[1])
text = path.read_text()
pat = re.compile(
    r"function isGlobOrNullOrigin\([^)]*\):\s*boolean\s*\{.*?\n\}",
    re.S,
)
match = pat.search(text)
if not match:
    sys.exit(f"FAIL: could not locate isGlobOrNullOrigin body in {path}")
mutated = "function isGlobOrNullOrigin(_o: string): boolean {\n  return false\n}"
path.write_text(text[: match.start()] + mutated + text[match.end() :])
PY

set +e
OUT="$(
  cd "${ROOT}/packages/auth"
  bun run test -- src/better-auth-origins.test.ts 2>&1
)"
GOT=$?
set -e

REL="packages/auth/src/better-auth-env.ts"
if [[ "${GOT}" -eq 0 ]]; then
  echo "FAIL: oracle tests still passed after neutering isGlobOrNullOrigin (tautological?)" >&2
  echo "${OUT}" >&2
  exit 1
fi

set +e
SNIP="$(
  printf '%s\n' "${OUT}" | grep -E 'AssertionError|FAIL |toThrow|Error:' | head -n 8 | tr '\n' ' '
)"
set -e
if [[ -z "${SNIP}" ]]; then
  SNIP="$(printf '%s\n' "${OUT}" | tail -n 20 | tr '\n' ' ')"
fi

restore
trap - EXIT
echo "broke ${REL} → ${SNIP}"
exit 0
