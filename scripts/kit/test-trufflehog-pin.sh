#!/usr/bin/env bash
# Hermetic self-test for trufflehog-check.sh: a scan leaves the pinned binary as pinned (Roxabi/roxabi-boilerplate-cf#261).
#
# The real TruffleHog replaces its own executable with the latest release unless it gets
# `--no-update`. The fake below models that, plus what its argument parser (kingpin) rejects
# and how it reports a finding, so the test sees the scans themselves, not only the log lines
# printed before them. No network on any path: a re-fetch hits curl/wget stubs that fail at
# once, so a red run cannot stall on a dropped connection.
set -euo pipefail
# shellcheck source=lib/hermetic-git.sh
source "$(cd "$(dirname "$0")" && pwd -P)/lib/hermetic-git.sh"

ROOT="$(cd "$(dirname "$0")/../.." && pwd -P)"
SCRIPT="${ROOT}/scripts/kit/trufflehog-check.sh"
[[ -f "$SCRIPT" ]] || {
  echo "missing ${SCRIPT}" >&2
  exit 1
}

PASS=0
FAIL=0
ok() {
  echo "PASS: $1"
  PASS=$((PASS + 1))
}
ko() {
  echo "FAIL: $1" >&2
  FAIL=$((FAIL + 1))
}

sha256_of() {
  if command -v sha256sum >/dev/null 2>&1; then
    sha256sum -- "$1" | cut -d' ' -f1
  else
    shasum -a 256 -- "$1" | cut -d' ' -f1
  fi
}

TARGET=""
case "$(uname -s):$(uname -m)" in
  Linux:x86_64) TARGET=linux_amd64 ;;
  Linux:aarch64 | Linux:arm64) TARGET=linux_arm64 ;;
  Darwin:x86_64) TARGET=darwin_amd64 ;;
  Darwin:arm64) TARGET=darwin_arm64 ;;
esac
[[ -n "$TARGET" ]] || {
  echo "SKIP: no trufflehog target for $(uname -s)/$(uname -m)"
  exit 0
}

TMP="$(mktemp -d -t thog-pin.XXXXXX)"
trap 'rm -rf "$TMP"' EXIT

VERSION="0.0.0-selftest"
ACTION_SHA="0000000000000000000000000000000000000000"
KIT_KEY="FAKE_THOG_KIT_KEY"
VERIFIED="FAKE_THOG_VERIFIED"

# Fake binary, modelling TruffleHog as the hook drives it:
# - parser (kingpin): an unknown or repeated flag, or no subcommand → exit 1;
# - updater: without --no-update it rewrites itself in place;
# - detection: `--only-verified` reports only a verified secret, `--config` only a
#   kit-issued key (unverifiable, so `--only-verified` drops it). `filesystem` reads
#   those markers from its path arguments; `git file://<repo> --since-commit=<sha>`
#   walks date-ordered `--full-history` and **stops** at the first commit equal to
#   `since` (TruffleHog 3.97.1; not a set difference — Roxabi/roxabi-boilerplate-cf#284 / Roxabi/roxabi-boilerplate-cf#266). Without
#   `--since-commit`, every commit's `--cc` patch is scanned. `--include-detectors`
#   narrows a pass to nothing; a finding exits 183 only under `--fail`. Every call
#   is logged.
STUB="${TMP}/trufflehog"
cat >"$STUB" <<'EOF'
#!/usr/bin/env bash
printf '%s\n' "$*" >>"${THOG_FAKE_LOG:?}"
sub="" narrowed=0 ended=0 seen=" " since=""
paths=()
for a in "$@"; do
  if [ "$ended" -eq 1 ]; then
    paths+=("$a")
    continue
  fi
  case "$a" in
    --)
      ended=1
      continue
      ;;
    --no-update | --only-verified | --fail) name="${a#--}" ;;
    --config=* | --exclude-paths=* | --since-commit=* | --include-detectors=*)
      name="${a%%=*}"
      name="${name#--}"
      case "$a" in
        --since-commit=*) since="${a#*=}" ;;
      esac
      ;;
    -*)
      echo "error: unknown long flag '${a}'" >&2
      exit 1
      ;;
    git | filesystem)
      if [ -z "$sub" ]; then sub="$a"; else paths+=("$a"); fi
      continue
      ;;
    *)
      paths+=("$a")
      continue
      ;;
  esac
  case "$seen" in
    *" ${name} "*)
      echo "error: flag '${name}' cannot be repeated" >&2
      exit 1
      ;;
  esac
  seen="${seen}${name} "
  [ "$name" = include-detectors ] && narrowed=1
done
if [ -z "$sub" ]; then
  echo "error: expected command but got none" >&2
  exit 1
fi
case "$seen" in
  *" no-update "*) ;;
  *) printf '# self-updated to latest\n' >>"$0" ;;
