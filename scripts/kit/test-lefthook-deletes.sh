#!/usr/bin/env bash
# #148 — leftover-biome-staged.sh must not unstage deletions.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
SCRIPT="${ROOT}/scripts/kit/lefthook-biome-staged.sh"
[ -f "$SCRIPT" ] || {
  echo "missing ${SCRIPT}" >&2
  exit 1
}

PASS=0
FAIL=0

assert() {
  local name="$1" cond="$2"
  if eval "$cond"; then
    echo "  PASS: ${name}"
    PASS=$((PASS + 1))
  else
    echo "  FAIL: ${name}" >&2
    FAIL=$((FAIL + 1))
  fi
}

TMP="$(mktemp -d -t lefthook-del-XXXXXX)"
trap 'rm -rf "$TMP"' EXIT
git init -q "$TMP"
git -C "$TMP" config user.email kit@example.com
git -C "$TMP" config user.name kit
printf 'keep\n' >"${TMP}/keep.txt"
printf 'gone\n' >"${TMP}/gone.txt"
git -C "$TMP" add keep.txt gone.txt
git -C "$TMP" commit -q -m init

echo "== delete-only =="
git -C "$TMP" rm -q gone.txt
# wrapper needs bunx biome in PATH; ACMR is empty → no biome, must leave D
(
  cd "$TMP"
  bash "$SCRIPT"
)
st=$(git -C "$TMP" diff --cached --name-status)
assert "D still staged after wrapper" '[[ "$st" == *"D	gone.txt"* ]]'
echo "== mixed D + M =="
printf 'keep2\n' >>"${TMP}/keep.txt"
git -C "$TMP" add keep.txt
(
  cd "$TMP"
  bash "$SCRIPT"
)
st=$(git -C "$TMP" diff --cached --name-status)
assert "D still staged in mixed" '[[ "$st" == *"D	gone.txt"* ]]'
assert "M still staged in mixed" '[[ "$st" == *"M	keep.txt"* ]]'
echo "== fail-path restores D =="
SNAP="${ROOT}/scripts/kit/lefthook-snapshot-deletes.sh"
REST="${ROOT}/scripts/kit/lefthook-restore-deletes.sh"
(
  cd "$TMP"
  bash "$SNAP"
  git checkout HEAD -- gone.txt
  git add gone.txt
  set +e
  bash -c "trap 'bash \"${REST}\"' EXIT; exit 1"
  set -e
)
st=$(git -C "$TMP" diff --cached --name-status)
assert "D restored after failed gate" '[[ "$st" == *"D	gone.txt"* ]]'
gd="$(git -C "$TMP" rev-parse --git-dir)"
assert "no orphan leftover-index-tree" '[[ ! -f "${gd}/lefthook-index-tree" ]]'

echo "== summary: ${PASS} pass, ${FAIL} fail =="
[ "$FAIL" -eq 0 ]
echo "lefthook-deletes: OK"
