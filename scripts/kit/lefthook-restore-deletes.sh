#!/usr/bin/env bash
# Restore the pre-leftover index, then format ACMR only (#148).
set -euo pipefail
gd="$(git rev-parse --git-dir)"
tree_file="${gd}/lefthook-index-tree"
here="$(cd "$(dirname "$0")" && pwd)"
if [ -f "$tree_file" ]; then
  tree="$(cat "$tree_file")"
  rm -f "$tree_file"
  [ -n "$tree" ] && git read-tree "$tree"
fi
bash "${here}/lefthook-biome-staged.sh"