esac
want=""
case "$seen" in
  *" only-verified "*) want=FAKE_THOG_VERIFIED ;;
  *" config "*) want=FAKE_THOG_KIT_KEY ;;
esac
if [ "$narrowed" -eq 0 ] && [ -n "$want" ] && [[ "$seen" == *" fail "* ]]; then
  if [ "$sub" = filesystem ]; then
    for p in "${paths[@]}"; do
      if [ -f "$p" ] && grep -q -e "$want" -- "$p"; then
        exit 183
      fi
    done
  elif [ "$sub" = git ]; then
    repo=""
    for p in "${paths[@]}"; do
      case "$p" in
        file://*) repo="${p#file://}" ;;
      esac
    done
    if [ -n "$repo" ]; then
      # Date-ordered full-history walk; --since-commit is a stop marker (Roxabi/roxabi-boilerplate-cf#284).
      while IFS= read -r c; do
        [ -n "$c" ] || continue
        if [ -n "$since" ] && [ "$c" = "$since" ]; then
          break
        fi
        patch="$(git -C "$repo" show --cc --format= "$c")" || exit 1
        if printf '%s\n' "$patch" | grep -q -e "$want" --; then
          exit 183
        fi
      done < <(git -C "$repo" log --format=%H --full-history --date-order)
    fi
  fi
fi
exit 0
EOF
chmod +x "$STUB"
PINNED="$(sha256_of "$STUB")"

# Fresh fixture repo: pin + workflow pins + fake in the cache, one commit ahead of origin/main.
new_repo() {
  local repo="$1" t
  git init -q -b main "$repo"
  git -C "$repo" config user.email kit@example.com
  git -C "$repo" config user.name kit
  git -C "$repo" config commit.gpgsign false
  mkdir -p "${repo}/scripts/kit" "${repo}/config/kit" "${repo}/.github/workflows"
  cp "$SCRIPT" "${repo}/scripts/kit/trufflehog-check.sh"
  cp "${ROOT}/scripts/kit/trufflehog-exclude-paths.txt" "${repo}/scripts/kit/"
  cp "${ROOT}/scripts/kit/trufflehog-detectors.yaml" "${repo}/scripts/kit/"
  printf '.cache/\n' >"${repo}/.gitignore"
  cat >"${repo}/.github/workflows/secret-scan.yml" <<EOF
# pinned binary v${VERSION} via config/kit/trufflehog.version (Roxabi/roxabi-boilerplate-cf#284 — no action uses)
name: Secret scan
jobs:
  trufflehog:
    steps:
      - run: bash scripts/kit/trufflehog-check.sh --commits-only
EOF
  {
    printf 'version=%s\n' "$VERSION"
    printf 'action_sha=%s\n' "$ACTION_SHA"
    for t in linux_amd64 linux_arm64 darwin_amd64 darwin_arm64; do
      printf 'sha256_%s=%064d\n' "$t" 0
      printf 'sha256_bin_%s=%s\n' "$t" "$PINNED"
    done
  } >"${repo}/config/kit/trufflehog.version"
  git -C "$repo" add -A
  git -C "$repo" commit -q -m base
  git init -q --bare "${repo}.origin.git"
  git -C "$repo" remote add origin "${repo}.origin.git"
  git -C "$repo" push -q origin main
  git -C "$repo" fetch -q origin
  printf 'ahead\n' >"${repo}/ahead.txt"
  git -C "$repo" add ahead.txt
  git -C "$repo" commit -q -m ahead
  mkdir -p "${repo}/.cache/trufflehog/${VERSION}/${TARGET}"
  cp "$STUB" "${repo}/.cache/trufflehog/${VERSION}/${TARGET}/trufflehog"
}

# Download tools that fail at once: a hash mismatch must surface as a fast failure, never a fetch.
NONET="${TMP}/nonet"
mkdir -p "$NONET"
for tool in curl wget; do
  printf '#!/bin/sh\necho "%s: network disabled in self-test" >&2\nexit 1\n' "$tool" >"${NONET}/${tool}"
  chmod +x "${NONET}/${tool}"
done

# run_hook <repo> <log> [path_prefix] → sets HOOK_RC and HOOK_OUT.
# path_prefix is prepended to PATH ahead of the offline curl/wget stubs, so a
# case can replace git without letting a re-fetch reach the network.
# HOOK_GIT_INDEX_FILE, when set, is the index the hook's git sees (case 7).
run_hook() {
  HOOK_RC=0
  local prefix="${3:-$NONET}"
  if [ -n "${HOOK_GIT_INDEX_FILE:-}" ]; then
    HOOK_OUT="$(cd "$1" && PATH="${prefix}:${NONET}:${PATH}" THOG_FAKE_LOG="$2" GIT_INDEX_FILE="$HOOK_GIT_INDEX_FILE" bash scripts/kit/trufflehog-check.sh 2>&1)" || HOOK_RC=$?
  else
    HOOK_OUT="$(cd "$1" && PATH="${prefix}:${NONET}:${PATH}" THOG_FAKE_LOG="$2" bash scripts/kit/trufflehog-check.sh 2>&1)" || HOOK_RC=$?
  fi
}

