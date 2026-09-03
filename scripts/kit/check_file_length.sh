#!/usr/bin/env bash
# Cap fichier — max 300 lignes (tests exclus).
# Kit register: config/kit/file_exemptions.txt
# Product register: config/product/file_exemptions.txt (optional; apps/<product>-{api,web,mcp}/ only)
# Modes : QG_FILE_MODE=staged (pre-commit) | tree (CI)
set -euo pipefail

LIB_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$(git rev-parse --show-toplevel)"

KIT_EXEMPT_DEFAULT="config/kit/file_exemptions.txt"
PRODUCT_EXEMPT_DEFAULT="config/product/file_exemptions.txt"

qg_override_set=0
[ -n "${QG_FILE_MAX+x}" ] && qg_override_set=1
[ -n "${QG_FILE_EXEMPTIONS+x}" ] && qg_override_set=1
[ -n "${QG_FILE_ROOTS+x}" ] && qg_override_set=1
[ -n "${QG_FILE_PRODUCT_EXEMPTIONS+x}" ] && qg_override_set=1

# shellcheck disable=SC1091
[ -f config/kit/qg.conf ] && . config/kit/qg.conf

if [ "$qg_override_set" -eq 1 ]; then
  if [ -z "${QG_FILE_HARNESS_SENTINEL:-}" ] || [ ! -f "$QG_FILE_HARNESS_SENTINEL" ]; then
    echo "ERROR: QG_FILE_* override requires QG_FILE_HARNESS_SENTINEL (harness only)" >&2
    exit 1
  fi
fi

MAX="${QG_FILE_MAX:-300}"
KIT_FILE="${QG_FILE_EXEMPTIONS:-$KIT_EXEMPT_DEFAULT}"
PRODUCT_FILE="${QG_FILE_PRODUCT_EXEMPTIONS:-$PRODUCT_EXEMPT_DEFAULT}"
MODE="${QG_FILE_MODE:-tree}"
ROOTS="${QG_FILE_ROOTS:-apps packages}"
QG_EXEMPT_UNIT="lines"
FAIL=0
MERGED=""
PRODUCT_APPLY=""
SEEN_FILE=""
KIT_PATHS=""

# shellcheck source=check_lib.sh
. "$LIB_DIR/check_lib.sh"

cleanup_temps() {
  [ -n "${MERGED:-}" ] && rm -f "$MERGED"
  [ -n "${PRODUCT_APPLY:-}" ] && rm -f "$PRODUCT_APPLY"
  [ -n "${SEEN_FILE:-}" ] && rm -f "$SEEN_FILE"
  [ -n "${KIT_PATHS:-}" ] && rm -f "$KIT_PATHS"
  return 0
}
trap cleanup_temps EXIT

