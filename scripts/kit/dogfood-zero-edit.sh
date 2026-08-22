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
# Self-sim also asserts:
#   - Roxabi kit → mirror → product chain (three repos, distinct tips)
#   - stale refs/remotes/upstream/main does not control the base (#103)
#   - protected-path dual-edit fails
#   - mirror stays kit mode (allowlisted origin, no product marker)
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
MODE="${1:-}"
BRANCH="$(git -C "$ROOT" branch --show-current)"
ZERO_SCRIPT="$ROOT/scripts/kit/check-zero-edit-zones.sh"
BAN_SCRIPT="$ROOT/scripts/kit/check-banned-strings.sh"
DENY_SCRIPT="$ROOT/scripts/kit/deny-upstream-push.sh"

run_gates() {
  local tree="$1"
  local zero_script ban_script
  if [[ -f "$tree/scripts/kit/check-zero-edit-zones.sh" ]]; then
    zero_script="$tree/scripts/kit/check-zero-edit-zones.sh"
  else
    zero_script="$ZERO_SCRIPT"
    echo "NOTE: using kit zero-edit script with ZERO_EDIT_ROOT=$tree"
  fi
  if [[ -f "$tree/scripts/kit/check-banned-strings.sh" ]]; then
    ban_script="$tree/scripts/kit/check-banned-strings.sh"
  else
    ban_script="$BAN_SCRIPT"
    echo "NOTE: using kit banlist script with ZERO_EDIT_ROOT=$tree"
  fi

  ZERO_EDIT_ROOT="$tree" bash "$zero_script"
  ZERO_EDIT_ROOT="$tree" bash "$ban_script"
}

assert_no_push() {
  local tree="${1:-.}"
  local push_url
  push_url="$(git -C "$tree" remote get-url --push upstream 2>/dev/null || true)"
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

assert_distinct_shas() {
  local a="$1"
  local b="$2"
  local c="$3"
  if [[ "$a" == "$b" || "$a" == "$c" || "$b" == "$c" ]]; then
    echo "FAIL: expected three distinct commit SHAs (kit=${a:0:12} mirror=${b:0:12} product=${c:0:12})" >&2
    exit 1
  fi
}

if [[ "$MODE" == "--self-sim" ]]; then
  TMP="$(mktemp -d -t kit-dogfood-XXXXXX)"
  trap 'rm -rf "$TMP"' EXIT
  echo "== dogfood: self-sim in $TMP (branch=${BRANCH}) =="

  # --- Chain: kit HEAD → mirror tip → product (immediate parent = mirror) ---
  git clone --branch "$BRANCH" "file://$ROOT" "$TMP/kit"
  KIT_TIP="$(git -C "$TMP/kit" rev-parse HEAD)"

  git clone "file://$TMP/kit" "$TMP/mirror"
  git -C "$TMP/mirror" remote set-url origin "https://github.com/go-silex/silex-boilerplate.git"
  mkdir -p "$TMP/mirror/config/product"
  printf '%s\n' '{"version":1,"chain":"mirror"}' >"$TMP/mirror/config/product/mirror-stamp.json"
  printf '\n<!-- dogfood mirror inherit -->\n' >>"$TMP/mirror/README.md"
  git -C "$TMP/mirror" add config/product/mirror-stamp.json README.md
  LEFTHOOK=0 git -C "$TMP/mirror" -c user.email=dogfood@example.com -c user.name=dogfood \
    commit -q -m "chore: mirror stamp for dogfood chain"
  MIRROR_TIP="$(git -C "$TMP/mirror" rev-parse HEAD)"

  git clone "file://$TMP/mirror" "$TMP/product"
  cd "$TMP/product"
  git remote rename origin kit-origin
  git remote add origin "https://github.com/example/acme-product.git"
  git remote add upstream "file://$TMP/mirror"
  git remote set-url --push upstream no_push

  write_inheritance "$TMP/product" "$MIRROR_TIP"
  git add config/product/inheritance.json
  LEFTHOOK=0 git -C "$TMP/product" -c user.email=dogfood@example.com -c user.name=dogfood \
    commit -q -m "chore: pin inheritance to mirror tip"
  PRODUCT_TIP="$(git -C "$TMP/product" rev-parse HEAD)"

  assert_distinct_shas "$KIT_TIP" "$MIRROR_TIP" "$PRODUCT_TIP"

  # #103: stale upstream/main must not be used as base (would false-fail vs inheritance).
  git -C "$TMP/product" update-ref "refs/remotes/upstream/main" "$KIT_TIP"
  STALE_REF="$(git -C "$TMP/product" rev-parse refs/remotes/upstream/main)"
  if [[ "$STALE_REF" == "$MIRROR_TIP" ]]; then
    echo "FAIL: stale upstream/main ref must differ from inheritance upstreamCommit" >&2
    exit 1
  fi

  assert_no_push "$TMP/product"

  # Mirror: kit mode on allowlisted origin (no product inheritance marker).
  if [[ -f "$TMP/mirror/config/product/inheritance.json" ]]; then
    echo "FAIL: mirror must not carry product inheritance marker" >&2
    exit 1
  fi
  run_gates "$TMP/mirror"

  # Product: clean tree vs inheritance marker despite stale upstream/main.
  run_gates "$TMP/product"

  # Explicit #103 probe: stale upstream/main would false-fail protected paths inherited from mirror.
  STALE_HITS="$(git -C "$TMP/product" diff --name-only "$STALE_REF" HEAD -- README.md package.json 2>/dev/null || true)"
  if [[ -z "$STALE_HITS" ]]; then
    echo "FAIL: expected stale upstream/main to differ from inheritance base on protected paths (#103 fixture)" >&2
    exit 1
  fi
  echo "dogfood #103: stale upstream/main would flag: $(echo "$STALE_HITS" | tr '\n' ' ')"

  # Negative: protected-path dual-edit must fail.
  echo "/* dogfood dual-edit probe */" >>"$TMP/product/package.json"
  set +e
  ZERO_EDIT_ROOT="$TMP/product" bash "$ZERO_SCRIPT"
  neg=$?
  set -e
  if [[ "$neg" -eq 0 ]]; then
    echo "FAIL: expected zero-edit to fail after package.json dual-edit" >&2
    exit 1
  fi

  # deny-upstream: product must block push to upstream remote name.
  set +e
  env -u GIT_DIR -u GIT_WORK_TREE -u GIT_COMMON_DIR -C "$TMP/product" \
    bash "$DENY_SCRIPT" upstream "file://$TMP/mirror"
  deny=$?
  set -e
  if [[ "$deny" -ne 1 ]]; then
    echo "FAIL: deny-upstream must block product push to remote name upstream (exit 1, got ${deny})" >&2
    exit 1
  fi

  echo "dogfood self-sim: OK (kit→mirror→product chain + inheritance base + stale ref ignored + dual-edit fail + no_push + deny-upstream)"
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

assert_no_push "$PRODUCT"
run_gates "$PRODUCT"
echo "dogfood product: OK"
exit 0