# Make origin/main == HEAD so the commit-range passes do not run. Staged cases
# must fail or pass on the filesystem collector alone.
sync_to_base() {
  git -C "$1" push -q origin HEAD:main
  git -C "$1" fetch -q origin
}

git_calls_in() {
  grep -cE '(^| )git( |$)' "$1" || true
}

echo "== trufflehog pin self-test =="

# Case 1 — clean tree: both scopes scanned through the pinned binary, which stays pinned.
REPO="${TMP}/clean"
new_repo "$REPO"
printf 'staged\n' >"${REPO}/staged.txt"
git -C "$REPO" add staged.txt
LOG="${TMP}/clean.log"
: >"$LOG"
run_hook "$REPO" "$LOG"
calls="$(wc -l <"$LOG" | tr -d ' ')"
git_calls="$(grep -cE '(^| )git( |$)' "$LOG" || true)"
fs_calls="$(grep -cE '(^| )filesystem( |$)' "$LOG" || true)"
# Commit-range is filesystem on introduced patches (Roxabi/roxabi-boilerplate-cf#284); staged is filesystem too.
if [[ "$HOOK_RC" -eq 0 && "$calls" -eq 4 && "$git_calls" -eq 0 && "$fs_calls" -eq 4 ]]; then
  ok "first hook runs 2 commit-range + 2 staged filesystem scans, all accepted by the parser"
else
  ko "first hook: rc=$HOOK_RC calls=$calls git=$git_calls filesystem=$fs_calls (want 0/4/0/4)"
  echo "$HOOK_OUT" >&2
fi

got="$(sha256_of "${REPO}/.cache/trufflehog/${VERSION}/${TARGET}/trufflehog")"
if [[ "$got" == "$PINNED" ]]; then
  ok "cached binary still matches sha256_bin_${TARGET} after a scan"
else
  ko "cached binary changed during the scan (want ${PINNED}, got ${got})"
fi

run_hook "$REPO" "$LOG"
if [[ "$HOOK_RC" -eq 0 && "$HOOK_OUT" != *"re-fetching"* && "$HOOK_OUT" != *"fetching pinned"* ]]; then
  ok "second hook reuses the cached binary"
else
  ko "second hook re-fetched the pinned binary (rc=$HOOK_RC)"
  echo "$HOOK_OUT" >&2
fi

# staged_case <name> <marker> [extra staged file] [marker file]
# Stages <marker> in <marker file> (default leak.txt) after syncing HEAD to
# origin/main, so only the filesystem passes run.
staged_case() {
  local repo="${TMP}/$1"
  local marker_file="${4:-leak.txt}"
  new_repo "$repo"
  sync_to_base "$repo"
  printf 'key = %s\n' "$2" >"${repo}/${marker_file}"
  git -C "$repo" add -- "$marker_file"
  if [[ -n "${3:-}" ]]; then
    printf 'x\n' >"${repo}/$3"
    git -C "$repo" add -- "$3"
  fi
  : >"${TMP}/$1.log"
  run_hook "$repo" "${TMP}/$1.log"
}

# Case 2 — each filesystem pass keeps the scanner's exit status. HEAD == origin/main,
# so a commit-range pass cannot be what blocks.
for c in "verified:${VERIFIED}:--only-verified pass" "kitkey:${KIT_KEY}:--config (kit sk_) pass"; do
  IFS=: read -r name marker what <<<"$c"
  staged_case "finding-${name}" "$marker"
  git_calls="$(git_calls_in "${TMP}/finding-${name}.log")"
  if [[ "$HOOK_RC" -eq 183 && "$HOOK_OUT" == *"secret(s) found"* && "$git_calls" -eq 0 ]]; then
    ok "staged finding of the ${what} blocks the hook with exit 183"
  else
    ko "staged finding of the ${what} did not block (rc=$HOOK_RC git=$git_calls, want 183/0)"
    echo "$HOOK_OUT" >&2
  fi
done

# Case 3 — a flag-shaped name stays a path, and a leading-dash name is still scanned.
for c in "verified:${VERIFIED}:--only-verified pass" "kitkey:${KIT_KEY}:--config (kit sk_) pass"; do
  IFS=: read -r name marker what <<<"$c"
  staged_case "flagname-${name}" "$marker" "--include-detectors=AWS" "-lead.txt"
  git_calls="$(git_calls_in "${TMP}/flagname-${name}.log")"
  if [[ "$HOOK_RC" -eq 183 && "$git_calls" -eq 0 ]]; then
    ok "flag-shaped and -lead.txt names do not hide the ${what}"
  else
    ko "a flag-shaped or leading-dash staged name hid the ${what} (rc=$HOOK_RC git=$git_calls, want 183/0)"
    echo "$HOOK_OUT" >&2
  fi
