#!/usr/bin/env bash
# CP-DENY — table-driven harness for scripts/deny-upstream-push.sh
#
# Fixtures use temp git repos. Product origin must NOT contain silex-boilerplate
# or the script stays in kit no-op mode (same pitfall as dogfood self-sim).
#
# Exit 0 only if all matrix rows + weaken probe pass.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SCRIPT="${ROOT}/scripts/deny-upstream-push.sh"
FIXTURE_CHASSIS="private-chassis-fixture"

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
  shift 2
  local got=0
  set +e
  "$@" >/tmp/deny-upstream-case.out 2>/tmp/deny-upstream-case.err
  got=$?
  set -e
  if [[ "${got}" -eq "${expect}" ]]; then
    echo "  PASS: ${name} (exit ${got})"
    PASS=$((PASS + 1))
  else
    echo "  FAIL: ${name} expected exit ${expect}, got ${got}" >&2
    echo "    stderr: $(tr '\n' ' ' </tmp/deny-upstream-case.err 2>/dev/null || true)" >&2
    FAIL=$((FAIL + 1))
  fi
}

make_repo() {
  local dir="$1"
  mkdir -p "${dir}"
  git -C "${dir}" init -q
  git -C "${dir}" config user.email "deny-test@example.com"
  git -C "${dir}" config user.name "deny-test"
  echo "x" >"${dir}/README"
  git -C "${dir}" add README
  # Avoid host lefthook noise in fixture commits
  LEFTHOOK=0 git -C "${dir}" commit -q -m "init"
}

echo "== CP-DENY matrix =="
TMP="$(mktemp -d -t cp-deny-XXXXXX)"
trap 'rm -rf "$TMP"' EXIT

# --- row 1: kit origin → allow name upstream ---
KIT="${TMP}/kit"
make_repo "${KIT}"
git -C "${KIT}" remote add origin "https://github.com/go-silex/silex-boilerplate.git"
assert_exit "1 kit origin + name upstream → 0" 0 \
  env -C "${KIT}" bash "${SCRIPT}" "upstream" "https://github.com/go-silex/silex-boilerplate.git"

# --- product base: origin must NOT match *silex-boilerplate* ---
PRODUCT="${TMP}/product"
make_repo "${PRODUCT}"
git -C "${PRODUCT}" remote add origin "file://${PRODUCT}"

# --- row 2: product + name upstream → deny ---
assert_exit "2 product + name upstream → 1" 1 \
  env -C "${PRODUCT}" bash "${SCRIPT}" "upstream" "https://example.com/innocent-parent.git"

# --- row 3: product + kit URL (any remote name) → deny ---
assert_exit "3 product + kit URL → 1" 1 \
  env -C "${PRODUCT}" bash "${SCRIPT}" "chassis" "git@github.com:go-silex/silex-boilerplate.git"

# --- row 4: product + env chassis only → deny ---
assert_exit "4 product + env chassis → 1" 1 \
  env -C "${PRODUCT}" DENY_UPSTREAM_URL_SUBSTRINGS="${FIXTURE_CHASSIS}" \
    bash "${SCRIPT}" "bounce" "https://github.com/acme/${FIXTURE_CHASSIS}.git"

# --- row 5: product + docs/product/deny-upstream.json only → deny ---
mkdir -p "${PRODUCT}/docs/product"
printf '%s\n' "{\"urlSubstrings\":[\"${FIXTURE_CHASSIS}\"]}" >"${PRODUCT}/docs/product/deny-upstream.json"
assert_exit "5 product + product JSON chassis → 1" 1 \
  env -C "${PRODUCT}" -u DENY_UPSTREAM_URL_SUBSTRINGS \
    bash "${SCRIPT}" "bounce" "https://github.com/acme/${FIXTURE_CHASSIS}.git"
rm -f "${PRODUCT}/docs/product/deny-upstream.json"

# --- row 6: product innocent → allow ---
assert_exit "6 product + innocent remote → 0" 0 \
  env -C "${PRODUCT}" -u DENY_UPSTREAM_URL_SUBSTRINGS \
    bash "${SCRIPT}" "origin" "file://${PRODUCT}"

# --- weaken probe: without name=upstream guard, name-only push is allowed ---
echo "== weaken probe (name=upstream) =="
STRIPPED="${TMP}/deny-stripped.sh"
cat >"${STRIPPED}" <<'STRIP'
#!/usr/bin/env bash
# intentionally weakened: no name=upstream deny
set -euo pipefail
remote_name="${1:-}"
remote_url="${2:-}"
REPO_ROOT="$(git rev-parse --show-toplevel 2>/dev/null || true)"
origin_url="$(git -C "${REPO_ROOT}" remote get-url origin 2>/dev/null || true)"
if [[ "${origin_url}" == *silex-boilerplate* ]]; then exit 0; fi
if [[ "${remote_url}" == *silex-boilerplate* ]]; then
  echo "deny (url only)" >&2
  exit 1
fi
exit 0
STRIP
chmod +x "${STRIPPED}"

assert_exit "weaken: no name guard → name=upstream allowed (0)" 0 \
  env -C "${PRODUCT}" bash "${STRIPPED}" "upstream" "https://example.com/innocent-parent.git"

assert_exit "real script still denies name=upstream (1)" 1 \
  env -C "${PRODUCT}" bash "${SCRIPT}" "upstream" "https://example.com/innocent-parent.git"

echo "== summary: ${PASS} pass, ${FAIL} fail =="
if [[ "${FAIL}" -ne 0 ]]; then
  exit 1
fi
echo "CP-DENY: OK"
exit 0
