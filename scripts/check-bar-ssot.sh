#!/usr/bin/env bash
# Fail if AGENTS.md, docs/testing.md, or lefthook.yml re-enumerate validate:full.
#
# SSoT for the step list is root package.json scripts["validate:full"].
# Naming the script is allowed. A bullet / middot / comma inventory of inner
# steps is not. Heuristic: several of banlist, zod-major, test:kit-schema-sync,
# wrangler-migrations on one line (or a middot-wrapped continuation).
#
# Override: BAR_SSOT_ROOT (fixture trees in the self-test).
set -euo pipefail

ROOT="${BAR_SSOT_ROOT:-$(cd "$(dirname "$0")/.." && pwd -P)}"

FILES=(
  AGENTS.md
  docs/testing.md
  lefthook.yml
)

MARKERS=(
  banlist
  zod-major
  test:kit-schema-sync
  wrangler-migrations
)
THRESHOLD=3

if [[ ! -d "${ROOT}" ]]; then
  echo "check-bar-ssot: missing root ${ROOT}" >&2
  exit 1
fi

marker_count() {
  local text="$1"
  local n=0 m
  for m in "${MARKERS[@]}"; do
    if [[ "${text}" == *"${m}"* ]]; then
      n=$((n + 1))
    fi
  done
  printf '%s' "${n}"
}

# True if this line continues a middot / comma inventory from the previous.
is_list_continuation() {
  local prev="$1"
  local cur="$2"
  local prev_stripped cur_stripped
  prev_stripped="${prev%"${prev##*[![:space:]]}"}"
  cur_stripped="${cur#"${cur%%[![:space:]]*}"}"
  cur_stripped="${cur_stripped#\#}"
  cur_stripped="${cur_stripped#"${cur_stripped%%[![:space:]]*}"}"
  case "${prev_stripped}" in
    *'·' | *',') return 0 ;;
  esac
  case "${cur_stripped}" in
    '·'* | ','*) return 0 ;;
  esac
  return 1
}

FAIL=0

for rel in "${FILES[@]}"; do
  path="${ROOT}/${rel}"
  if [[ ! -f "${path}" ]]; then
    echo "check-bar-ssot: missing ${rel}" >&2
    FAIL=1
    continue
  fi

  block=""
  block_ln=0
  block_n=0
  ln=0
  flush_block() {
    local text="$1"
    local at="$2"
    local lines="$3"
    local bn
    [[ "${lines}" -gt 1 ]] || return 0
    bn="$(marker_count "${text}")"
    if [[ "${bn}" -ge "${THRESHOLD}" ]]; then
      echo "error: ${rel}:${at}: wrapped validate:full step list belongs in package.json" >&2
      echo "  ${text}" >&2
      FAIL=1
    fi
  }
  while IFS= read -r line || [[ -n "${line}" ]]; do
    ln=$((ln + 1))
    line="${line%$'\r'}"
    n="$(marker_count "${line}")"
    if [[ "${n}" -ge "${THRESHOLD}" ]]; then
      echo "error: ${rel}:${ln}: validate:full step list belongs in package.json" >&2
      echo "  ${line}" >&2
      FAIL=1
    fi
    if [[ -n "${block}" ]] && is_list_continuation "${block}" "${line}"; then
      block="${block} ${line}"
      block_n=$((block_n + 1))
    else
      flush_block "${block}" "${block_ln}" "${block_n}"
      block="${line}"
      block_ln="${ln}"
      block_n=1
    fi
  done <"${path}"
  flush_block "${block}" "${block_ln}" "${block_n}"
done

if [[ "${FAIL}" -ne 0 ]]; then
  echo "check-bar-ssot: FAIL (SSoT is package.json scripts[\"validate:full\"])" >&2
  exit 1
fi

echo "check-bar-ssot: OK"
exit 0