done

# Case 4 — a cache that no longer matches the pin re-fetches, and in this harness the fetch
# fails at once through the stubs instead of reaching the network.
REPO="${TMP}/drifted"
new_repo "$REPO"
sed -i.bak "s/^sha256_bin_${TARGET}=.*/sha256_bin_${TARGET}=$(printf '%064d' 1)/" "${REPO}/config/kit/trufflehog.version"
run_hook "$REPO" "${TMP}/drifted.log"
if [[ "$HOOK_RC" -ne 0 && "$HOOK_OUT" == *"re-fetching"* && "$HOOK_OUT" == *"network disabled in self-test"* ]]; then
  ok "a drifted cache fails fast on the offline download stub"
else
  ko "a drifted cache did not fail on the offline stub (rc=$HOOK_RC)"
  echo "$HOOK_OUT" >&2
fi

# Case 5 — each commit-range pass blocks on a finding that exists only in an
# ahead commit (nothing staged). The filesystem passes must not be what fails (Roxabi/roxabi-boilerplate-cf#266).
for c in "verified:${VERIFIED}:--only-verified pass" "kitkey:${KIT_KEY}:--config (kit sk_) pass"; do
  IFS=: read -r name marker what <<<"$c"
  REPO="${TMP}/commit-${name}"
  new_repo "$REPO"
  printf 'key = %s\n' "$marker" >"${REPO}/leak.txt"
  git -C "$REPO" add -- leak.txt
  git -C "$REPO" commit -q -m "leak ${name}"
  git -C "$REPO" diff --cached --quiet
  run_hook "$REPO" "${TMP}/commit-${name}.log"
  if [[ "$HOOK_RC" -eq 183 ]]; then
    ok "commit-range finding of the ${what} blocks the hook with exit 183"
  else
    ko "commit-range finding of the ${what} did not block (rc=$HOOK_RC, want 183)"
    echo "$HOOK_OUT" >&2
  fi
done

# Case 6 — a newline inside a staged name is one path, and only the filesystem
# passes run (HEAD == origin/main). Splitting the NUL stream drops the file (Roxabi/roxabi-boilerplate-cf#265).
REPO="${TMP}/newline-name"
new_repo "$REPO"
sync_to_base "$REPO"
printf 'key = %s\n' "$KIT_KEY" >"${REPO}/$(printf 'nl\nleak.txt')"
git -C "$REPO" add -A
: >"${TMP}/newline-name.log"
run_hook "$REPO" "${TMP}/newline-name.log"
git_calls="$(git_calls_in "${TMP}/newline-name.log")"
if [[ "$HOOK_RC" -eq 183 && "$git_calls" -eq 0 ]]; then
  ok "a staged file whose name contains a newline is scanned (exit 183)"
else
  ko "newline-named staged file was not scanned (rc=$HOOK_RC git=$git_calls, want 183/0)"
  echo "$HOOK_OUT" >&2
fi

# Case 7 — a failing git diff --cached is a hard error, never an empty staged
# list (Roxabi/roxabi-boilerplate-cf#265). GIT_INDEX_FILE pointing at a directory fails the diff without
# depending on the test uid; rev-parse and rev-list still succeed. Do not match
# git's die() text: it is translated, so an English pin false-reds under fr_FR.
# The fail-open mutant exits 0 and prints "nothing in range" in every locale.
REPO="${TMP}/diff-fails"
new_repo "$REPO"
mkdir -p "${TMP}/not-an-index"
HOOK_GIT_INDEX_FILE="${TMP}/not-an-index"
run_hook "$REPO" "${TMP}/diff-fails.log"
unset HOOK_GIT_INDEX_FILE
if [[ "$HOOK_RC" -ne 0 && "$HOOK_OUT" != *"nothing in range"* ]]; then
  ok "a failing git diff --cached is a hard error, not an empty staged list"
else
  ko "a failing git diff --cached was swallowed (rc=$HOOK_RC)"
  echo "$HOOK_OUT" >&2
fi

# Case 8 — a failing git rev-list is a hard error, not "zero commits ahead" (Roxabi/roxabi-boilerplate-cf#265).
REAL_GIT="$(command -v git)"
WRAP="${TMP}/git-wrap"
mkdir -p "$WRAP"
cat >"${WRAP}/git" <<EOF
#!/bin/sh
if [ "\$1" = rev-list ]; then
  echo "fatal: git rev-list failed (self-test)" >&2
  exit 128
