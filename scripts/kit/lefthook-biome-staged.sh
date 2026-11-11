#!/usr/bin/env bash
# Pre-commit biome: format ACMR staged files only.
# leftover `stage_fixed: true` + `biome --staged` re-adds deleted paths (Roxabi/roxabi-boilerplate-cf#148).
# This script never `git add`s a D — deletions stay staged as deletions.
set -euo pipefail

staged_list=$(mktemp)
trap 'rm -f "$staged_list"' EXIT
# Bare redirect, not a process substitution: under set -e the substitution's
# git status does not fail the script, so a broken index reads as "nothing staged".
git diff --cached --name-only --diff-filter=ACMR -z >"$staged_list"
mapfile -d '' -t files <"$staged_list"
if [ "${#files[@]}" -gt 0 ] && [ -z "${files[-1]:-}" ]; then
  unset 'files[-1]'
fi
if [ "${#files[@]}" -eq 0 ]; then
  exit 0
fi

bunx biome check --write --no-errors-on-unmatched --files-ignore-unknown=true -- "${files[@]}"
git add -- "${files[@]}"
