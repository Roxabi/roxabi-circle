#!/usr/bin/env bash
# Fail if product-share domain tokens leak into kit packages/examples.
# Scans packages + example apps only (not this script itself).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

TARGETS=(
  packages
  apps/example-api
  apps/example-web
  apps/mcp-example
)

BANNED=(
  'share/\{slug\}'
  'share_publish'
  'private_key_product'
  'apps/share-'
  'shlink'
  's\.gosilex\.com'
  'share\.gosilex\.com'
)

search() {
  local pat="$1"
  shift
  if command -v rg >/dev/null 2>&1; then
    rg -n --hidden \
      --glob '!**/.git/**' \
      --glob '!**/node_modules/**' \
      --glob '!**/dist/**' \
      --glob '!**/.wrangler/**' \
      --glob '!**/*.test.ts' \
      -i "$pat" "$@" 2>/dev/null || true
  else
    grep -RInE \
      --exclude-dir=node_modules \
      --exclude-dir=.git \
      --exclude-dir=dist \
      --exclude-dir=.wrangler \
      --exclude='*.test.ts' \
      -e "$pat" "$@" 2>/dev/null || true
  fi
}

fail=0
for target in "${TARGETS[@]}"; do
  if [[ ! -d "$target" && ! -f "$target" ]]; then
    continue
  fi
  for pat in "${BANNED[@]}"; do
    hits="$(search "$pat" "$target")"
    if [[ -n "$hits" ]]; then
      echo "$hits"
      echo "BANLIST HIT: pattern /$pat/ under $target" >&2
      fail=1
    fi
  done
done

hits="$(search "joinObjectKey\\(['\"]share" packages apps || true)"
if [[ -n "${hits:-}" ]]; then
  echo "$hits"
  echo "BANLIST HIT: R2 share/ prefix in code" >&2
  fail=1
fi

if [[ "$fail" -ne 0 ]]; then
  echo "check-banned-strings: FAILED" >&2
  exit 1
fi

echo "check-banned-strings: OK"
