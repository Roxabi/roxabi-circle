#!/usr/bin/env bash
# Cap folder density — max N .ts/.tsx files per directory under apps|packages.
# Kit register: config/kit/folder_exemptions.txt
# Product register: config/product/folder_exemptions.txt (optional; apps/<product>-{api,web,mcp}/ only)
# Config: config/kit/qg.conf (QG_FOLDER_*).
#
# Opt-out (explicit only — a missing directory is never a pass):
#   QG_FOLDER_SIZE_DISABLE=1   this repository is not subject to the folder-size gate.
#   Accepted values: 1, true, yes (case-insensitive). Unset, empty, or 0 = gate applies.
#   Set it in the environment, or in config/kit/qg.conf so a non-empty export still wins:
#     : "${QG_FOLDER_SIZE_DISABLE:=1}"
#   Every entry in QG_FOLDER_ROOTS (default: apps packages) must be an existing directory.
#   Without either, a missing root is a hard failure that names the path and this opt-out.
#
# --self-test  Prove the gate can fail. Uses a temp git repo and exits 0 only if a
#   missing scan root and a folder over the cap each exit 1. Never touches the work tree.
set -euo pipefail

LIB_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Prove the gate can fail. Isolated temp git repo; the child cds there, so the
# real work tree and its qg.conf are never read or written.
self_test() {
  local tmp rc=0 i
  tmp=$(mktemp -d)
  trap 'rm -rf "$tmp"' RETURN
  env -u GIT_DIR -u GIT_WORK_TREE -u GIT_INDEX_FILE -u GIT_COMMON_DIR git -C "$tmp" init -q

  rc=0
  (
    cd "$tmp" && \
    env -u GIT_DIR -u GIT_WORK_TREE -u GIT_INDEX_FILE -u GIT_COMMON_DIR \
        -u QG_FOLDER_SIZE_DISABLE \
        -u QG_FOLDER_MAX -u QG_FOLDER_EXEMPTIONS -u QG_FOLDER_ROOTS -u QG_FOLDER_PRODUCT_EXEMPTIONS \
        "$LIB_DIR/check_folder_size.sh"
  ) || rc=$?
  if [ "$rc" -ne 1 ]; then
    echo "ERROR: check_folder_size --self-test: expected exit 1 on a missing scan root, got $rc" >&2
    exit 1
  fi

  rc=0
  (
    cd "$tmp" && \
    env -u GIT_DIR -u GIT_WORK_TREE -u GIT_INDEX_FILE -u GIT_COMMON_DIR \
        -u QG_FOLDER_MAX -u QG_FOLDER_EXEMPTIONS -u QG_FOLDER_ROOTS -u QG_FOLDER_PRODUCT_EXEMPTIONS \
        QG_FOLDER_SIZE_DISABLE=1 \
        "$LIB_DIR/check_folder_size.sh"
  ) || rc=$?
  if [ "$rc" -ne 0 ]; then
    echo "ERROR: check_folder_size --self-test: expected exit 0 when QG_FOLDER_SIZE_DISABLE=1, got $rc" >&2
    exit 1
  fi

  mkdir -p "$tmp/apps/acme-web/src/ui" "$tmp/packages"
  for i in 1 2 3; do
    echo "export const n${i} = ${i}" >"$tmp/apps/acme-web/src/ui/f${i}.ts"
  done
  rc=0
  (
    cd "$tmp" && \
    env -u GIT_DIR -u GIT_WORK_TREE -u GIT_INDEX_FILE -u GIT_COMMON_DIR \
        -u QG_FOLDER_SIZE_DISABLE \
        QG_FOLDER_MAX=2 \
        QG_FOLDER_ROOTS="apps packages" \
        "$LIB_DIR/check_folder_size.sh"
  ) || rc=$?
  if [ "$rc" -ne 1 ]; then
    echo "ERROR: check_folder_size --self-test: expected exit 1 on a folder over the cap, got $rc" >&2
    exit 1
  fi
  exit 0
}

for _arg in "$@"; do
  if [ "$_arg" = "--self-test" ]; then
    self_test
  fi
done

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

# Missing scan root is a hard failure unless the operator opted out. See header.
# Kit scans every root in QG_FOLDER_ROOTS (default: apps packages).
if [ -z "$ROOTS" ]; then
  FIND_ROOT=""
  require_scan_root QG_FOLDER_SIZE_DISABLE QG_FOLDER_ROOTS check_folder_size
fi
for root in $ROOTS; do
  FIND_ROOT="$root"
  require_scan_root QG_FOLDER_SIZE_DISABLE QG_FOLDER_ROOTS check_folder_size
done

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
