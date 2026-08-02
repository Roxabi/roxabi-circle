#!/usr/bin/env bash
# Cap folder density — max N .ts/.tsx files per directory under apps|packages.
# Forces early splits; shadcn-heavy dirs use tools/folder_exemptions.txt.
# Exemption lines may declare a local cap: "# <N> files".
# Config: tools/qg.conf (QG_FOLDER_*).
set -euo pipefail

LIB_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$(git rev-parse --show-toplevel)"

# shellcheck disable=SC1091
[ -f tools/qg.conf ] && . tools/qg.conf

MAX="${QG_FOLDER_MAX:-40}"
ROOTS="${QG_FOLDER_ROOTS:-apps packages}"
EXEMPT_FILE="${QG_FOLDER_EXEMPTIONS:-tools/folder_exemptions.txt}"
QG_EXEMPT_UNIT="files"
FAIL=0

# shellcheck source=check_lib.sh
. "$LIB_DIR/check_lib.sh"

assert_exempt_no_spaces

is_skip_dir() {
  case "$1" in
    node_modules | dist | coverage | .wrangler | .git | .turbo | build | generated) return 0 ;;
    *) return 1 ;;
  esac
}

count_ts_files() {
  local d="$1"
  local n=0
  local f
  # maxdepth 1 only — direct children files
  shopt -s nullglob
  for f in "$d"/*.ts "$d"/*.tsx; do
    [ -f "$f" ] || continue
    case "$f" in
      *.d.ts) continue ;;
    esac
    n=$((n + 1))
  done
  shopt -u nullglob
  echo "$n"
}

scan_dir_tree() {
  local root="$1"
  [ -d "$root" ] || return 0
  local d count cap
  while IFS= read -r -d '' d; do
    base="$(basename "$d")"
    if is_skip_dir "$base"; then
      continue
    fi
    # prune known noise by path segment
    case "$d" in
      */node_modules/* | */dist/* | */coverage/* | */.wrangler/*) continue ;;
    esac

    count="$(count_ts_files "$d")"
    if is_exempt "$d"; then
      cap="$(exempt_cap "$d" || true)"
      if [ -n "$cap" ] && [ "$count" -gt "$cap" ]; then
        echo "$d - $count files (exceeds declared exemption cap of $cap — refactor or update tools/folder_exemptions.txt)" >&2
        FAIL=1
      fi
      continue
    fi
    if [ "$count" -gt "$MAX" ]; then
      echo "$d - $count files (max $MAX)" >&2
      FAIL=1
    fi
  done < <(
    find "$root" -type d \
      ! -path '*/node_modules/*' \
      ! -path '*/dist/*' \
      ! -path '*/coverage/*' \
      ! -path '*/.wrangler/*' \
      ! -path '*/.turbo/*' \
      -print0
  )
}

for root in $ROOTS; do
  scan_dir_tree "$root"
done

if [ "$FAIL" -eq 0 ]; then
  echo "check_folder_size: all folders ≤ ${MAX} .ts/.tsx files (or exempt) — OK"
fi

exit "$FAIL"
