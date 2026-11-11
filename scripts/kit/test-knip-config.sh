#!/usr/bin/env bash
# CP-KNIP — the root `knip` script loads the kit `knip.ts` even when a root file
# that Knip discovers first exists (knip.json, knip.jsonc, .knip.json, .knip.jsonc).
# Only `knip.ts` is a protected file, so an unpinned script would let a product
# file replace the kit config while zero-edit stays green.
# The pin selects the config file only: Knip still merges a root package.json#knip
# key under knip.ts, which package.json protection closes, not this test.
#
# Runs the root package.json `knip` script command in fixtures planted outside
# the repo. Does not mutate the repo. Exit 0 only if every case passes.
set -euo pipefail

for tool in bun python3; do
  command -v "$tool" >/dev/null 2>&1 || { echo "FAIL: missing ${tool} on PATH" >&2; exit 1; }
done

ROOT="$(cd "$(dirname "$0")/../.." && pwd -P)"
BIN="${ROOT}/node_modules/.bin"
[[ -x "${BIN}/knip" ]] || { echo "FAIL: missing ${BIN}/knip (run bun install)" >&2; exit 1; }

PASS=0
FAIL=0
# Last Knip JSON stdout and exit code. Stderr stays separate for diagnostics.
KNIP_OUT=""
KNIP_RC=0

fail() {
  echo "FAIL: $1" >&2
  FAIL=$((FAIL + 1))
}

pass() {
  echo "PASS: $1"
  PASS=$((PASS + 1))
}

TMP="$(mktemp -d -t cp-knip-XXXXXX)"
trap 'rm -rf "$TMP"' EXIT

# One fixture per case: a root `knip` script (pinned by default; optional override),
# the kit's installed Knip, a `knip.ts` whose graph leaves src/unused.ts unreachable,
# and optionally a shadow config that makes every file an entry, so Knip reports
# nothing when the shadow is the config it loads.
plant() {
  local dir="$1" shadow="$2" knip_script="${3-}"
  mkdir -p "${dir}/src"
  ln -s "${ROOT}/node_modules" "${dir}/node_modules"
  python3 - "${ROOT}/package.json" "${dir}/package.json" "$knip_script" <<'PY'
import json, sys
root = json.load(open(sys.argv[1]))
script = sys.argv[3] if sys.argv[3] else root["scripts"]["knip"]
fixture = {
    "name": "cp-knip-fixture",
    "private": True,
    "scripts": {"knip": script},
    "devDependencies": {"knip": root["devDependencies"]["knip"]},
}
with open(sys.argv[2], "w") as out:
    json.dump(fixture, out)
PY
  cat >"${dir}/knip.ts" <<'EOF'
export default {
  entry: ['src/index.ts'],
  project: ['src/**/*.ts'],
}
EOF
  echo "export const used = 1" >"${dir}/src/index.ts"
  echo "export const orphan = 1" >"${dir}/src/unused.ts"
  if [[ -n "$shadow" ]]; then
    echo '{ "entry": ["src/**/*.ts"], "project": ["src/**/*.ts"] }' >"${dir}/${shadow}"
  fi
}

# The root script, as `bun run knip` runs it.
run_script() {
  KNIP_RC=0
  KNIP_OUT="$(cd "$1" && bun run --silent knip --reporter json 2>"${TMP}/knip.err")" || KNIP_RC=$?
}

# Bare discovery, to prove the fixture really shadows `knip.ts`.
run_bare() {
  KNIP_RC=0
  KNIP_OUT="$(cd "$1" && "${BIN}/knip" --reporter json 2>"${TMP}/knip.err")" || KNIP_RC=$?
}

reports_unused() {
  [[ "$KNIP_RC" -eq 1 ]] || return 1
  python3 -c '
import json, sys
try:
    report = json.load(sys.stdin)
except ValueError:
    sys.exit(1)
issues = report.get("issues") if isinstance(report, dict) else None
sys.exit(not (
    isinstance(issues, list) and any(
        isinstance(issue, dict)
        and issue.get("file") == "src/unused.ts"
        and isinstance(issue.get("files"), list)
        and bool(issue["files"])
        for issue in issues
    )
))
' <<<"$KNIP_OUT"
}

echo "== CP-KNIP config pin =="
plant "${TMP}/base" ""
run_script "${TMP}/base"
if reports_unused; then
  pass "without a shadow, the root script reports the file knip.ts leaves unreachable"
else
  fail "fixture baseline: expected rc=1 with src/unused.ts in Unused files, got rc=${KNIP_RC}"
  echo "$KNIP_OUT" >&2
  cat "${TMP}/knip.err" >&2
fi

for shadow in knip.json knip.jsonc .knip.json .knip.jsonc; do
  plant "${TMP}/case${shadow}" "$shadow"
  run_bare "${TMP}/case${shadow}"
  if [[ "$KNIP_RC" -eq 0 ]]; then
    pass "bare discovery loads a root ${shadow} before knip.ts (the shadow is live)"
  else
    fail "bare discovery no longer loads root ${shadow} before knip.ts (rc=${KNIP_RC}); Knip discovery changed, update this self-test"
    echo "$KNIP_OUT" >&2
    cat "${TMP}/knip.err" >&2
    continue
  fi
  run_script "${TMP}/case${shadow}"
  if reports_unused; then
    pass "root script ignores a root ${shadow} and loads knip.ts"
  else
    fail "root script did not report src/unused.ts in Unused files with root ${shadow} (rc=${KNIP_RC})"
    echo "$KNIP_OUT" >&2
    cat "${TMP}/knip.err" >&2
  fi
done

# Vacuous-guard lock for the Unused-files category oracle: an unpinned
# --include-entry-exports script under a live shadow names src/unused.ts in an
# export-only row. reports_unused must reject it while a substring/rc=1 proxy
# would accept it — otherwise reverting the category check stays green.
EXPORT_ONLY_SHADOW=knip.json
plant "${TMP}/export-only" "$EXPORT_ONLY_SHADOW" "knip --include-entry-exports"
run_bare "${TMP}/export-only"
if [[ "$KNIP_RC" -ne 0 ]]; then
  fail "export-only fixture: bare discovery must load root ${EXPORT_ONLY_SHADOW} before knip.ts (rc=${KNIP_RC})"
  echo "$KNIP_OUT" >&2
  cat "${TMP}/knip.err" >&2
else
  pass "export-only fixture: bare discovery loads root ${EXPORT_ONLY_SHADOW} (shadow is live)"
  run_script "${TMP}/export-only"
  substring_proxy=0
  if [[ "$KNIP_RC" -eq 1 && "$KNIP_OUT" == *"src/unused.ts"* ]]; then
    substring_proxy=1
  fi
  if ! reports_unused && [[ "$substring_proxy" -eq 1 ]]; then
    pass "reports_unused rejects export-only naming of src/unused.ts that a substring/rc=1 proxy would accept"
  else
    fail "export-only under unpinned include-entry-exports: expected reports_unused=no with substring/rc=1 proxy=yes (rc=${KNIP_RC}, proxy=${substring_proxy})"
    echo "$KNIP_OUT" >&2
    cat "${TMP}/knip.err" >&2
  fi
fi

echo "== CP-KNIP config pin summary: ${PASS} pass, ${FAIL} fail =="
[[ "$FAIL" -eq 0 ]]
