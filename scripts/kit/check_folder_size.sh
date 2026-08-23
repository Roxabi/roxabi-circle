#!/usr/bin/env bash
# Cap folder density — max N .ts/.tsx files per directory under apps|packages.
# Kit register: config/kit/folder_exemptions.txt
# Product register: config/product/folder_exemptions.txt (optional; apps/<product>-{api,web,mcp}/ only)
# Config: config/kit/qg.conf (QG_FOLDER_*).
set -euo pipefail

LIB_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$(git rev-parse --show-toplevel)"

KIT_EXEMPT_DEFAULT="config/kit/folder_exemptions.txt"
PRODUCT_EXEMPT_DEFAULT="config/product/folder_exemptions.txt"

# shellcheck disable=SC1091
[ -f config/kit/qg.conf ] && . config/kit/qg.conf

MAX="${QG_FOLDER_MAX:-40}"
ROOTS="${QG_FOLDER_ROOTS:-apps packages}"
KIT_FILE="${QG_FOLDER_EXEMPTIONS:-$KIT_EXEMPT_DEFAULT}"
PRODUCT_FILE="${QG_FOLDER_PRODUCT_EXEMPTIONS:-$PRODUCT_EXEMPT_DEFAULT}"
QG_EXEMPT_UNIT="files"
FAIL=0
MERGED=""
PRODUCT_APPLY=""

# shellcheck source=check_lib.sh
. "$LIB_DIR/check_lib.sh"
# shellcheck source=product_exempt.sh
. "$LIB_DIR/product_exempt.sh"

cleanup_temps() {
  [ -n "${MERGED:-}" ] && rm -f "$MERGED"
  [ -n "${PRODUCT_APPLY:-}" ] && rm -f "$PRODUCT_APPLY"
}
trap cleanup_temps EXIT

load_product_apply() {
  PRODUCT_APPLY="$(mktemp)"
  : >"$PRODUCT_APPLY"
  if [ -f "$PRODUCT_FILE" ]; then
    cat "$PRODUCT_FILE" >"$PRODUCT_APPLY"
  fi
}

is_product_apply_path() {
  [ -n "${PRODUCT_APPLY:-}" ] && [ -f "$PRODUCT_APPLY" ] || return 1
  P="$1" awk '$1 == ENVIRON["P"] { found = 1 } END { exit !found }' "$PRODUCT_APPLY"
}

merge_registers() {
  MERGED="$(mktemp)"
  if [ -f "$KIT_FILE" ]; then
    cat "$KIT_FILE" >"$MERGED"
  else
    : >"$MERGED"
  fi
  if [ -s "$PRODUCT_APPLY" ]; then
    cat "$PRODUCT_APPLY" >>"$MERGED"
  fi
  EXEMPT_FILE="$MERGED"
}

if [ -f "$PRODUCT_FILE" ]; then
  validate_product_file "$PRODUCT_FILE" "$PRODUCT_FILE"
fi

load_product_apply

if [ "$FAIL" -ne 0 ]; then
  exit "$FAIL"
fi

merge_registers
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
  local d count cap register
  while IFS= read -r -d '' d; do
    base="$(basename "$d")"
    if is_skip_dir "$base"; then
      continue
    fi
    case "$d" in
      */node_modules/* | */dist/* | */coverage/* | */.wrangler/*) continue ;;
    esac

    count="$(count_ts_files "$d")"
    if is_exempt "$d"; then
      cap="$(exempt_cap "$d" || true)"
      if [ -n "$cap" ] && [ "$count" -gt "$cap" ]; then
        register="$KIT_FILE"
        if is_product_apply_path "$d"; then
          register="$PRODUCT_FILE"
        fi
        echo "$d - $count files (exceeds declared exemption cap of $cap — refactor or update $register)" >&2
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
