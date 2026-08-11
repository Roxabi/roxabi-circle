#!/usr/bin/env bash
# Pages build for kit showcase SPA.
# Dashboard: Root = repo root · Build command: `bun run cf:build:web`
# Output directory: apps/example-web/dist
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
export BUN_INSTALL="${BUN_INSTALL:-$HOME/.bun}"
export PATH="$BUN_INSTALL/bin:$PATH"

# Showcase API origin baked at build time (Vite).
export VITE_API_URL="${VITE_API_URL:-https://api.boilerplate.roxabi.dev}"

cd "$ROOT"
if [[ ! -d node_modules ]]; then
  bash scripts/cf-builds/install-monorepo.sh
fi

cd "$ROOT/apps/example-web"
bun run build
echo "SPA dist ready: $ROOT/apps/example-web/dist (VITE_API_URL=$VITE_API_URL)"
