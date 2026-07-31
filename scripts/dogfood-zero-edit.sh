#!/usr/bin/env bash
# Dogfood zero-edit consumer contract against a product clone.
#
# Usage:
#   bash scripts/dogfood-zero-edit.sh /path/to/product-repo
#   bash scripts/dogfood-zero-edit.sh --self-sim
#
# Exit 0 only if:
#   - upstream remote exists
#   - upstream push URL is exactly no_push
#   - zero-edit (product mode) green
#   - banlist green
# Self-sim also asserts a negative case (protected path delta must fail).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
MODE="${1:-}"

run_gates() {
  local tree="$1"
  local zero_script ban_script
  if [[ -f "$tree/scripts/check-zero-edit-zones.sh" ]]; then
    zero_script="$tree/scripts/check-zero-edit-zones.sh"
  else
    zero_script="$ROOT/scripts/check-zero-edit-zones.sh"
    echo "NOTE: using kit zero-edit script with ZERO_EDIT_ROOT=$tree"
  fi
  if [[ -f "$tree/scripts/check-banned-strings.sh" ]]; then
    ban_script="$tree/scripts/check-banned-strings.sh"
  else
    ban_script="$ROOT/scripts/check-banned-strings.sh"
    echo "NOTE: using kit banlist script with ZERO_EDIT_ROOT=$tree"
  fi

  ZERO_EDIT_ROOT="$tree" ZERO_EDIT_MODE=product ZERO_EDIT_BASE_REF="${ZERO_EDIT_BASE_REF:-upstream/main}" \
    bash "$zero_script"
  ZERO_EDIT_ROOT="$tree" bash "$ban_script"
}

assert_no_push() {
  local push_url
  push_url="$(git remote get-url --push upstream 2>/dev/null || true)"
  if [[ "$push_url" != "no_push" ]]; then
    echo "FAIL: upstream push URL must be 'no_push' (got: ${push_url:-empty})" >&2
    exit 1
  fi
}

if [[ "$MODE" == "--self-sim" ]]; then
  TMP="$(mktemp -d -t gosilex-dogfood-XXXXXX)"
  trap 'rm -rf "$TMP"' EXIT
  echo "== dogfood: self-sim in $TMP =="
  git clone --depth 1 "file://$ROOT" "$TMP/product"
  cd "$TMP/product"

  # Origin must NOT match *silex-boilerplate* or zero-edit stays in kit mode.
  git remote rename origin kit-origin
  git remote add origin "file://$TMP/product"
  git remote add upstream "file://$ROOT"
  git remote set-url --push upstream no_push
  git fetch upstream --depth 1

  assert_no_push

  # Positive: clean product tree vs upstream/main
  ZERO_EDIT_BASE_REF=upstream/main run_gates "$TMP/product"

  # Negative: protected-path dual-edit must fail
  echo "/* dogfood dual-edit probe */" >> package.json
  set +e
  ZERO_EDIT_ROOT="$TMP/product" ZERO_EDIT_MODE=product ZERO_EDIT_BASE_REF=upstream/main \
    bash "$ROOT/scripts/check-zero-edit-zones.sh"
  neg=$?
  set -e
  if [[ "$neg" -eq 0 ]]; then
    echo "FAIL: expected zero-edit to fail after package.json dual-edit" >&2
    exit 1
  fi
  echo "dogfood self-sim: OK (product mode green + dual-edit fail + no_push)"
  exit 0
fi

PRODUCT="${1:-}"
if [[ -z "$PRODUCT" || ! -d "$PRODUCT/.git" ]]; then
  echo "Usage: $0 /path/to/product-repo | --self-sim" >&2
  exit 2
fi

PRODUCT="$(cd "$PRODUCT" && pwd)"
cd "$PRODUCT"
echo "== dogfood product: $PRODUCT =="

if ! git remote get-url upstream >/dev/null 2>&1; then
  echo "FAIL: missing remote 'upstream' (add kit as upstream)" >&2
  exit 1
fi

assert_no_push
run_gates "$PRODUCT"
echo "dogfood product: OK"
