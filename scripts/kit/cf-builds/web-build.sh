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

# shellcheck source=require-deploy-branch.sh
source "$(dirname "$0")/require-deploy-branch.sh"
require_deploy_branch "$ROOT" build

export VITE_API_URL="${VITE_API_URL:-https://api.boilerplate.roxabi.dev}"

# shellcheck source=require-bun-version.sh
source "$(dirname "$0")/require-bun-version.sh"
cd "$ROOT"
if [[ -d node_modules ]]; then
  require_bun_version "$ROOT" # the image pre-installed with its own Bun (Roxabi/roxabi-boilerplate-cf#316)
else
  bash scripts/kit/cf-builds/install-monorepo.sh
fi

cd "$ROOT/apps/example-web"
bun run build
echo "SPA dist ready: $ROOT/apps/example-web/dist (VITE_API_URL=$VITE_API_URL)"
