#!/usr/bin/env bash
# Pre-commit biome: format ACMR staged files only.
# leftover `stage_fixed: true` + `biome --staged` re-adds deleted paths (#148).
# This script never `git add`s a D — deletions stay staged as deletions.
set -euo pipefail

mapfile -d '' -t files < <(git diff --cached --name-only --diff-filter=ACMR -z)
if [ "${#files[@]}" -eq 0 ]; then
  exit 0
fi

bunx biome check --write --no-errors-on-unmatched --files-ignore-unknown=true -- "${files[@]}"
git add -- "${files[@]}"
