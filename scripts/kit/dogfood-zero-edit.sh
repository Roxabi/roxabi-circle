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
#   - kit fixture seeds from exact source HEAD (branch or detached — CI-safe)
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
MODE="${1:-}"
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

# Seed kit fixture at exact source HEAD — works on named branches and detached HEAD (CI).
seed_kit_from_head() {
  local dest="$1"
  local source="$2"
  local want_head
  want_head="$(git -C "$source" rev-parse HEAD)"
  rm -rf "$dest"
  git init -q "$dest"
  git -C "$dest" remote add kit-seed "file://${source}"
  git -C "$dest" -c user.email=dogfood@example.com -c user.name=dogfood fetch -q kit-seed HEAD
  git -C "$dest" checkout -q -B main FETCH_HEAD
  local got_head
  got_head="$(git -C "$dest" rev-parse HEAD)"
  if [[ "$got_head" != "$want_head" ]]; then
    echo "FAIL: kit seed HEAD mismatch (want ${want_head}, got ${got_head})" >&2
    exit 1
  fi
}

run_self_sim_chain() {
  local source_root="$1"
  local work="$2"
  local label="$3"

  echo "== dogfood chain (${label}): source=$(git -C "$source_root" rev-parse --short HEAD) =="

  seed_kit_from_head "$work/kit" "$source_root"
  local KIT_TIP MIRROR_TIP PRODUCT_TIP STALE_REF STALE_HITS
  KIT_TIP="$(git -C "$work/kit" rev-parse HEAD)"

  git clone "file://$work/kit" "$work/mirror"
  git -C "$work/mirror" remote set-url origin "https://github.com/go-silex/silex-boilerplate.git"
  mkdir -p "$work/mirror/config/product"
  printf '%s\n' '{"version":1,"chain":"mirror"}' >"$work/mirror/config/product/mirror-stamp.json"
  printf '\n<!-- dogfood mirror inherit -->\n' >>"$work/mirror/README.md"
  git -C "$work/mirror" add config/product/mirror-stamp.json README.md
  LEFTHOOK=0 git -C "$work/mirror" -c user.email=dogfood@example.com -c user.name=dogfood \
    commit -q -m "chore: mirror stamp for dogfood chain"
  MIRROR_TIP="$(git -C "$work/mirror" rev-parse HEAD)"

  git clone "file://$work/mirror" "$work/product"
  git -C "$work/product" remote rename origin kit-origin
  git -C "$work/product" remote add origin "https://github.com/example/acme-product.git"
  git -C "$work/product" remote add upstream "file://$work/mirror"
  git -C "$work/product" remote set-url --push upstream no_push

  write_inheritance "$work/product" "$MIRROR_TIP"
  git -C "$work/product" add config/product/inheritance.json
  LEFTHOOK=0 git -C "$work/product" -c user.email=dogfood@example.com -c user.name=dogfood \
    commit -q -m "chore: pin inheritance to mirror tip"
  PRODUCT_TIP="$(git -C "$work/product" rev-parse HEAD)"

  assert_distinct_shas "$KIT_TIP" "$MIRROR_TIP" "$PRODUCT_TIP"

  git -C "$work/product" update-ref "refs/remotes/upstream/main" "$KIT_TIP"
  STALE_REF="$(git -C "$work/product" rev-parse refs/remotes/upstream/main)"
  if [[ "$STALE_REF" == "$MIRROR_TIP" ]]; then
    echo "FAIL: stale upstream/main ref must differ from inheritance upstreamCommit" >&2
    exit 1
  fi

  assert_no_push "$work/product"

  if [[ -f "$work/mirror/config/product/inheritance.json" ]]; then
    echo "FAIL: mirror must not carry product inheritance marker" >&2
    exit 1
  fi
  run_gates "$work/mirror"
  run_gates "$work/product"

  STALE_HITS="$(git -C "$work/product" diff --name-only "$STALE_REF" HEAD -- README.md package.json 2>/dev/null || true)"
  if [[ -z "$STALE_HITS" ]]; then
    echo "FAIL: expected stale upstream/main to differ from inheritance base on protected paths (#103 fixture)" >&2
    exit 1
  fi
  echo "dogfood #103 (${label}): stale upstream/main would flag: $(echo "$STALE_HITS" | tr '\n' ' ')"

  echo "/* dogfood dual-edit probe */" >>"$work/product/package.json"
  set +e
  ZERO_EDIT_ROOT="$work/product" bash "$ZERO_SCRIPT"
  local neg=$?
  set -e
  if [[ "$neg" -eq 0 ]]; then
    echo "FAIL: expected zero-edit to fail after package.json dual-edit" >&2
    exit 1
  fi

  set +e
  env -u GIT_DIR -u GIT_WORK_TREE -u GIT_COMMON_DIR -C "$work/product" \
    bash "$DENY_SCRIPT" upstream "file://$work/mirror"
  local deny=$?
  set -e
  if [[ "$deny" -ne 1 ]]; then
    echo "FAIL: deny-upstream must block product push to remote name upstream (exit 1, got ${deny})" >&2
    exit 1
  fi
}

if [[ "$MODE" == "--self-sim" ]]; then
  TMP="$(mktemp -d -t kit-dogfood-XXXXXX)"
  trap 'rm -rf "$TMP"' EXIT
  SOURCE_HEAD="$(git -C "$ROOT" rev-parse HEAD)"
  SOURCE_BRANCH="$(git -C "$ROOT" branch --show-current || true)"
  echo "== dogfood: self-sim in $TMP (source_head=${SOURCE_HEAD:0:12} branch=${SOURCE_BRANCH:-detached}) =="

  run_self_sim_chain "$ROOT" "$TMP/primary" "primary"

  # Detached-HEAD source probe — does not alter the real checkout.
  echo "== dogfood: detached-HEAD source probe =="
  git clone --no-checkout "file://$ROOT" "$TMP/detached-src"
  git -C "$TMP/detached-src" checkout -q --detach "$SOURCE_HEAD"
  if [[ -n "$(git -C "$TMP/detached-src" branch --show-current)" ]]; then
    echo "FAIL: detached-src fixture is not detached" >&2
    exit 1
  fi
  run_self_sim_chain "$TMP/detached-src" "$TMP/detached" "detached"

  echo "dogfood self-sim: OK (HEAD seed + kit→mirror→product + #103 + dual-edit fail + no_push + deny-upstream + detached source)"
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
