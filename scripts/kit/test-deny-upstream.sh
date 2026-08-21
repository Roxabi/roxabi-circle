#!/usr/bin/env bash
# CP-DENY — table-driven harness for scripts/kit/deny-upstream-push.sh
#
# Kit clone heuristic: absence of product inheritance marker → kit no-op.
# Product fixtures must create config/product/inheritance.json (or transitional
# docs/product/kit-baseline) or the script stays in kit mode.
#
# Exit 0 only if all matrix rows + weaken probe pass.
set -euo pipefail

unset GIT_DIR GIT_WORK_TREE GIT_COMMON_DIR 2>/dev/null || true

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
SCRIPT="${ROOT}/scripts/kit/deny-upstream-push.sh"
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
  git --git-dir="${dir}/.git" --work-tree="${dir}" init -q
  git --git-dir="${dir}/.git" --work-tree="${dir}" config user.email "deny-test@example.com"
  git --git-dir="${dir}/.git" --work-tree="${dir}" config user.name "deny-test"
  echo "x" >"${dir}/README"
  git --git-dir="${dir}/.git" --work-tree="${dir}" add README
  LEFTHOOK=0 git --git-dir="${dir}/.git" --work-tree="${dir}" commit -q -m "init"
}

set_origin() {
  local dir="$1"
  local url="$2"
  if git --git-dir="${dir}/.git" --work-tree="${dir}" remote get-url origin >/dev/null 2>&1; then
    git --git-dir="${dir}/.git" --work-tree="${dir}" remote set-url origin "${url}"
  else
    git --git-dir="${dir}/.git" --work-tree="${dir}" remote add origin "${url}"
  fi
}

mark_product() {
  local dir="$1"
  mkdir -p "${dir}/config/product" "${dir}/docs/product"
  printf '%s\n' '{"version":1,"upstreamCommit":"deadbeefdeadbeefdeadbeefdeadbeefdeadbeef"}' \
    >"${dir}/config/product/inheritance.json"
}

echo "== CP-DENY matrix =="
TMP="$(mktemp -d -t cp-deny-XXXXXX)"
trap 'rm -rf "$TMP"' EXIT

# --- row 1: kit tree (no kit-baseline) → allow name upstream ---
KIT="${TMP}/kit"
make_repo "${KIT}"
set_origin "${KIT}" "https://github.com/example/kit-clone.git"
assert_exit "1 kit tree + name upstream → 0" 0 \
  env -u GIT_DIR -u GIT_WORK_TREE -u GIT_COMMON_DIR -C "${KIT}" \
    bash "${SCRIPT}" "upstream" "https://github.com/example/kit-parent.git"

# --- product base ---
PRODUCT="${TMP}/product"
make_repo "${PRODUCT}"
set_origin "${PRODUCT}" "file://${PRODUCT}"
mark_product "${PRODUCT}"

# --- row 2: product + name upstream → deny ---
assert_exit "2 product + name upstream → 1" 1 \
  env -u GIT_DIR -u GIT_WORK_TREE -u GIT_COMMON_DIR -C "${PRODUCT}" \
    bash "${SCRIPT}" "upstream" "https://example.com/innocent-parent.git"

# --- row 3: product + env chassis → deny ---
assert_exit "3 product + env chassis → 1" 1 \
  env -u GIT_DIR -u GIT_WORK_TREE -u GIT_COMMON_DIR -C "${PRODUCT}" \
    DENY_UPSTREAM_URL_SUBSTRINGS="${FIXTURE_CHASSIS}" \
    bash "${SCRIPT}" "bounce" "https://github.com/acme/${FIXTURE_CHASSIS}.git"

# --- row 4: product + docs/product/deny-upstream.json → deny ---
printf '%s\n' "{\"urlSubstrings\":[\"${FIXTURE_CHASSIS}\"]}" >"${PRODUCT}/docs/product/deny-upstream.json"
assert_exit "4 product + product JSON chassis → 1" 1 \
  env -u GIT_DIR -u GIT_WORK_TREE -u GIT_COMMON_DIR -u DENY_UPSTREAM_URL_SUBSTRINGS \
    -C "${PRODUCT}" \
    bash "${SCRIPT}" "bounce" "https://github.com/acme/${FIXTURE_CHASSIS}.git"
rm -f "${PRODUCT}/docs/product/deny-upstream.json"

# --- row 5: product innocent → allow ---
assert_exit "5 product + innocent remote → 0" 0 \
  env -u GIT_DIR -u GIT_WORK_TREE -u GIT_COMMON_DIR -u DENY_UPSTREAM_URL_SUBSTRINGS \
    -C "${PRODUCT}" \
    bash "${SCRIPT}" "origin" "file://${PRODUCT}"

# --- weaken probe: without name=upstream guard, name-only push is allowed ---
echo "== weaken probe (name=upstream) =="
STRIPPED="${TMP}/deny-stripped.sh"
cat >"${STRIPPED}" <<'STRIP'
#!/usr/bin/env bash
set -euo pipefail
remote_name="${1:-}"
remote_url="${2:-}"
REPO_ROOT="$(git rev-parse --show-toplevel 2>/dev/null || true)"
if [[ ! -f "${REPO_ROOT}/config/product/inheritance.json" && ! -f "${REPO_ROOT}/docs/product/kit-baseline" ]]; then exit 0; fi
# intentionally weakened: no name=upstream deny
exit 0
STRIP
chmod +x "${STRIPPED}"

assert_exit "weaken: no name guard → name=upstream allowed (0)" 0 \
  env -u GIT_DIR -u GIT_WORK_TREE -u GIT_COMMON_DIR -C "${PRODUCT}" \
    bash "${STRIPPED}" "upstream" "https://example.com/innocent-parent.git"

assert_exit "real script still denies name=upstream (1)" 1 \
  env -u GIT_DIR -u GIT_WORK_TREE -u GIT_COMMON_DIR -C "${PRODUCT}" \
    bash "${SCRIPT}" "upstream" "https://example.com/innocent-parent.git"

echo "== summary: ${PASS} pass, ${FAIL} fail =="
if [[ "${FAIL}" -ne 0 ]]; then
  exit 1
fi
echo "CP-DENY: OK"
exit 0
