#!/usr/bin/env bash
# CP-KIT-SCHEMA — self-test for scripts/check-wrangler-migrations-dir.sh
#
# Exit 0 only if fixture matrix + live kit tree pass.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd -P)"
SCRIPT="${ROOT}/scripts/check-wrangler-migrations-dir.sh"

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
  out="$(WRANGLER_MIG_ROOT="${tree}" bash "${SCRIPT}" 2>&1)"
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
  # Success must prove a scan ran (not OK (0 wrangler files, …)).
  if [[ "${expect}" -eq 0 ]] && ! echo "${out}" | grep -Eq '[1-9][0-9]* wrangler files'; then
    echo "  FAIL: ${name} success output must report ≥1 wrangler file" >&2
    echo "    out: $(echo "${out}" | tr '\n' ' ')" >&2
    FAIL=$((FAIL + 1))
    return
  fi
  echo "  PASS: ${name} (exit ${got})"
  PASS=$((PASS + 1))
}

echo "== CP-KIT-SCHEMA wrangler migrations_dir =="
TMP="$(mktemp -d -t cp-wrangler-mig-XXXXXX)"
trap 'rm -rf "$TMP"' EXIT

# --- live tree must be clean. Do not pin wrangler-file / migrations_dir
# counts: product clones add apps/<product>-* wrangler files (LGU: 4/4).
assert_exit "live kit tree → 0" 0 "${ROOT}" "check-wrangler-migrations-dir: OK"

# --- fixture: app migrations_dir is relative local ---
OK_TREE="${TMP}/ok"
mkdir -p "${OK_TREE}/packages/auth/migrations" "${OK_TREE}/apps/foo-api/migrations"
cat >"${OK_TREE}/apps/foo-api/wrangler.toml" <<'EOF'
name = "foo-api"
[[d1_databases]]
binding = "DB"
database_name = "foo"
migrations_dir = "migrations"
EOF
assert_exit "app-local migrations_dir → 0" 0 "${OK_TREE}" "check-wrangler-migrations-dir: OK"

# --- fixture: TOML points at packages/auth/migrations ---
BAD_TOML="${TMP}/bad-toml"
mkdir -p "${BAD_TOML}/packages/auth/migrations" "${BAD_TOML}/apps/foo-api"
cat >"${BAD_TOML}/apps/foo-api/wrangler.toml" <<'EOF'
name = "foo-api"
[[d1_databases]]
binding = "DB"
migrations_dir = "../../packages/auth/migrations"
EOF
assert_exit "toml packages/auth/migrations → 1" 1 "${BAD_TOML}" "packages/*/migrations are sketches"

# --- fixture: JSONC points at packages ---
BAD_JSON="${TMP}/bad-json"
mkdir -p "${BAD_JSON}/packages/auth/migrations" "${BAD_JSON}/apps/foo-api"
cat >"${BAD_JSON}/apps/foo-api/wrangler.jsonc" <<'EOF'
{
  "name": "foo-api",
  "d1_databases": [
    { "binding": "DB", "migrations_dir": "../../packages/auth/migrations" }
  ]
}
EOF
assert_exit "jsonc packages/auth/migrations → 1" 1 "${BAD_JSON}" "packages/*/migrations are sketches"

# --- fixture: wrangler.json (not only jsonc) ---
BAD_JSON_PLAIN="${TMP}/bad-json-plain"
mkdir -p "${BAD_JSON_PLAIN}/packages/auth/migrations" "${BAD_JSON_PLAIN}/apps/foo-api"
cat >"${BAD_JSON_PLAIN}/apps/foo-api/wrangler.json" <<'EOF'
{
  "name": "foo-api",
  "d1_databases": [
    { "binding": "DB", "migrations_dir": "../../packages/auth/migrations" }
  ]
}
EOF
assert_exit "json packages/auth/migrations → 1" 1 "${BAD_JSON_PLAIN}" "packages/*/migrations are sketches"

# --- fixture: wrangler file under packages/ (default ./migrations) ---
BAD_PKG="${TMP}/bad-pkg"
mkdir -p "${BAD_PKG}/packages/auth/migrations"
cat >"${BAD_PKG}/packages/auth/wrangler.toml" <<'EOF'
name = "auth-sketch"
[[d1_databases]]
binding = "DB"
EOF
assert_exit "wrangler under packages/ → 1" 1 "${BAD_PKG}" "wrangler config lives under packages/"

# --- fixture: env.production block also scanned ---
BAD_ENV="${TMP}/bad-env"
mkdir -p "${BAD_ENV}/packages/flows/migrations" "${BAD_ENV}/apps/foo-api/migrations"
cat >"${BAD_ENV}/apps/foo-api/wrangler.toml" <<'EOF'
name = "foo-api"
[[d1_databases]]
binding = "DB"
migrations_dir = "migrations"

[[env.production.d1_databases]]
binding = "DB"
migrations_dir = "../../packages/flows/migrations"
EOF
assert_exit "env.production sketch dir → 1" 1 "${BAD_ENV}" "packages/*/migrations are sketches"

# --- fixture: product clone extra wrangler files (web + second API) ---
PROD="${TMP}/prod"
mkdir -p "${PROD}/packages/auth" \
  "${PROD}/apps/example-api/migrations" "${PROD}/apps/lgu-api/migrations" \
  "${PROD}/apps/example-web" "${PROD}/apps/lgu-web"
for api in example-api lgu-api; do
  cat >"${PROD}/apps/${api}/wrangler.toml" <<EOF
name = "${api}"
[[d1_databases]]
binding = "DB"
migrations_dir = "migrations"
[[env.production.d1_databases]]
binding = "DB"
migrations_dir = "migrations"
EOF
done
echo 'name = "web"' >"${PROD}/apps/example-web/wrangler.toml"
echo 'name = "web"' >"${PROD}/apps/lgu-web/wrangler.toml"
assert_exit "product extra wrangler files → 0" 0 "${PROD}" "OK (4 wrangler files"

# Extra files must not disable sketch fail-closed (LGU-shaped tree).
PROD_SKETCH="${TMP}/prod-sketch"
mkdir -p "${PROD_SKETCH}/packages/auth/migrations" \
  "${PROD_SKETCH}/apps/example-api/migrations" "${PROD_SKETCH}/apps/lgu-api" \
  "${PROD_SKETCH}/apps/example-web" "${PROD_SKETCH}/apps/lgu-web"
cat >"${PROD_SKETCH}/apps/example-api/wrangler.toml" <<'EOF'
name = "example-api"
[[d1_databases]]
binding = "DB"
migrations_dir = "migrations"
EOF
cat >"${PROD_SKETCH}/apps/lgu-api/wrangler.toml" <<'EOF'
name = "lgu-api"
[[d1_databases]]
binding = "DB"
migrations_dir = "../../packages/auth/migrations"
EOF
echo 'name = "web"' >"${PROD_SKETCH}/apps/example-web/wrangler.toml"
echo 'name = "web"' >"${PROD_SKETCH}/apps/lgu-web/wrangler.toml"
assert_exit "product tree sketch dir → 1" 1 "${PROD_SKETCH}" "packages/*/migrations are sketches"

echo "== summary: ${PASS} passed, ${FAIL} failed =="
if [[ "${FAIL}" -ne 0 ]]; then
  exit 1
fi
exit 0
