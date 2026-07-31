#!/usr/bin/env bash
# Dogfood zero-edit consumer contract against a product clone.
#
# Usage:
#   bash scripts/dogfood-zero-edit.sh /path/to/product-repo
#   bash scripts/dogfood-zero-edit.sh --self-sim   # temp clone of this kit as fake product
#
# Exit 0 only if: upstream remote exists, push URL denied or no_push, zero-edit green.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
MODE="${1:-}"

if [[ "$MODE" == "--self-sim" ]]; then
  TMP="$(mktemp -d -t gosilex-dogfood-XXXXXX)"
  trap 'rm -rf "$TMP"' EXIT
  echo "== dogfood: self-sim in $TMP =="
  git clone --depth 1 "file://$ROOT" "$TMP/product"
  cd "$TMP/product"
  git remote add upstream "file://$ROOT" 2>/dev/null || true
  git remote set-url --push upstream no_push
  # Kit-only tree: zero-edit kit mode
  bash scripts/check-zero-edit-zones.sh
  bash scripts/check-banned-strings.sh
  echo "dogfood self-sim: OK (kit clone + upstream no_push + gates)"
  exit 0
fi

PRODUCT="${1:-}"
if [[ -z "$PRODUCT" || ! -d "$PRODUCT/.git" ]]; then
  echo "Usage: $0 /path/to/product-repo | --self-sim" >&2
  exit 2
fi

cd "$PRODUCT"
echo "== dogfood product: $(pwd) =="

if ! git remote get-url upstream >/dev/null 2>&1; then
  echo "FAIL: missing remote 'upstream' (add kit as upstream)" >&2
  exit 1
fi

PUSH_URL="$(git remote get-url --push upstream 2>/dev/null || true)"
if [[ "$PUSH_URL" != "no_push" && "$PUSH_URL" != *"no_push"* ]]; then
  echo "WARN: upstream push URL is '$PUSH_URL' — prefer: git remote set-url --push upstream no_push"
fi

# Prefer product-local scripts (after upstream merge); else kit scripts with cwd=product.
KIT_SCRIPTS="$ROOT/scripts"
if [[ -f scripts/check-zero-edit-zones.sh ]]; then
  bash scripts/check-zero-edit-zones.sh
elif [[ -f "$KIT_SCRIPTS/check-zero-edit-zones.sh" ]]; then
  echo "NOTE: using kit zero-edit script against product tree (product missing scripts — merge upstream)"
  (cd "$PRODUCT" && bash "$KIT_SCRIPTS/check-zero-edit-zones.sh")
else
  echo "FAIL: no zero-edit script available" >&2
  exit 1
fi

if [[ -f scripts/check-banned-strings.sh ]]; then
  bash scripts/check-banned-strings.sh
elif [[ -f "$KIT_SCRIPTS/check-banned-strings.sh" ]]; then
  (cd "$PRODUCT" && bash "$KIT_SCRIPTS/check-banned-strings.sh")
fi

echo "dogfood product: OK"