fi
exec ${REAL_GIT} "\$@"
EOF
chmod +x "${WRAP}/git"
REPO="${TMP}/rev-list-fails"
new_repo "$REPO"
run_hook "$REPO" "${TMP}/rev-list-fails.log" "$WRAP"
if [[ "$HOOK_RC" -ne 0 && "$HOOK_OUT" == *"git rev-list failed"* && "$HOOK_OUT" != *"nothing in range"* ]]; then
  ok "a failing git rev-list is a hard error, not zero commits"
else
  ko "a failing git rev-list was swallowed (rc=$HOOK_RC)"
  echo "$HOOK_OUT" >&2
fi

REAL_GIT="$(command -v git)"

# Case 9 — merge-base rc ≥128 is a hard error, not a substituted since (Roxabi/roxabi-boilerplate-cf#265).
WRAP="${TMP}/git-wrap-mb"
mkdir -p "$WRAP"
cat >"${WRAP}/git" <<EOF
#!/bin/sh
if [ "\$1" = merge-base ]; then
  echo "fatal: git merge-base failed (self-test)" >&2
  exit 128
fi
exec ${REAL_GIT} "\$@"
EOF
chmod +x "${WRAP}/git"
REPO="${TMP}/mb-fails"
new_repo "$REPO"
run_hook "$REPO" "${TMP}/mb-fails.log" "$WRAP"
if [[ "$HOOK_RC" -ne 0 && "$HOOK_OUT" == *"git merge-base failed"* && "$HOOK_OUT" != *"nothing in range"* ]]; then
  ok "a failing git merge-base is a hard error, not a substituted since"
else
  ko "a failing git merge-base was swallowed (rc=$HOOK_RC)"
  echo "$HOOK_OUT" >&2
fi

# Case 10 — merge-base rc 1 (no common ancestor) is a full scan: drop --since-commit.
WRAP="${TMP}/git-wrap-mb1"
mkdir -p "$WRAP"
cat >"${WRAP}/git" <<EOF
#!/bin/sh
if [ "\$1" = merge-base ]; then
  exit 1
fi
exec ${REAL_GIT} "\$@"
EOF
chmod +x "${WRAP}/git"
REPO="${TMP}/mb-absent"
new_repo "$REPO"
: >"${TMP}/mb-absent.log"
run_hook "$REPO" "${TMP}/mb-absent.log" "$WRAP"
git_calls="$(git_calls_in "${TMP}/mb-absent.log")"
fs_calls="$(grep -cE '(^| )filesystem( |$)' "${TMP}/mb-absent.log" || true)"
if [[ "$HOOK_RC" -eq 0 && "$git_calls" -eq 0 && "$fs_calls" -ge 1 && "$HOOK_OUT" != *"nothing in range"* ]] \
  && ! grep -q -- '--since-commit' "${TMP}/mb-absent.log"; then
  ok "merge-base rc 1 scans introduced patches without --since-commit"
else
  ko "merge-base rc 1 did not scan patches without --since-commit (rc=$HOOK_RC git=$git_calls fs=$fs_calls)"
  echo "$HOOK_OUT" >&2
  echo "log:" >&2
  cat "${TMP}/mb-absent.log" >&2 || true
fi

# Case 11 — rev-parse --verify rc other than 0/1 is a hard error, not "no base ref".
WRAP="${TMP}/git-wrap-verify"
mkdir -p "$WRAP"
cat >"${WRAP}/git" <<EOF
#!/bin/sh
if [ "\$1" = rev-parse ]; then
  for a in "\$@"; do
    if [ "\$a" = --verify ]; then
      echo "fatal: git rev-parse --verify failed (self-test)" >&2
      exit 128
    fi
  done
fi
exec ${REAL_GIT} "\$@"
EOF
chmod +x "${WRAP}/git"
REPO="${TMP}/verify-fails"
new_repo "$REPO"
run_hook "$REPO" "${TMP}/verify-fails.log" "$WRAP"
if [[ "$HOOK_RC" -ne 0 && "$HOOK_OUT" == *"git rev-parse --verify failed"* && "$HOOK_OUT" != *"nothing in range"* ]]; then
  ok "a failing git rev-parse --verify is a hard error, not an absent ref"
else
  ko "a failing git rev-parse --verify was treated as no base (rc=$HOOK_RC)"
  echo "$HOOK_OUT" >&2
fi

# Case 12 — staged type-change (symlink → file) is content about to be committed.
REPO="${TMP}/type-change"
new_repo "$REPO"
sync_to_base "$REPO"
ln -s ahead.txt "${REPO}/link.txt"
git -C "$REPO" add -- link.txt
git -C "$REPO" commit -q -m link
sync_to_base "$REPO"
rm -f "${REPO}/link.txt"
printf 'key = %s\n' "$KIT_KEY" >"${REPO}/link.txt"
git -C "$REPO" add -- link.txt
: >"${TMP}/type-change.log"
run_hook "$REPO" "${TMP}/type-change.log"
git_calls="$(git_calls_in "${TMP}/type-change.log")"
if [[ "$HOOK_RC" -eq 183 && "$git_calls" -eq 0 ]]; then
  ok "a staged symlink-to-file type change is scanned (exit 183)"
