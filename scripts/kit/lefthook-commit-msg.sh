#!/usr/bin/env bash
# Pin commitlint's config and keep cosmiconfig's construction-time meta search off the product cwd
# (Roxabi/roxabi-boilerplate-cf#429). --cwd supplies extends. GIT_DIR and GIT_WORK_TREE keep
# commitlint's core.commentChar lookup on the checkout: that lookup ignores --cwd.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd -P)"
case "$1" in
  /*) MESSAGE="$1" ;;
  *) MESSAGE="$PWD/$1" ;;
esac
TMP="$(mktemp -d -t kit-commit-msg.XXXXXX)"
trap 'rm -rf "$TMP"' EXIT
BIN="$ROOT/node_modules/.bin/commitlint"
[[ -x "$BIN" ]] || { printf '%s\n' 'commitlint is not installed (run bun install)' >&2; exit 1; }
export GIT_DIR="$(git -C "$ROOT" rev-parse --absolute-git-dir)"
export GIT_WORK_TREE="$ROOT"
cd "$TMP"
"$BIN" --cwd "$ROOT" --config "$ROOT/commitlint.config.cjs" --edit "$MESSAGE"
