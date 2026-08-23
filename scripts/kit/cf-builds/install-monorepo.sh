#!/usr/bin/env bash
# Workers Builds / Pages: install Bun monorepo from **repo root**.
# Dashboard: Root = empty · Build: `bun run cf:showcase:install`
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
cd "$ROOT"

if ! command -v bun >/dev/null 2>&1; then
  curl -fsSL https://bun.sh/install | bash
  export BUN_INSTALL="${BUN_INSTALL:-$HOME/.bun}"
  export PATH="$BUN_INSTALL/bin:$PATH"
fi

bun --version
bun install --frozen-lockfile
