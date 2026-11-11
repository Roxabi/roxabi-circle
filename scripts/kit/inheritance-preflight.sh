#!/usr/bin/env bash
# Product inheritance preflight. The checker never auto-fetches. Kit checkouts have no marker.
set -euo pipefail

if [[ ! -f config/product/inheritance.json ]]; then
  exit 0
fi

sha="$(bun -e 'const marker = await Bun.file("config/product/inheritance.json").json(); process.stdout.write(String(marker.upstreamCommit ?? "").trim())')"
if ! git rev-parse --verify "${sha}^{commit}" >/dev/null 2>&1; then
  echo "::error::inheritance upstreamCommit ${sha} not in history — deepen checkout or re-merge upstream" >&2
  exit 1
fi
echo "inheritance upstreamCommit=${sha}"