else
  ko "staged type-change was not scanned (rc=$HOOK_RC git=$git_calls, want 183/0)"
  echo "$HOOK_OUT" >&2
fi

# Case 13 — a staged rename is content about to be committed.
REPO="${TMP}/rename"
new_repo "$REPO"
sync_to_base "$REPO"
printf 'key = %s\n' "$KIT_KEY" >"${REPO}/old-name.txt"
git -C "$REPO" add -- old-name.txt
git -C "$REPO" commit -q -m named
sync_to_base "$REPO"
git -C "$REPO" mv old-name.txt new-name.txt
: >"${TMP}/rename.log"
run_hook "$REPO" "${TMP}/rename.log"
git_calls="$(git_calls_in "${TMP}/rename.log")"
if [[ "$HOOK_RC" -eq 183 && "$git_calls" -eq 0 ]]; then
  ok "a staged rename is scanned (exit 183)"
else
  ko "staged rename was not scanned (rc=$HOOK_RC git=$git_calls, want 183/0)"
  echo "$HOOK_OUT" >&2
fi


# Case 14 — merge-in-base: a secret landed on the branch, then origin/main advanced
# and was merged in. TruffleHog's --since-commit walk stops at the new base tip and
# never reaches the older branch commit (Roxabi/roxabi-boilerplate-cf#284). The gate must still exit 183.
for c in "verified:${VERIFIED}:--only-verified pass" "kitkey:${KIT_KEY}:--config (kit sk_) pass"; do
  IFS=: read -r name marker what <<<"$c"
  REPO="${TMP}/merge-base-${name}"
  new_repo "$REPO"
  # Branch secret at T1 (after new_repo's ahead commit).
  printf 'key = %s\n' "$marker" >"${REPO}/leak.txt"
  git -C "$REPO" add -- leak.txt
  GIT_AUTHOR_DATE='2020-01-01T10:00:00' GIT_COMMITTER_DATE='2020-01-01T10:00:00' \
    git -C "$REPO" commit -q -m "leak ${name}"
  # Advance origin/main at T2 and merge it into the branch at T3.
  git -C "$REPO" fetch -q origin
  git -C "$REPO" checkout -q -B main-advance origin/main
  printf 'main-moved\n' >"${REPO}/main-moved.txt"
  git -C "$REPO" add -- main-moved.txt
  GIT_AUTHOR_DATE='2020-01-01T11:00:00' GIT_COMMITTER_DATE='2020-01-01T11:00:00' \
    git -C "$REPO" commit -q -m main-moved
  git -C "$REPO" push -q origin HEAD:main
  git -C "$REPO" checkout -q -
  git -C "$REPO" fetch -q origin
  GIT_AUTHOR_DATE='2020-01-01T12:00:00' GIT_COMMITTER_DATE='2020-01-01T12:00:00' \
    git -C "$REPO" merge -q origin/main -m merge-base
  git -C "$REPO" diff --cached --quiet
  : >"${TMP}/merge-base-${name}.log"
  run_hook "$REPO" "${TMP}/merge-base-${name}.log"
  if [[ "$HOOK_RC" -eq 183 ]]; then
    ok "merge-in-base still catches the ${what} (exit 183)"
  else
    ko "merge-in-base missed the ${what} (rc=$HOOK_RC, want 183)"
    echo "$HOOK_OUT" >&2
    echo "log:" >&2
    cat "${TMP}/merge-base-${name}.log" >&2 || true
  fi
done

