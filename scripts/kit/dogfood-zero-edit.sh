#!/usr/bin/env bash
# Dogfood zero-edit consumer contract against a product clone (ADR-0009).
#
# Usage:
#   bash scripts/kit/dogfood-zero-edit.sh /path/to/product-repo
#   bash scripts/kit/dogfood-zero-edit.sh --self-sim
#
# Exit 0 only if:
#   - upstream remote exists
#   - upstream push URL is exactly no_push
#   - zero-edit (product mode) green vs inheritance marker
#   - banlist green
# Self-sim also asserts a negative case (protected path delta must fail)
# and that stale upstream/main tracking does not false-fail (#103).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
MODE="${1:-}"
BRANCH="$(git -C "$ROOT" branch --show-current)"

run_gates() {
  local tree="$1"
  local zero_script ban_script
  if [[ -f "$tree/scripts/kit/check-zero-edit-zones.sh" ]]; then
    zero_script="$tree/scripts/kit/check-zero-edit-zones.sh"
  else
    zero_script="$ROOT/scripts/kit/check-zero-edit-zones.sh"
    echo "NOTE: using kit zero-edit script with ZERO_EDIT_ROOT=$tree"
  fi
  if [[ -f "$tree/scripts/kit/check-banned-strings.sh" ]]; then
    ban_script="$tree/scripts/kit/check-banned-strings.sh"
  else
    ban_script="$ROOT/scripts/kit/check-banned-strings.sh"
    echo "NOTE: using kit banlist script with ZERO_EDIT_ROOT=$tree"
  fi

  ZERO_EDIT_ROOT="$tree" bash "$zero_script"
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

write_inheritance() {
  local tree="$1"
  local sha="$2"
  mkdir -p "$tree/config/product"
  printf '%s\n' "{\"version\":1,\"upstreamCommit\":\"${sha}\"}" >"$tree/config/product/inheritance.json"
}

if [[ "$MODE" == "--self-sim" ]]; then
  TMP="$(mktemp -d -t kit-dogfood-XXXXXX)"
  trap 'rm -rf "$TMP"' EXIT
  echo "== dogfood: self-sim in $TMP (branch=${BRANCH}) =="

  # Clone the branch under test (not stale origin/main).
  git clone --depth 1 --branch "$BRANCH" "file://$ROOT" "$TMP/product"
  cd "$TMP/product"

  TIP="$(git rev-parse HEAD)"

  # Origin must NOT be kit-allowlisted or zero-edit stays in kit mode.
  git remote rename origin kit-origin
  git remote add origin "file://$TMP/product"
  git remote add upstream "file://$ROOT"
  git remote set-url --push upstream no_push
  # Stale-looking upstream tip (different SHA name) — must not be used as base (#103).
  git update-ref refs/remotes/upstream/main "$(git rev-parse HEAD)" 2>/dev/null || true

  assert_no_push
  write_inheritance "$TMP/product" "$TIP"
  # Commit marker so dirty-tree noise is only intentional dual-edits below.
  git -C "$TMP/product" add config/product/inheritance.json
  LEFTHOOK=0 git -C "$TMP/product" -c user.email=dogfood@example.com -c user.name=dogfood \
    commit -q -m "chore: pin inheritance for dogfood self-sim"

  # Positive: clean product tree vs inheritance tip
  run_gates "$TMP/product"

  # #103: base is inheritance.json only (ZERO_EDIT_BASE_REF removed in #107)

  # Negative: protected-path dual-edit must fail
  echo "/* dogfood dual-edit probe */" >>package.json
  set +e
  ZERO_EDIT_ROOT="$TMP/product" bash "$ROOT/scripts/kit/check-zero-edit-zones.sh"
  neg=$?
  set -e
  if [[ "$neg" -eq 0 ]]; then
    echo "FAIL: expected zero-edit to fail after package.json dual-edit" >&2
    exit 1
  fi
  echo "dogfood self-sim: OK (inheritance base + dual-edit fail + no_push)"
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
exit 0
