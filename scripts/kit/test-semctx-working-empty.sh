#!/usr/bin/env bash
# Hermetic self-test for check-semctx-working-empty.sh. Fixtures only.
set -euo pipefail
unset GIT_DIR GIT_WORK_TREE GIT_COMMON_DIR 2>/dev/null || true

ROOT="$(cd "$(dirname "$0")/../.." && pwd -P)"
SCRIPT="${ROOT}/scripts/kit/check-semctx-working-empty.sh"
[[ -f "$SCRIPT" ]] || {
  echo "missing ${SCRIPT}" >&2
  exit 1
}

PASS=0
FAIL=0

assert_case() {
  local name="$1" expected="$2" tree="$3" marker="$4"
  local output rc=0
  output="$(SEMCTX_WORKING_ROOT="$tree" SEMCTX_WORKING_TREE="${5:-}" bash "$SCRIPT" 2>&1)" || rc=$?
  if [[ "$rc" -eq "$expected" ]] && [[ "$output" == *"$marker"* ]]; then
    echo "PASS: $name"
    PASS=$((PASS + 1))
  else
    echo "FAIL: $name (expected rc=$expected and marker '$marker', got rc=$rc)" >&2
    echo "$output" >&2
    FAIL=$((FAIL + 1))
  fi
}

init_repo() {
  local tree="$1"
  mkdir -p "$tree"
  git init -q "$tree"
  git -C "$tree" config user.email kit@example.com
  git -C "$tree" config user.name kit
}

TMP="$(mktemp -d -t semctx-working.XXXXXX)"
trap 'rm -rf "$TMP"' EXIT

echo "== semctx working empty self-test =="

OK="$TMP/ok"
init_repo "$OK"
mkdir -p "${OK}/.semctx/working"
printf '# keep\n' >"${OK}/.semctx/working/.gitkeep"
git -C "$OK" add .semctx/working/.gitkeep
git -C "$OK" commit -q -m init
assert_case "only tracked gitkeep" 0 "$OK" "check-semctx-working-empty: OK"

TRACKED="$TMP/tracked-extra"
init_repo "$TRACKED"
mkdir -p "${TRACKED}/.semctx/working"
printf '# keep\n' >"${TRACKED}/.semctx/working/.gitkeep"
printf 'change leftover\n' >"${TRACKED}/.semctx/working/change.kit.example.sem"
git -C "$TRACKED" add .semctx/working
git -C "$TRACKED" commit -q -m extra
assert_case "tracked extra fails" 1 "$TRACKED" "extra: .semctx/working/change.kit.example.sem"

UNTRACKED="$TMP/untracked-extra"
init_repo "$UNTRACKED"
mkdir -p "${UNTRACKED}/.semctx/working"
printf '# keep\n' >"${UNTRACKED}/.semctx/working/.gitkeep"
git -C "$UNTRACKED" add .semctx/working/.gitkeep
git -C "$UNTRACKED" commit -q -m init
printf 'local handoff\n' >"${UNTRACKED}/.semctx/working/active-change.sem"
assert_case "untracked extra ignored (tree only)" 0 "$UNTRACKED" "check-semctx-working-empty: OK"

MISSING="$TMP/missing-keep"
init_repo "$MISSING"
mkdir -p "${MISSING}/.semctx/working"
git -C "$MISSING" commit -q --allow-empty -m init
assert_case "missing gitkeep fails" 1 "$MISSING" "missing .semctx/working/.gitkeep"

UNTRACKED_KEEP="$TMP/untracked-keep"
init_repo "$UNTRACKED_KEEP"
mkdir -p "${UNTRACKED_KEEP}/.semctx/working"
printf '# keep\n' >"${UNTRACKED_KEEP}/.semctx/working/.gitkeep"
git -C "$UNTRACKED_KEEP" commit -q --allow-empty -m init
assert_case "untracked gitkeep fails" 1 "$UNTRACKED_KEEP" "missing .semctx/working/.gitkeep"

PIN="$TMP/pin-sha"
init_repo "$PIN"
mkdir -p "${PIN}/.semctx/working"
printf '# keep\n' >"${PIN}/.semctx/working/.gitkeep"
git -C "$PIN" add .semctx/working/.gitkeep
git -C "$PIN" commit -q -m keep
CLEAN_SHA="$(git -C "$PIN" rev-parse HEAD)"
printf 'dirt\n' >"${PIN}/.semctx/working/change.kit.dirt.sem"
git -C "$PIN" add .semctx/working/change.kit.dirt.sem
git -C "$PIN" commit -q -m dirt
assert_case "HEAD with extra fails" 1 "$PIN" "extra: .semctx/working/change.kit.dirt.sem"
assert_case "pinned clean SHA ignores later commit and workdir" 0 "$PIN" "check-semctx-working-empty: OK" "$CLEAN_SHA"

echo "== semctx working empty summary: ${PASS} pass, ${FAIL} fail =="
[[ "$FAIL" -eq 0 ]]
echo "semctx-working-empty: OK"
