#!/usr/bin/env bash
# Soft AGENTS.md ADR hygiene — prefer domain-doc links over bare ADR-NNN as operational law.
# Linked forms ([ADR-0002](docs/kit/architecture/adr/...)) are OK.
# EXIT: always 0 in warn mode (default). AGENTS_ADR_MODE=fail → 1 on bare refs.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"

MODE="${AGENTS_ADR_MODE:-warn}"
FILE="${AGENTS_ADR_FILE:-AGENTS.md}"

if [[ ! -f "$FILE" ]]; then
  echo "WARN: $FILE not found — skip agents-adr hygiene" >&2
  exit 0
fi

# Bare ADR-NNNN: appears outside markdown link brackets [...]
# Heuristic: line has ADR-[0-9]+ and does NOT contain ]( before end of that token's link form.
# We flag lines where ADR-N is not immediately preceded by '[' (markdown link label).
BARE="$(
  grep -nE 'ADR-[0-9]+' "$FILE" 2>/dev/null \
    | grep -vE '\[[^]]*ADR-[0-9]+[^]]*\]\([^)]+\)' \
    | grep -vE '^\s*#' \
    || true
)"

# Also allow pure Related/provenance sections that only use linked ADRs —
# remaining lines are "soft" bare refs.
if [[ -z "$BARE" ]]; then
  echo "check-agents-adr-hygiene: no bare ADR-NNN in $FILE — OK"
  exit 0
fi

COUNT="$(echo "$BARE" | grep -c . || true)"
TAG="WARN"
if [[ "$MODE" == "fail" ]]; then
  TAG="FAIL"
fi

echo "" >&2
echo "${TAG}: $FILE has ${COUNT} line(s) with bare ADR-NNN (prefer domain link or [ADR-N](docs/kit/...)):" >&2
echo "$BARE" >&2
echo "" >&2
echo "See docs/kit/debt-tracking.md § AGENTS.md ADR hygiene." >&2

if [[ "$MODE" == "fail" ]]; then
  exit 1
fi
exit 0
