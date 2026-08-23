#!/usr/bin/env bash
# Shared product-register validation for folder-size (and later file-length).
# Sourced, not executed. Caller contract (read at call time):
#   KIT_FILE         kit register path (may be missing)
#   QG_EXEMPT_UNIT   "lines" | "files"
#   FAIL             integer; set to 1 on a product-line error
# No `set` here.

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

# Validate every data line in $1. $2 is the display path for errors.
validate_product_file() {
  local src="$1"
  local display="${2:-$1}"
  [ -f "$src" ] || return 0

  if awk '/^[[:space:]]*#/ { next } NF > 2 && $2 !~ /^#/ { found = 1 } END { exit !found }' "$src"; then
    echo "ERROR: $display: exemption path contains spaces" >&2
    FAIL=1
    return
  fi

  local line path seen kit_paths
  seen="$(mktemp)"
  kit_paths="$(mktemp)"
  if [ -f "$KIT_FILE" ]; then
    awk '/^[[:space:]]*#/ || NF == 0 { next } { print $1 }' "$KIT_FILE" >"$kit_paths"
  else
    : >"$kit_paths"
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
    if P="$path" awk '$1 == ENVIRON["P"] { found = 1 } END { exit !found }' "$kit_paths"; then
      echo "ERROR: $display: $path — duplicate vs kit" >&2
      FAIL=1
      continue
    fi
    if P="$path" awk '$1 == ENVIRON["P"] { found = 1 } END { exit !found }' "$seen"; then
      echo "ERROR: $display: $path — duplicate" >&2
      FAIL=1
      continue
    fi
    printf '%s\n' "$path" >>"$seen"
  done <"$src"
  rm -f "$seen" "$kit_paths"
}
