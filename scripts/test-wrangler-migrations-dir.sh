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
  echo "  PASS: ${name} (exit ${got})"
  PASS=$((PASS + 1))
}

echo "== CP-KIT-SCHEMA wrangler migrations_dir =="
TMP="$(mktemp -d -t cp-wrangler-mig-XXXXXX)"
trap 'rm -rf "$TMP"' EXIT

# --- live kit tree (example-api migrations, not packages/) ---
assert_exit "live kit tree → 0" 0 "${ROOT}" "OK"

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
assert_exit "app-local migrations_dir → 0" 0 "${OK_TREE}" "OK"

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

echo "== summary: ${PASS} passed, ${FAIL} failed =="
if [[ "${FAIL}" -ne 0 ]]; then
  exit 1
fi
exit 0
