#!/usr/bin/env bash
# Put back the pre-leftover index (#148). No biome here — caller decides.
set -euo pipefail
gd="$(git rev-parse --git-dir)"
tree_file="${gd}/lefthook-index-tree"
[ -f "$tree_file" ] || exit 0
tree="$(cat "$tree_file")"
rm -f "$tree_file"
[ -n "$tree" ] || exit 0
git read-tree "$tree"
