#!/usr/bin/env bash
# Roxabi/roxabi-boilerplate-cf#148 — leftover-biome-staged.sh must not unstage deletions.
set -euo pipefail
# shellcheck source=lib/hermetic-git.sh
source "$(cd "$(dirname "$0")" && pwd -P)/lib/hermetic-git.sh"

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
# Keep bunx offline in the fixture while exercising the installed Kit Biome.
BIOME_TEST_BIN="${ROOT}/node_modules/.bin/biome"
[ -x "$BIOME_TEST_BIN" ] || { echo "missing installed Kit Biome: ${BIOME_TEST_BIN}" >&2; exit 1; }
export BIOME_TEST_BIN
mkdir -p "${TMP}/bin"
cat >"${TMP}/bin/bunx" <<'SH'
#!/usr/bin/env bash
set -euo pipefail
[ "${1:-}" = biome ] || exit 1
shift
exec "$BIOME_TEST_BIN" "$@"
SH
chmod +x "${TMP}/bin/bunx"
export PATH="${TMP}/bin:${PATH}"
git init -q "$TMP"
git -C "$TMP" config user.email kit@example.com
git -C "$TMP" config user.name kit
printf 'keep\n' >"${TMP}/keep.txt"
printf 'gone\n' >"${TMP}/gone.txt"
mkdir -p "${TMP}/artifacts"
printf 'tracked baseline\n' >"${TMP}/artifacts/tracked.txt"
printf 'literal baseline\n' >"${TMP}/literal[1].txt"
printf 'neighbor baseline\n' >"${TMP}/literal1.txt"
printf 'rename baseline\n' >"${TMP}/rename-old.txt"
magic=':(glob)magic*.txt'
newline=$'line\nbreak.txt'
printf 'magic baseline\n' >"${TMP}/${magic}"
printf 'magic neighbor baseline\n' >"${TMP}/magic1.txt"
printf 'newline baseline\n' >"${TMP}/${newline}"
git -C "$TMP" --literal-pathspecs add keep.txt gone.txt artifacts/tracked.txt 'literal[1].txt' literal1.txt rename-old.txt "$magic" magic1.txt "$newline"
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

echo "== indexed ignored paths and literal restaging =="
printf 'added staged\n' >"${TMP}/artifacts/added.txt"
printf 'normal added\n' >"${TMP}/normal-added.txt"
git -C "$TMP" add artifacts/added.txt normal-added.txt
printf '/artifacts/\n' >"${TMP}/.gitignore"
printf 'ignored untracked\n' >"${TMP}/artifacts/private.txt"
printf 'tracked staged\n' >"${TMP}/artifacts/tracked.txt"
git -C "$TMP" add -u -- artifacts/tracked.txt
printf 'tracked restaged\n' >"${TMP}/artifacts/tracked.txt"
printf 'added restaged\n' >"${TMP}/artifacts/added.txt"
printf 'literal staged\n' >"${TMP}/literal[1].txt"
git -C "$TMP" --literal-pathspecs add -u -- 'literal[1].txt'
printf 'literal restaged\n' >"${TMP}/literal[1].txt"
printf 'neighbor unstaged\n' >"${TMP}/literal1.txt"
printf 'magic staged\n' >"${TMP}/${magic}"
printf 'newline staged\n' >"${TMP}/${newline}"
git -C "$TMP" --literal-pathspecs add -u -- "$magic" "$newline"
printf 'magic restaged\n' >"${TMP}/${magic}"
printf 'newline restaged\n' >"${TMP}/${newline}"
printf 'magic neighbor unstaged\n' >"${TMP}/magic1.txt"
printf '{"value":1}\n' >"${TMP}/format.json"
git -C "$TMP" add -- format.json
format_before_worktree=$(cat "${TMP}/format.json")
format_before_index=$(git -C "$TMP" show :format.json)
git -C "$TMP" mv rename-old.txt rename-new.txt
(
  cd "$TMP"
  bash "$SCRIPT"
)
st=$(git -C "$TMP" diff --cached --name-status -M)
tracked=$(git -C "$TMP" show :artifacts/tracked.txt)
added=$(git -C "$TMP" show :artifacts/added.txt)
literal=$(git -C "$TMP" show ':literal[1].txt')
neighbor=$(git -C "$TMP" show :literal1.txt)
magic_index=$(git -C "$TMP" show ":${magic}")
magic_neighbor=$(git -C "$TMP" show :magic1.txt)
newline_index=$(git -C "$TMP" show ":${newline}")
format_after_worktree=$(cat "${TMP}/format.json")
format_after_index=$(git -C "$TMP" show :format.json)
assert "ignored indexed M restaged" '[[ "$tracked" == "tracked restaged" && "$st" == *"M	artifacts/tracked.txt"* ]]'
assert "ignored indexed A restaged" '[[ "$added" == "added restaged" && "$st" == *"A	artifacts/added.txt"* ]]'
assert "ignored untracked neighbor remains unindexed" '! git -C "$TMP" ls-files --error-unmatch -- artifacts/private.txt >/dev/null 2>&1'
assert "literal glob filename restaged" '[[ "$literal" == "literal restaged" ]]'
assert "glob-matching tracked neighbor stays unstaged" '[[ "$neighbor" == "neighbor baseline" ]]'
assert "pathspec magic filename restaged literally" '[[ "$magic_index" == "magic restaged" ]]'
assert "magic-matching tracked neighbor stays unstaged" '[[ "$magic_neighbor" == "magic neighbor baseline" ]]'
assert "newline filename restaged intact" '[[ "$newline_index" == "newline restaged" ]]'
assert "real Biome changes staged fixture" '[[ "$format_before_index" == "$format_before_worktree" && "$format_after_worktree" != "$format_before_worktree" ]]'
assert "Biome output reaches index" '[[ "$format_after_index" == "$format_after_worktree" && "$format_after_index" != "$format_before_index" ]]'
assert "normal A remains staged" '[[ "$st" == *"A	normal-added.txt"* ]]'
assert "normal M remains staged" '[[ "$st" == *"M	keep.txt"* ]]'
assert "rename remains staged" '[[ "$st" == *"R100	rename-old.txt	rename-new.txt"* ]]'
assert "D remains staged with indexed ignored paths" '[[ "$st" == *"D	gone.txt"* ]]'

echo "== git diff failure is a hard error =="
# rc != 0 only. git's die() text is translated. The fail-open path is a silent
# exit 0 (empty staged list, no success banner).
mkdir -p "${TMP}/not-an-index"
set +e
out=$(cd "$TMP" && GIT_INDEX_FILE="${TMP}/not-an-index" bash "$SCRIPT" 2>&1)
rc=$?
set -e
assert "failing git diff --cached is not an empty list" '[[ "$rc" -ne 0 ]]'

echo "== summary: ${PASS} pass, ${FAIL} fail =="
[ "$FAIL" -eq 0 ]
echo "lefthook-deletes: OK"
