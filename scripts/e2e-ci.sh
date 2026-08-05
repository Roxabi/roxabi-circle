#!/usr/bin/env bash
# CI / local orchestrator for design-system e2e (B7 A2).
# Starts example-api + example-web, migrates/seeds, runs Playwright Chromium smoke.
# Does NOT belong in validate:full / Lefthook pre-push.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

API_PORT="${E2E_API_PORT:-8787}"
WEB_PORT="${E2E_WEB_PORT:-5173}"
API_URL="${E2E_API_URL:-http://127.0.0.1:${API_PORT}}"
BASE_URL="${E2E_BASE_URL:-http://127.0.0.1:${WEB_PORT}}"
export E2E_API_URL="$API_URL"
export E2E_BASE_URL="$BASE_URL"

API_PID=""
WEB_PID=""
API_LOG="${TMPDIR:-/tmp}/gosilex-e2e-api.$$.log"
WEB_LOG="${TMPDIR:-/tmp}/gosilex-e2e-web.$$.log"
DEV_VARS="apps/example-api/.dev.vars"
DEV_VARS_BAK=""
CREATED_DEV_VARS=0

cleanup() {
  local code=$?
  if [[ -n "$API_PID" ]] && kill -0 "$API_PID" 2>/dev/null; then
    kill "$API_PID" 2>/dev/null || true
    wait "$API_PID" 2>/dev/null || true
  fi
  if [[ -n "$WEB_PID" ]] && kill -0 "$WEB_PID" 2>/dev/null; then
    kill "$WEB_PID" 2>/dev/null || true
    wait "$WEB_PID" 2>/dev/null || true
  fi
  if [[ -n "$DEV_VARS_BAK" && -f "$DEV_VARS_BAK" ]]; then
    mv "$DEV_VARS_BAK" "$DEV_VARS"
  elif [[ "$CREATED_DEV_VARS" -eq 1 && -f "$DEV_VARS" ]]; then
    rm -f "$DEV_VARS"
  fi
  exit "$code"
}
trap cleanup EXIT INT TERM

poll_ok() {
  local url="$1"
  local label="$2"
  local i
  for i in $(seq 1 90); do
    if curl -fsS -m 2 -o /dev/null "$url" 2>/dev/null; then
      echo "e2e-ci: ready $label ($url)"
      return 0
    fi
    sleep 1
  done
  echo "e2e-ci: timeout waiting for $label ($url)" >&2
  if [[ -f "$API_LOG" ]]; then
    echo "--- api log (tail) ---" >&2
    tail -80 "$API_LOG" >&2 || true
  fi
  if [[ -f "$WEB_LOG" ]]; then
    echo "--- web log (tail) ---" >&2
    tail -40 "$WEB_LOG" >&2 || true
  fi
  return 1
}

echo "e2e-ci: install playwright chromium (if needed)"
(
  cd apps/example-web
  bunx playwright-core install chromium
)

echo "e2e-ci: write isolated .dev.vars for this run (restore user file on exit)"
if [[ -f "$DEV_VARS" ]]; then
  DEV_VARS_BAK="${DEV_VARS}.e2e-bak.$$"
  cp "$DEV_VARS" "$DEV_VARS_BAK"
else
  CREATED_DEV_VARS=1
fi
# Complete kit-local file — never partial-overwrite (avoids wiping ENVIRONMENT/secrets).
cat >"$DEV_VARS" <<EOF
ENVIRONMENT=development
SESSION_SECRET=dev-session-secret-change-me-32chars!!
BETTER_AUTH_SECRET=dev-better-auth-secret-change-me-32c!!
BETTER_AUTH_URL=${API_URL}
CORS_ORIGINS=http://127.0.0.1:${WEB_PORT},http://localhost:${WEB_PORT}
DEMO_USER_EMAIL=demo@gosilex.local
SMTP_HOST=127.0.0.1
SMTP_PORT=1025
EMAIL_TRANSPORT=log
PRESIGN_MODE=mock
EOF

echo "e2e-ci: migrate + seed D1 local"
bun run db:migrate
bun run db:seed

echo "e2e-ci: start example-api (:${API_PORT})"
(
  cd apps/example-api
  bunx wrangler dev --ip 127.0.0.1 --port "$API_PORT"
) >"$API_LOG" 2>&1 &
API_PID=$!

echo "e2e-ci: start example-web (:${WEB_PORT}) proxy→${API_URL}"
(
  cd apps/example-web
  # vite.config reads E2E_API_URL for /api proxy target (non-default ports in local smoke)
  E2E_API_URL="$API_URL" bunx vite --host 127.0.0.1 --port "$WEB_PORT" --strictPort
) >"$WEB_LOG" 2>&1 &
WEB_PID=$!

poll_ok "${API_URL}/health" "API"
poll_ok "${BASE_URL}/" "web"

echo "e2e-ci: run design-system smoke"
bun run test:e2e:design-system

echo "e2e-ci: OK"
