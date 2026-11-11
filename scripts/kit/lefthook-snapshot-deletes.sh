#!/usr/bin/env bash
# Snapshot the index before leftover mutates it (Roxabi/roxabi-boilerplate-cf#148).
set -euo pipefail
git write-tree >"$(git rev-parse --git-dir)/lefthook-index-tree"
