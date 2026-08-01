#!/usr/bin/env bash
# Cap fichier — max 300 lignes (tests exclus). Exemptions : tools/file_exemptions.txt
# Modes : QG_FILE_MODE=staged (pre-commit) | tree (CI)
set -euo pipefail

LIB_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$(git rev-parse --show-toplevel)"

# shellcheck disable=SC1091
[ -f tools/qg.conf ] && . tools/qg.conf

MAX="${QG_FILE_MAX:-300}"
EXEMPT_FILE="${QG_FILE_EXEMPTIONS:-tools/file_exemptions.txt}"
MODE="${QG_FILE_MODE:-tree}"
# Monorepo default: apps + packages (override via tools/qg.conf).
ROOTS="${QG_FILE_ROOTS:-apps packages}"
QG_EXEMPT_UNIT="lines"
FAIL=0

# shellcheck source=check_lib.sh
. "$LIB_DIR/check_lib.sh"

assert_exempt_no_spaces

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

  local lines cap
  lines=$(wc -l < "$file" | tr -d ' ')

  if is_exempt "$file"; then
    cap="$(exempt_cap "$file" || true)"
    if [ -z "$cap" ]; then
      return 0
    fi
    if [ "$lines" -gt "$cap" ]; then
      echo "$file - $lines lines (exceeds exemption cap $cap — refactor or update tools/file_exemptions.txt)" >&2
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