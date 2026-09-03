#!/usr/bin/env bash
# Kit **showcase** SPA only — apps/example-web → Pages project "boilerplate".
# Dashboard: Root = repo root · Build: `bun run cf:showcase:build-web`
# Build vars: KIT_SHOWCASE_DEPLOY=1 · VITE_API_URL=https://api.boilerplate.roxabi.dev
# Output: apps/example-web/dist
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
export BUN_INSTALL="${BUN_INSTALL:-$HOME/.bun}"
export PATH="$BUN_INSTALL/bin:$PATH"

if [[ "${KIT_SHOWCASE_DEPLOY:-}" != "1" ]]; then
  echo "error: refusing build — set KIT_SHOWCASE_DEPLOY=1 (kit showcase only)." >&2
  echo "  Products: build apps/<product>-web with your own VITE_API_URL." >&2
  exit 1
fi

branch="${CF_PAGES_BRANCH:-${WORKERS_CI_BRANCH:-}}"
if [[ -z "${branch}" ]]; then
  branch="$(git -C "$ROOT" rev-parse --abbrev-ref HEAD 2>/dev/null || true)"
fi
if [[ "${branch}" != "main" ]]; then
  echo "error: refusing build — branch is '${branch:-unknown}', only main is allowed." >&2
  exit 1
fi

export VITE_API_URL="${VITE_API_URL:-https://api.boilerplate.roxabi.dev}"

cd "$ROOT"
if [[ ! -d node_modules ]]; then
  bash scripts/kit/cf-builds/install-monorepo.sh
fi

cd "$ROOT/apps/example-web"
bun run build
echo "SPA dist ready: $ROOT/apps/example-web/dist (VITE_API_URL=$VITE_API_URL)"