# Case 15 — CI path: THOG_RANGE_BASE=<sha> + --commits-only must merge-base on
# the SHA, not the literal label "THOG_RANGE_BASE" (would exit 128 and skip the
# scan). Mirrors .github/workflows/secret-scan.yml (Roxabi/roxabi-boilerplate-cf#284 review).
for c in "verified:${VERIFIED}:--only-verified pass" "kitkey:${KIT_KEY}:--config (kit sk_) pass"; do
  IFS=: read -r name marker what <<<"$c"
  REPO="${TMP}/ci-range-${name}"
  new_repo "$REPO"
  printf 'key = %s\n' "$marker" >"${REPO}/ci-leak.txt"
  git -C "$REPO" add -- ci-leak.txt
  git -C "$REPO" commit -q -m "ci-leak ${name}"
  base_sha="$(git -C "$REPO" rev-parse origin/main)"
  head_sha="$(git -C "$REPO" rev-parse HEAD)"
  : >"${TMP}/ci-range-${name}.log"
  HOOK_RC=0
  HOOK_OUT="$(
    cd "$REPO" &&
      PATH="${NONET}:${PATH}" \
        THOG_FAKE_LOG="${TMP}/ci-range-${name}.log" \
        THOG_RANGE_BASE="$base_sha" \
        THOG_RANGE_HEAD="$head_sha" \
        bash scripts/kit/trufflehog-check.sh --commits-only 2>&1
  )" || HOOK_RC=$?
  if [[ "$HOOK_RC" -eq 183 && "$HOOK_OUT" != *"Not a valid object name THOG_RANGE_BASE"* ]]; then
    ok "CI THOG_RANGE_BASE sha still catches the ${what} (exit 183)"
  else
    ko "CI THOG_RANGE_BASE sha missed the ${what} (rc=$HOOK_RC, want 183)"
    echo "$HOOK_OUT" >&2
    echo "log:" >&2
    cat "${TMP}/ci-range-${name}.log" >&2 || true
  fi
done


# Case 16 — real git init, no commit. new_repo() always commits, so it cannot see
# the unborn HEAD that exits 128 before the index scan (Roxabi/roxabi-boilerplate-cf#510).
unborn_repo() {
  local repo="$1" t
  git init -q -b main "$repo"
  git -C "$repo" config user.email kit@example.com
  git -C "$repo" config user.name kit
  git -C "$repo" config commit.gpgsign false
  mkdir -p "${repo}/scripts/kit" "${repo}/config/kit" "${repo}/.github/workflows"
  cp "$SCRIPT" "${repo}/scripts/kit/trufflehog-check.sh"
  cp "${ROOT}/scripts/kit/trufflehog-exclude-paths.txt" "${repo}/scripts/kit/"
  cp "${ROOT}/scripts/kit/trufflehog-detectors.yaml" "${repo}/scripts/kit/"
  printf '.cache/\n' >"${repo}/.gitignore"
  cat >"${repo}/.github/workflows/secret-scan.yml" <<EOF
# pinned binary v${VERSION} via config/kit/trufflehog.version (Roxabi/roxabi-boilerplate-cf#284 — no action uses)
name: Secret scan
jobs:
  trufflehog:
    steps:
      - run: bash scripts/kit/trufflehog-check.sh --commits-only
EOF
  {
    printf 'version=%s\n' "$VERSION"
    printf 'action_sha=%s\n' "$ACTION_SHA"
    for t in linux_amd64 linux_arm64 darwin_amd64 darwin_arm64; do
      printf 'sha256_%s=%064d\n' "$t" 0
      printf 'sha256_bin_%s=%s\n' "$t" "$PINNED"
    done
  } >"${repo}/config/kit/trufflehog.version"
  mkdir -p "${repo}/.cache/trufflehog/${VERSION}/${TARGET}"
  cp "$STUB" "${repo}/.cache/trufflehog/${VERSION}/${TARGET}/trufflehog"
}

unborn_fs() {
  grep -cE '(^| )filesystem( |$)' "$1" || true
}

REPO="${TMP}/unborn-clean"
unborn_repo "$REPO"
printf 'staged\n' >"${REPO}/staged.txt"
git -C "$REPO" add -A
: >"${TMP}/unborn-clean.log"
run_hook "$REPO" "${TMP}/unborn-clean.log"
fs_calls="$(unborn_fs "${TMP}/unborn-clean.log")"
if [[ "$HOOK_RC" -eq 0 && "$fs_calls" -eq 2 && "$HOOK_OUT" == *"scanning"* && "$HOOK_OUT" != *"ambiguous argument"* && "$HOOK_OUT" != *"nothing in range"* ]]; then
  ok "ordinary unborn HEAD scans both staged passes and allows a clean index"
else
  ko "ordinary unborn HEAD did not allow a clean staged index (rc=$HOOK_RC fs=$fs_calls, want 0/2)"
  echo "$HOOK_OUT" >&2
fi

for c in "verified:${VERIFIED}:--only-verified pass" "kitkey:${KIT_KEY}:--config (kit sk_) pass"; do
  IFS=: read -r name marker what <<<"$c"
  REPO="${TMP}/unborn-finding-${name}"
  unborn_repo "$REPO"
  printf 'key = %s\n' "$marker" >"${REPO}/leak.txt"
  git -C "$REPO" add -A
  : >"${TMP}/unborn-finding-${name}.log"
  run_hook "$REPO" "${TMP}/unborn-finding-${name}.log"
  fs_calls="$(unborn_fs "${TMP}/unborn-finding-${name}.log")"
  if [[ "$HOOK_RC" -eq 183 && "$fs_calls" -eq 2 && "$HOOK_OUT" == *"secret(s) found"* ]]; then
    ok "unborn HEAD staged finding of the ${what} blocks after both passes (exit 183)"
  else
    ko "unborn HEAD staged finding of the ${what} did not block both passes (rc=$HOOK_RC fs=$fs_calls, want 183/2)"
    echo "$HOOK_OUT" >&2
  fi
