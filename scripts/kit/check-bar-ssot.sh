#!/usr/bin/env bash
# Fail if agent rules, normative docs, or lefthook re-enumerate validate:full.
#
# SSoT for the step list is root package.json scripts["validate:full"].
# Tokenize that script on `bun run <name>` / `&&`. Naming the script is allowed.
# A CP row listing inner names without the bar name is allowed. Heuristic: the
# line/block mentions `validate:full` AND ≥ THRESHOLD of those tokens (or a
# middot-wrapped continuation of that).
#
# lefthook pre-push and CI (when present) must invoke `bun run validate:full`
# by name as the command (optional `run:` prefix; extra flags ok). A substring
# inside `echo "…"` or a comment is not an invoke. Copying inner steps is not.
#
# Override: BAR_SSOT_ROOT (fixture trees in the self-test).
set -euo pipefail

ROOT="${BAR_SSOT_ROOT:-$(cd "$(dirname "$0")/../.." && pwd -P)}"

FILES=(
  AGENTS.md
  docs/kit/README.md
  docs/kit/standards/stack.md
  docs/kit/processes/dev-process.md
  docs/kit/testing.md
  lefthook.yml
)

THRESHOLD=3

if [[ ! -d "${ROOT}" ]]; then
  echo "check-bar-ssot: missing root ${ROOT}" >&2
  exit 1
fi

PKG="${ROOT}/package.json"
if [[ ! -f "${PKG}" ]]; then
  echo "check-bar-ssot: missing package.json" >&2
  exit 1
fi

if ! command -v bun >/dev/null 2>&1; then
  echo "check-bar-ssot: bun is required to parse package.json" >&2
  exit 1
fi

TOKEN_ERR="$(mktemp)"
TOKEN_OUT=""
TOKEN_EC=0
set +e
TOKEN_OUT="$(
  BAR_SSOT_PKG="${PKG}" bun -e '
const fs = require("fs");
const p = process.env.BAR_SSOT_PKG;
let j;
try {
  j = JSON.parse(fs.readFileSync(p, "utf8"));
} catch (e) {
  console.error("check-bar-ssot: unparseable package.json");
  process.exit(1);
}
const s = j && j.scripts && j.scripts["validate:full"];
if (typeof s !== "string" || !s.trim()) {
  console.error("check-bar-ssot: missing scripts[\"validate:full\"]");
  process.exit(1);
}
const names = [];
const re = /bun run ([^\s&]+)/g;
let m;
while ((m = re.exec(s))) names.push(m[1]);
if (names.length === 0) {
  console.error("check-bar-ssot: validate:full has no bun run <name> tokens");
  process.exit(1);
}
for (const n of names) process.stdout.write(n + "\n");
' 2>"${TOKEN_ERR}"
)"
TOKEN_EC=$?
set -e
if [[ "${TOKEN_EC}" -ne 0 ]]; then
  echo "check-bar-ssot: cannot read scripts[\"validate:full\"]" >&2
  if [[ -s "${TOKEN_ERR}" ]]; then
    cat "${TOKEN_ERR}" >&2
  fi
  rm -f "${TOKEN_ERR}"
  exit 1
fi
rm -f "${TOKEN_ERR}"

mapfile -t TOKENS <<< "${TOKEN_OUT}"
if [[ "${#TOKENS[@]}" -eq 0 ]]; then
  echo "check-bar-ssot: validate:full has no bun run <name> tokens" >&2
  exit 1
fi

marker_count() {
  local text="$1"
  local n=0 m
  local padded=" ${text} "
  for m in "${TOKENS[@]}"; do
    [[ -n "${m}" ]] || continue
    case "${padded}" in
      *[!A-Za-z0-9_:-]"${m}"[!A-Za-z0-9_:-]*) n=$((n + 1)) ;;
    esac
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

mentions_validate_full() {
  local text="$1"
  [[ "${text}" == *'validate:full'* ]]
}

# Command invoke: optional YAML list dash + optional `run:` prefix, then
# `bun run validate:full`. Not a substring inside echo/comments.
line_invokes_validate_full() {
  local stripped="$1"
  [[ "${stripped}" == \#* ]] && return 1
  if [[ "${stripped}" == -* ]]; then
    stripped="${stripped#-}"
    stripped="${stripped#"${stripped%%[![:space:]]*}"}"
  fi
  [[ "${stripped}" == \#* ]] && return 1
  local re='^(run:[[:space:]]*)?bun[[:space:]]+run[[:space:]]+validate:full([[:space:]]|$)'
  [[ "${stripped}" =~ ${re} ]]
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
    if [[ "${bn}" -ge "${THRESHOLD}" ]] && mentions_validate_full "${text}"; then
      echo "error: ${rel}:${at}: wrapped validate:full step list belongs in package.json" >&2
      echo "  ${text}" >&2
      FAIL=1
    fi
  }
  while IFS= read -r line || [[ -n "${line}" ]]; do
    ln=$((ln + 1))
    line="${line%$'\r'}"
    n="$(marker_count "${line}")"
    if [[ "${n}" -ge "${THRESHOLD}" ]] && mentions_validate_full "${line}"; then
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

LEFTHOOK="${ROOT}/lefthook.yml"
if [[ -f "${LEFTHOOK}" ]]; then
  pre_push="$(awk '
    /^pre-push:[[:space:]]*$/ {grab=1; print; next}
    grab && /^[A-Za-z0-9_-]+:/ {exit}
    grab {print}
  ' "${LEFTHOOK}")"
  found=0
  while IFS= read -r line || [[ -n "${line}" ]]; do
    line="${line%$'\r'}"
    stripped="${line#"${line%%[![:space:]]*}"}"
    if line_invokes_validate_full "${stripped}"; then
      found=1
      break
    fi
  done <<< "${pre_push}"
  if [[ "${found}" -eq 0 ]]; then
    echo "error: lefthook.yml: pre-push must invoke bun run validate:full by name" >&2
    FAIL=1
  fi
fi

CI="${ROOT}/.github/workflows/ci.yml"
if [[ -f "${CI}" ]]; then
  found=0
  while IFS= read -r line || [[ -n "${line}" ]]; do
    line="${line%$'\r'}"
    stripped="${line#"${line%%[![:space:]]*}"}"
    if line_invokes_validate_full "${stripped}"; then
      found=1
      break
    fi
  done <"${CI}"
  if [[ "${found}" -eq 0 ]]; then
    echo "error: .github/workflows/ci.yml: full-bar job must invoke bun run validate:full by name" >&2
    FAIL=1
  fi
fi

if [[ "${FAIL}" -ne 0 ]]; then
  echo "check-bar-ssot: FAIL (SSoT is package.json scripts[\"validate:full\"])" >&2
  exit 1
fi

echo "check-bar-ssot: OK"
exit 0
