#!/usr/bin/env bash
# Exercise Cloudflare entrypoints from an unrelated cwd with network/deploy tools stubbed.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd -P)"
TMP="$(mktemp -d -t kit-cf-builds-XXXXXX)"
trap 'rm -rf "$TMP"' EXIT

FIXTURE="${TMP}/repo"
BIN="${TMP}/bin"
LOG="${TMP}/calls.log"
mkdir -p "${FIXTURE}/scripts/kit/cf-builds" \
  "${FIXTURE}/apps/example-api" \
  "${FIXTURE}/apps/example-web" \
  "${BIN}"
cp "${ROOT}/scripts/kit/cf-builds/"*.sh "${FIXTURE}/scripts/kit/cf-builds/"

cat >"${BIN}/bun" <<'STUB'
#!/usr/bin/env bash
printf 'bun|%s|%s\n' "$PWD" "$*" >>"${CF_BUILDS_TEST_LOG}"
STUB
cat >"${BIN}/bunx" <<'STUB'
#!/usr/bin/env bash
printf 'bunx|%s|%s\n' "$PWD" "$*" >>"${CF_BUILDS_TEST_LOG}"
STUB
chmod +x "${BIN}/bun" "${BIN}/bunx"

run_entrypoint() {
  local script="$1"
  shift
  : >"${LOG}"
  (
    cd "${TMP}"
    env \
      BUN_INSTALL="${TMP}" \
      CF_BUILDS_TEST_LOG="${LOG}" \
      KIT_SHOWCASE_DEPLOY=1 \
      PATH="${BIN}:/usr/bin:/bin" \
      "$@" \
      bash "${FIXTURE}/scripts/kit/cf-builds/${script}"
  )
}

assert_calls() {
  local expected="$1"
  if ! diff -u <(printf '%s' "${expected}") "${LOG}"; then
    echo "FAIL: unexpected calls for Cloudflare build entrypoint" >&2
    exit 1
  fi
}

run_entrypoint install-monorepo.sh
assert_calls "bun|${FIXTURE}|--version
bun|${FIXTURE}|install --frozen-lockfile
"

run_entrypoint api-deploy.sh WORKERS_CI_BRANCH=main
assert_calls "bun|${FIXTURE}|--version
bun|${FIXTURE}|install --frozen-lockfile
bunx|${FIXTURE}/apps/example-api|wrangler d1 migrations apply boilerplate-api --remote --env production
bunx|${FIXTURE}/apps/example-api|wrangler deploy --env production
"

run_entrypoint web-build.sh CF_PAGES_BRANCH=main
assert_calls "bun|${FIXTURE}|--version
bun|${FIXTURE}|install --frozen-lockfile
bun|${FIXTURE}/apps/example-web|run build
"

echo "cf-builds: OK"
