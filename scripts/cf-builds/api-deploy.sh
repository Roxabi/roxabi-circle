#!/usr/bin/env bash
# Workers Builds deploy for kit showcase API (boilerplate-api).
# Dashboard: Root = repo root · Deploy command: `bun run cf:deploy:api`
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
export BUN_INSTALL="${BUN_INSTALL:-$HOME/.bun}"
export PATH="$BUN_INSTALL/bin:$PATH"

cd "$ROOT"
if [[ ! -d node_modules ]]; then
  bash scripts/cf-builds/install-monorepo.sh
fi

cd "$ROOT/apps/example-api"
# Migrate then deploy production env (name = boilerplate-api on the account).
bunx wrangler d1 migrations apply boilerplate-api --remote --env production
bunx wrangler deploy --env production
