#!/usr/bin/env bash
# Fail if product-share domain tokens leak into kit packages/examples.
# Scans packages + example apps only (not this script itself).
set -euo pipefail

# ZERO_EDIT_ROOT: same override as check-zero-edit-zones (dogfood product path).
ROOT="${ZERO_EDIT_ROOT:-$(cd "$(dirname "$0")/.." && pwd)}"
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

# rg: 0=matches, 1=no match, 2+=error. grep: 0=matches, 1=no match, 2+=error.
# Never treat tool failure as clean.
search() {
  local pat="$1"
  shift
  local out ec
  if command -v rg >/dev/null 2>&1; then
    set +e
    out="$(rg -n --hidden \
      --glob '!**/.git/**' \
      --glob '!**/node_modules/**' \
      --glob '!**/dist/**' \
      --glob '!**/.wrangler/**' \
      --glob '!**/*.test.ts' \
      -i "$pat" "$@" 2>&1)"
    ec=$?
    set -e
    if [[ "$ec" -eq 0 ]]; then
      printf '%s\n' "$out"
      return 0
    fi
    if [[ "$ec" -eq 1 ]]; then
      return 1
    fi
    echo "check-banned-strings: rg failed (exit $ec) for /$pat/: $out" >&2
    return 2
  fi

  set +e
  out="$(grep -RInE \
    --exclude-dir=node_modules \
    --exclude-dir=.git \
    --exclude-dir=dist \
    --exclude-dir=.wrangler \
    --exclude='*.test.ts' \
    -e "$pat" "$@" 2>&1)"
  ec=$?
  set -e
  if [[ "$ec" -eq 0 ]]; then
    printf '%s\n' "$out"
    return 0
  fi
  if [[ "$ec" -eq 1 ]]; then
    return 1
  fi
  echo "check-banned-strings: grep failed (exit $ec) for /$pat/: $out" >&2
  return 2
}

fail=0
for target in "${TARGETS[@]}"; do
  if [[ ! -d "$target" && ! -f "$target" ]]; then
    continue
  fi
  for pat in "${BANNED[@]}"; do
    set +e
    hits="$(search "$pat" "$target")"
    ec=$?
    set -e
    if [[ "$ec" -eq 2 ]]; then
      fail=1
      continue
    fi
    if [[ "$ec" -eq 0 && -n "$hits" ]]; then
      echo "$hits"
      echo "BANLIST HIT: pattern /$pat/ under $target" >&2
      fail=1
    fi
  done
done

set +e
hits="$(search "joinObjectKey\\(['\"]share" packages apps)"
ec=$?
set -e
if [[ "$ec" -eq 2 ]]; then
  fail=1
elif [[ "$ec" -eq 0 && -n "${hits:-}" ]]; then
  echo "$hits"
  echo "BANLIST HIT: R2 share/ prefix in code" >&2
  fail=1
fi

if [[ "$fail" -ne 0 ]]; then
  echo "check-banned-strings: FAILED" >&2
  exit 1
fi

echo "check-banned-strings: OK"