done

fail_unborn_range() {
  local name="$1"
  shift
  REPO="${TMP}/unborn-${name}"
  unborn_repo "$REPO"
  printf 'staged\n' >"${REPO}/staged.txt"
  git -C "$REPO" add -A
  : >"${TMP}/unborn-${name}.log"
  HOOK_RC=0
  HOOK_OUT="$(
    cd "$REPO" &&
      PATH="${NONET}:${PATH}" THOG_FAKE_LOG="${TMP}/unborn-${name}.log" \
        "$@" \
        bash scripts/kit/trufflehog-check.sh 2>&1
  )" || HOOK_RC=$?
  fs_calls="$(unborn_fs "${TMP}/unborn-${name}.log")"
  if [[ "$HOOK_RC" -ne 0 && "$fs_calls" -eq 0 && "$HOOK_OUT" != *"nothing in range"* && "$HOOK_OUT" != *"scanning"* ]]; then
    ok "unborn HEAD ${name} fails closed before the staged scan"
  else
    ko "unborn HEAD ${name} did not fail closed (rc=$HOOK_RC fs=$fs_calls)"
    echo "$HOOK_OUT" >&2
  fi
}

fail_unborn_range explicit-head env THOG_RANGE_HEAD=0123456789abcdef0123456789abcdef01234567
fail_unborn_range explicit-base env THOG_RANGE_BASE=

REPO="${TMP}/unborn-commits-only"
unborn_repo "$REPO"
printf 'staged\n' >"${REPO}/staged.txt"
git -C "$REPO" add -A
: >"${TMP}/unborn-commits-only.log"
HOOK_RC=0
HOOK_OUT="$(
  cd "$REPO" &&
    PATH="${NONET}:${PATH}" THOG_FAKE_LOG="${TMP}/unborn-commits-only.log" \
      bash scripts/kit/trufflehog-check.sh --commits-only 2>&1
)" || HOOK_RC=$?
fs_calls="$(unborn_fs "${TMP}/unborn-commits-only.log")"
if [[ "$HOOK_RC" -ne 0 && "$fs_calls" -eq 0 && "$HOOK_OUT" != *"nothing in range"* && "$HOOK_OUT" != *"scanning"* ]]; then
  ok "unborn HEAD --commits-only fails closed before the staged scan"
else
  ko "unborn HEAD --commits-only did not fail closed (rc=$HOOK_RC fs=$fs_calls)"
  echo "$HOOK_OUT" >&2
fi

REPO="${TMP}/unborn-detached"
unborn_repo "$REPO"
printf 'staged\n' >"${REPO}/staged.txt"
git -C "$REPO" add -A
printf '0123456789abcdef0123456789abcdef01234567\n' >"$(git -C "$REPO" rev-parse --absolute-git-dir)/HEAD"
: >"${TMP}/unborn-detached.log"
run_hook "$REPO" "${TMP}/unborn-detached.log"
fs_calls="$(unborn_fs "${TMP}/unborn-detached.log")"
if [[ "$HOOK_RC" -ne 0 && "$fs_calls" -eq 0 && "$HOOK_OUT" != *"nothing in range"* && "$HOOK_OUT" != *"scanning"* ]]; then
  ok "detached missing HEAD fails closed before the staged scan"
else
  ko "detached missing HEAD did not fail closed (rc=$HOOK_RC fs=$fs_calls)"
  echo "$HOOK_OUT" >&2
fi

REPO="${TMP}/unborn-corrupt-ref"
unborn_repo "$REPO"
printf 'staged\n' >"${REPO}/staged.txt"
git -C "$REPO" add -A
printf 'not-an-oid\n' >"$(git -C "$REPO" rev-parse --absolute-git-dir)/refs/heads/main"
: >"${TMP}/unborn-corrupt-ref.log"
run_hook "$REPO" "${TMP}/unborn-corrupt-ref.log"
fs_calls="$(unborn_fs "${TMP}/unborn-corrupt-ref.log")"
if [[ "$HOOK_RC" -ne 0 && "$fs_calls" -eq 0 && "$HOOK_OUT" != *"nothing in range"* && "$HOOK_OUT" != *"scanning"* ]]; then
  ok "corrupt symbolic branch ref fails closed before the staged scan"
else
  ko "corrupt symbolic branch ref was treated as unborn (rc=$HOOK_RC fs=$fs_calls)"
  echo "$HOOK_OUT" >&2
fi
echo "trufflehog pin self-test: ${PASS} passed, ${FAIL} failed"
[[ "$FAIL" -eq 0 ]]
