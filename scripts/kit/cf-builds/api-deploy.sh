#!/usr/bin/env bash
# Kit **showcase** only — deploys apps/example-api [env.production] (boilerplate-api).
# Dashboard: Root = repo root · Deploy: `bun run cf:showcase:deploy-api`
# Build var required: KIT_SHOWCASE_DEPLOY=1
# Production branch only (main).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
export BUN_INSTALL="${BUN_INSTALL:-$HOME/.bun}"
export PATH="$BUN_INSTALL/bin:$PATH"

if [[ "${KIT_SHOWCASE_DEPLOY:-}" != "1" ]]; then
  echo "error: refusing deploy — set KIT_SHOWCASE_DEPLOY=1 (kit showcase only)." >&2
  echo "  Products: use apps/<product>-* wrangler + your own CF Builds / product-deploy.yml." >&2
  echo "  See docs/kit/deploy-cloudflare.md § product / fork." >&2
  exit 1
fi

# CF Workers Builds sets WORKERS_CI_BRANCH; laptop falls back to git.
branch="${WORKERS_CI_BRANCH:-${CF_PAGES_BRANCH:-}}"
if [[ -z "${branch}" ]]; then
  branch="$(git -C "$ROOT" rev-parse --abbrev-ref HEAD 2>/dev/null || true)"
fi
if [[ "${branch}" != "main" ]]; then
  echo "error: refusing deploy — branch is '${branch:-unknown}', only main is allowed." >&2
  exit 1
fi

cd "$ROOT"
if [[ ! -d node_modules ]]; then
  bash scripts/kit/cf-builds/install-monorepo.sh
fi

cd "$ROOT/apps/example-api"
# Migrate then deploy. Not one distributed transaction (see runbook).
bunx wrangler d1 migrations apply boilerplate-api --remote --env production
bunx wrangler deploy --env production
