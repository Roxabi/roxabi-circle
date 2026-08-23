#!/usr/bin/env bash
# Snapshot the index before leftover mutates it (#148).
set -euo pipefail
git write-tree >"$(git rev-parse --git-dir)/lefthook-index-tree"
