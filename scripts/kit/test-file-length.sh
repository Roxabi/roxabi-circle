#!/usr/bin/env bash
# CP-FILE-LENGTH — table-driven harness for tools/check_file_length.sh
#
# Builds a temp git repo (never plants under the live apps/ or packages/).
# Invokes the live checker by absolute path with -C "$TMP".
# Exit 0 only if all matrix rows pass.
set -euo pipefail

unset GIT_DIR GIT_WORK_TREE GIT_COMMON_DIR 2>/dev/null || true

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
CHECKER="${ROOT}/tools/check_file_length.sh"

if [[ ! -f "${CHECKER}" ]]; then
  echo "FAIL: missing ${CHECKER}" >&2
  exit 1
fi
chmod +x "${CHECKER}" 2>/dev/null || true

PASS=0
FAIL=0

assert_exit() {
  local name="$1"
  local expect="$2"
  local expect_tag="${3:-}"
  shift 3
  local got=0
  local out
  set +e
  out="$("$@" 2>&1)"
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

make_repo() {
  local dir="$1"
  mkdir -p "${dir}"
  git --git-dir="${dir}/.git" --work-tree="${dir}" init -q
  git --git-dir="${dir}/.git" --work-tree="${dir}" config user.email "file-length@example.com"
  git --git-dir="${dir}/.git" --work-tree="${dir}" config user.name "file-length"
  echo "x" >"${dir}/README"
  git --git-dir="${dir}/.git" --work-tree="${dir}" add README
  LEFTHOOK=0 git --git-dir="${dir}/.git" --work-tree="${dir}" commit -q -m "init"
}

write_n_lines() {
  local file="$1"
  local n="$2"
  mkdir -p "$(dirname "${file}")"
  : >"${file}"
  local i
  for i in $(seq 1 "${n}"); do
    echo "// line ${i}" >>"${file}"
  done
}

run_checker() {
  local tree="$1"
  local mode="$2"
  shift 2
  env -u GIT_DIR -u GIT_WORK_TREE -u GIT_COMMON_DIR \
    -u QG_FILE_MAX -u QG_FILE_EXEMPTIONS -u QG_FILE_ROOTS -u QG_FILE_PRODUCT_EXEMPTIONS \
    -C "${tree}" \
    QG_FILE_MODE="${mode}" \
    "$@" \
    bash "${CHECKER}"
}

echo "== CP-FILE-LENGTH matrix =="
TMP="$(mktemp -d -t cp-file-length-XXXXXX)"
trap 'rm -rf "$TMP"' EXIT

# --- allow under cap ---
ALLOW="${TMP}/allow"
make_repo "${ALLOW}"
mkdir -p "${ALLOW}/tools" "${ALLOW}/config/product"
: >"${ALLOW}/tools/file_exemptions.txt"
write_n_lines "${ALLOW}/apps/acme-web/src/god.tsx" 10
printf '%s\n' "apps/acme-web/src/god.tsx  # 400 lines — ticket test" \
  >"${ALLOW}/config/product/file_exemptions.txt"
assert_exit "allow apps/acme-web under cap → 0" 0 "" \
  run_checker "${ALLOW}" tree

# --- over declared cap ---
OVER="${TMP}/over"
make_repo "${OVER}"
mkdir -p "${OVER}/tools" "${OVER}/config/product"
: >"${OVER}/tools/file_exemptions.txt"
write_n_lines "${OVER}/apps/acme-web/src/god.tsx" 50
printf '%s\n' "apps/acme-web/src/god.tsx  # 20 lines — ticket test" \
  >"${OVER}/config/product/file_exemptions.txt"
assert_exit "over declared product cap → 1" 1 "config/product/file_exemptions.txt" \
  run_checker "${OVER}" tree

# --- kit-path refuses ---
refuse_path() {
  local name="$1"
  local path="$2"
  local tag="$3"
  local dir="${TMP}/${tag}"
  make_repo "${dir}"
  mkdir -p "${dir}/tools" "${dir}/config/product"
  : >"${dir}/tools/file_exemptions.txt"
  printf '%s\n' "${path}  # 999 lines — should fail" \
    >"${dir}/config/product/file_exemptions.txt"
  assert_exit "${name}" 1 "not a product-app path" \
    run_checker "${dir}" tree
}

refuse_path "refuse packages/..." "packages/ui/src/components/ui/sidebar.tsx" "pkg"
refuse_path "refuse apps/example-web/..." "apps/example-web/src/routes/notes.tsx" "exweb"
refuse_path "refuse apps/example-web-branded/..." "apps/example-web-branded/src/god.tsx" "branded"
refuse_path "refuse apps/mcp-example/..." "apps/mcp-example/src/index.ts" "mcp"
refuse_path "refuse unsuffixed apps/acme/..." "apps/acme/foo.ts" "unsuf"
refuse_path "refuse tools/..." "tools/check_file_length.sh" "tools"
refuse_path "refuse .. traversal" "apps/acme-web/../../packages/ui/src/components/ui/sidebar.tsx" "dotdot"
refuse_path "refuse leading ./" "./apps/acme-web/src/god.tsx" "dotslash"

# --- missing cap ---
NOCAP="${TMP}/nocap"
make_repo "${NOCAP}"
mkdir -p "${NOCAP}/tools" "${NOCAP}/config/product"
: >"${NOCAP}/tools/file_exemptions.txt"
printf '%s\n' "apps/acme-web/src/god.tsx" \
  >"${NOCAP}/config/product/file_exemptions.txt"
assert_exit "product line without cap → 1" 1 "missing cap" \
  run_checker "${NOCAP}" tree

# --- wildcard ---
WILD="${TMP}/wild"
make_repo "${WILD}"
mkdir -p "${WILD}/tools" "${WILD}/config/product"
: >"${WILD}/tools/file_exemptions.txt"
printf '%s\n' "apps/acme-web/**  # 400 lines — no" \
  >"${WILD}/config/product/file_exemptions.txt"
assert_exit "product wildcard → 1" 1 "wildcard" \
  run_checker "${WILD}" tree

WILD2="${TMP}/wild2"
make_repo "${WILD2}"
mkdir -p "${WILD2}/tools" "${WILD2}/config/product"
: >"${WILD2}/tools/file_exemptions.txt"
printf '%s\n' "apps/acme-web/*.tsx  # 400 lines — no" \
  >"${WILD2}/config/product/file_exemptions.txt"
assert_exit "product *.tsx wildcard → 1" 1 "wildcard" \
  run_checker "${WILD2}" tree

# --- duplicate vs kit ---
DUPKIT="${TMP}/dupkit"
make_repo "${DUPKIT}"
mkdir -p "${DUPKIT}/tools" "${DUPKIT}/config/product"
printf '%s\n' "apps/acme-web/src/god.tsx  # 400 lines — kit" \
  >"${DUPKIT}/tools/file_exemptions.txt"
printf '%s\n' "apps/acme-web/src/god.tsx  # 400 lines — product" \
  >"${DUPKIT}/config/product/file_exemptions.txt"
assert_exit "path in both registers → 1" 1 "duplicate vs kit" \
  run_checker "${DUPKIT}" tree

# --- in-file duplicate $1 ---
DUPIN="${TMP}/dupin"
make_repo "${DUPIN}"
mkdir -p "${DUPIN}/tools" "${DUPIN}/config/product"
: >"${DUPIN}/tools/file_exemptions.txt"
printf '%s\n' \
  "apps/acme-web/src/god.tsx  # 400 lines — a" \
  "apps/acme-web/src/god.tsx  # 500 lines — b" \
  >"${DUPIN}/config/product/file_exemptions.txt"
assert_exit "duplicate \$1 different comments → 1" 1 "duplicate" \
  run_checker "${DUPIN}" tree

# --- product file absent ---
ABSENT="${TMP}/absent"
make_repo "${ABSENT}"
mkdir -p "${ABSENT}/tools" "${ABSENT}/apps/acme-web/src"
: >"${ABSENT}/tools/file_exemptions.txt"
write_n_lines "${ABSENT}/apps/acme-web/src/ok.tsx" 5
assert_exit "product file absent → 0" 0 "" \
  run_checker "${ABSENT}" tree

# --- invalid product file + staged + zero TS ---
EMPTYSTAGED="${TMP}/emptystaged"
make_repo "${EMPTYSTAGED}"
mkdir -p "${EMPTYSTAGED}/tools" "${EMPTYSTAGED}/config/product"
: >"${EMPTYSTAGED}/tools/file_exemptions.txt"
printf '%s\n' "packages/ui/src/x.ts  # 9 lines — no" \
  >"${EMPTYSTAGED}/config/product/file_exemptions.txt"
assert_exit "invalid product + staged + no TS → 1" 1 "not a product-app path" \
  run_checker "${EMPTYSTAGED}" staged

# --- staged TS + worktree-only exemption does not apply ---
UNSTAGED="${TMP}/unstaged"
make_repo "${UNSTAGED}"
mkdir -p "${UNSTAGED}/tools" "${UNSTAGED}/config/product"
: >"${UNSTAGED}/tools/file_exemptions.txt"
write_n_lines "${UNSTAGED}/apps/acme-web/src/god.tsx" 350
git --git-dir="${UNSTAGED}/.git" --work-tree="${UNSTAGED}" add apps/acme-web/src/god.tsx
printf '%s\n' "apps/acme-web/src/god.tsx  # 400 lines — dirty only" \
  >"${UNSTAGED}/config/product/file_exemptions.txt"
assert_exit "staged TS + worktree-only product line → 1" 1 "max 300" \
  run_checker "${UNSTAGED}" staged

# --- staged + indexed product line applies ---
STAGEDOK="${TMP}/stagedok"
make_repo "${STAGEDOK}"
mkdir -p "${STAGEDOK}/tools" "${STAGEDOK}/config/product"
: >"${STAGEDOK}/tools/file_exemptions.txt"
write_n_lines "${STAGEDOK}/apps/acme-web/src/god.tsx" 10
printf '%s\n' "apps/acme-web/src/god.tsx  # 400 lines — indexed" \
  >"${STAGEDOK}/config/product/file_exemptions.txt"
git --git-dir="${STAGEDOK}/.git" --work-tree="${STAGEDOK}" add \
  apps/acme-web/src/god.tsx config/product/file_exemptions.txt
assert_exit "staged allow under cap → 0" 0 "" \
  run_checker "${STAGEDOK}" staged

# --- same allow + kit-path refuse in both modes ---
BOTH="${TMP}/both"
make_repo "${BOTH}"
mkdir -p "${BOTH}/tools" "${BOTH}/config/product"
: >"${BOTH}/tools/file_exemptions.txt"
write_n_lines "${BOTH}/apps/acme-web/src/god.tsx" 8
printf '%s\n' "apps/acme-web/src/god.tsx  # 400 lines — both" \
  >"${BOTH}/config/product/file_exemptions.txt"
git --git-dir="${BOTH}/.git" --work-tree="${BOTH}" add \
  apps/acme-web/src/god.tsx config/product/file_exemptions.txt
assert_exit "tree allow agrees → 0" 0 "" \
  run_checker "${BOTH}" tree
assert_exit "staged allow agrees → 0" 0 "" \
  run_checker "${BOTH}" staged

REFBOTH="${TMP}/refboth"
make_repo "${REFBOTH}"
mkdir -p "${REFBOTH}/tools" "${REFBOTH}/config/product"
: >"${REFBOTH}/tools/file_exemptions.txt"
printf '%s\n' "packages/ui/src/x.ts  # 9 lines — no" \
  >"${REFBOTH}/config/product/file_exemptions.txt"
assert_exit "tree kit-path refuse agrees → 1" 1 "not a product-app path" \
  run_checker "${REFBOTH}" tree
assert_exit "staged kit-path refuse agrees → 1" 1 "not a product-app path" \
  run_checker "${REFBOTH}" staged

# --- ambient override without sentinel ---
assert_exit "QG_FILE_MAX without sentinel → 1" 1 "QG_FILE_HARNESS_SENTINEL" \
  env -u GIT_DIR -u GIT_WORK_TREE -u GIT_COMMON_DIR -C "${ABSENT}" \
    QG_FILE_MODE=tree QG_FILE_MAX=99999 \
    bash "${CHECKER}"

# --- override with sentinel ---
SENT="${TMP}/sentinel"
make_repo "${SENT}"
mkdir -p "${SENT}/tools" "${SENT}/apps/acme-web/src"
: >"${SENT}/tools/file_exemptions.txt"
write_n_lines "${SENT}/apps/acme-web/src/ok.tsx" 5
touch "${SENT}/.qg-harness"
assert_exit "QG_FILE_MAX with sentinel → 0" 0 "" \
  env -u GIT_DIR -u GIT_WORK_TREE -u GIT_COMMON_DIR -C "${SENT}" \
    QG_FILE_MODE=tree QG_FILE_MAX=99999 \
    QG_FILE_HARNESS_SENTINEL="${SENT}/.qg-harness" \
    bash "${CHECKER}"

echo "== summary: ${PASS} pass, ${FAIL} fail =="
if [[ "${FAIL}" -ne 0 ]]; then
  exit 1
fi
echo "CP-FILE-LENGTH: OK"
exit 0