product_path_canonical() {
  local p="$1" part
  case "$p" in
    /* | ./*) return 1 ;;
  esac
  local IFS=/
  # shellcheck disable=SC2086
  for part in $p; do
    [ -n "$part" ] || return 1
    [ "$part" != "." ] || return 1
    [ "$part" != ".." ] || return 1
  done
  return 0
}

product_app_ok() {
  local p="$1" first name part
  case "$p" in
    /* | ./*) return 1 ;;
  esac
  local IFS=/
  # shellcheck disable=SC2086
  for part in $p; do
    [ -n "$part" ] || return 1
    [ "$part" != "." ] || return 1
    [ "$part" != ".." ] || return 1
  done
  unset IFS
  case "$p" in
    apps/*-api/* | apps/*-web/* | apps/*-mcp/*) ;;
    *) return 1 ;;
  esac
  first="${p#apps/}"
  first="${first%%/*}"
  [ "$first" != "mcp-example" ] || return 1
  case "$first" in
    *-api) name="${first%-api}" ;;
    *-web) name="${first%-web}" ;;
    *-mcp) name="${first%-mcp}" ;;
    *) return 1 ;;
  esac
  [ -n "$name" ] || return 1
  [ "$name" != "example" ] || return 1
  return 0
}

product_path_has_glob() {
  case "$1" in
    *'*'* | *'?'* | *'['*) return 0 ;;
    *) return 1 ;;
  esac
}

line_has_cap() {
  printf '%s\n' "$1" | UNIT="$QG_EXEMPT_UNIT" awk '
    {
      if (match($0, "# *[0-9]+ *" ENVIRON["UNIT"])) exit 0
      exit 1
    }
  '
}

is_product_comment_or_blank() {
  local trimmed="${1#"${1%%[![:space:]]*}"}"
  case "$trimmed" in
    '' | \#*) return 0 ;;
    *) return 1 ;;
  esac
}

validate_product_file() {
  local src="$1"
  local display="${2:-$1}"
  [ -f "$src" ] || return 0

  if awk '/^[[:space:]]*#/ { next } NF > 2 && $2 !~ /^#/ { found = 1 } END { exit !found }' "$src"; then
    echo "ERROR: $display: exemption path contains spaces" >&2
    FAIL=1
    return
  fi

  local line path
  SEEN_FILE="$(mktemp)"
  KIT_PATHS="$(mktemp)"
  if [ -f "$KIT_FILE" ]; then
    awk '/^[[:space:]]*#/ || NF == 0 { next } { print $1 }' "$KIT_FILE" >"$KIT_PATHS"
  else
    : >"$KIT_PATHS"
  fi

  while IFS= read -r line || [ -n "$line" ]; do
    if is_product_comment_or_blank "$line"; then
      continue
    fi
    path="$(printf '%s\n' "$line" | awk '{ print $1 }')"
    if product_path_has_glob "$path"; then
      echo "ERROR: $display: $path — wildcard product exemption" >&2
      FAIL=1
      continue
    fi
    if ! product_path_canonical "$path"; then
      echo "ERROR: $display: $path — non-canonical" >&2
      FAIL=1
      continue
    fi
    if ! product_app_ok "$path"; then
      echo "ERROR: $display: $path — not a product-app path" >&2
      FAIL=1
      continue
    fi
    if ! line_has_cap "$line"; then
      echo "ERROR: $display: $path — missing cap" >&2
      FAIL=1
      continue
    fi
    if P="$path" awk '$1 == ENVIRON["P"] { found = 1 } END { exit !found }' "$KIT_PATHS"; then
      echo "ERROR: $display: $path — duplicate vs kit" >&2
      FAIL=1
      continue
    fi
    if P="$path" awk '$1 == ENVIRON["P"] { found = 1 } END { exit !found }' "$SEEN_FILE"; then
      echo "ERROR: $display: $path — duplicate" >&2
      FAIL=1
      continue
    fi
    printf '%s\n' "$path" >>"$SEEN_FILE"
  done <"$src"
}

load_product_apply() {
  PRODUCT_APPLY="$(mktemp)"
  : >"$PRODUCT_APPLY"
  case "$MODE" in
    staged)
      if git show ":${PRODUCT_FILE}" >/dev/null 2>&1; then
        git show ":${PRODUCT_FILE}" >"$PRODUCT_APPLY"
      fi
      ;;
    tree)
      if [ -f "$PRODUCT_FILE" ]; then
        cat "$PRODUCT_FILE" >"$PRODUCT_APPLY"
      fi
      ;;
  esac
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

if [ -f "$KIT_FILE" ]; then
  EXEMPT_FILE="$KIT_FILE"
  assert_exempt_no_spaces
fi

if [ -f "$PRODUCT_FILE" ]; then
  validate_product_file "$PRODUCT_FILE" "$PRODUCT_FILE"
fi

load_product_apply
if [ -s "$PRODUCT_APPLY" ] && [ "$MODE" = staged ]; then
  validate_product_file "$PRODUCT_APPLY" "$PRODUCT_FILE"
fi

if [ "$FAIL" -ne 0 ]; then
  exit "$FAIL"
fi

merge_registers

is_test_file() {
  case "$1" in
    *.test.ts | *.test.tsx | *.spec.ts | *.spec.tsx) return 0 ;;
    */__tests__/* | */e2e/*) return 0 ;;
    *) return 1 ;;
  esac
}

check_one_file() {
  local file="$1"
  [ -f "$file" ] || return 0
  is_test_file "$file" && return 0

  local lines cap register
  lines=$(wc -l < "$file" | tr -d ' ')

  if is_exempt "$file"; then
    cap="$(exempt_cap "$file" || true)"
    if [ -z "$cap" ]; then
      return 0
    fi
    if [ "$lines" -gt "$cap" ]; then
      if is_product_apply_path "$file"; then
        register="$PRODUCT_FILE"
      else
        register="$KIT_FILE"
      fi
      echo "$file - $lines lines (exceeds exemption cap $cap — refactor or update ${register})" >&2
      FAIL=1
    fi
    return 0
  fi

  if [ "$lines" -gt "$MAX" ]; then
    echo "$file - $lines lines (max $MAX)" >&2
    FAIL=1
  fi
}

under_root() {
  local file="$1" root="$2"
  case "$file" in
    "$root"/*) return 0 ;;
    *) return 1 ;;
  esac
}

scan_staged() {
  local file root
  mapfile -t STAGED < <(git diff --cached --name-only --diff-filter=ACM | grep -E '\.(ts|tsx)$' || true)
  if [ "${#STAGED[@]}" -eq 0 ]; then
    return 0
  fi
  for file in "${STAGED[@]}"; do
    for root in $ROOTS; do
      if under_root "$file" "$root"; then
        check_one_file "$file"
        break
      fi
    done
  done
}

scan_tree() {
  local root file
  for root in $ROOTS; do
    [ -d "$root" ] || continue
    while IFS= read -r -d '' file; do
      check_one_file "$file"
    done < <(
      find "$root" -type f \( -name '*.ts' -o -name '*.tsx' \) \
        ! -path '*/node_modules/*' \
        ! -path '*/dist/*' \
        ! -path '*/coverage/*' \
        ! -path '*/.next/*' \
        ! -path '*/generated/*' \
        -print0
    )
  done
}

case "$MODE" in
  staged) scan_staged ;;
  tree) scan_tree ;;
  *)
    echo "ERROR: unknown QG_FILE_MODE='$MODE' (staged | tree)" >&2
    exit 2
    ;;
esac

exit "$FAIL"
