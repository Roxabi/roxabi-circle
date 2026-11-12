#!/usr/bin/env bash
# CP-BIOME — the kit lint config blocks explicit any and cognitive complexity
# at error, without --error-on-warnings (pre-commit does not pass that flag).
#
# Plants files outside the repo. Does not mutate biome.json.
# Exit 0 only if every case passes.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd -P)"
CFG="${ROOT}/biome.json"
[[ -f "$CFG" ]] || { echo "FAIL: missing $CFG" >&2; exit 1; }
# Refuse the launcher's override: lint and pre-commit would otherwise run a
# different binary from the one whose controls this selftest exercises.
[[ -z "${BIOME_BINARY:-}" ]] || { echo "FAIL: BIOME_BINARY override is not allowed" >&2; exit 1; }
# Use the installed, lockfile-pinned package directly without bunx discovery.
BIOME="${ROOT}/node_modules/@biomejs/biome/bin/biome"
[[ -f "$BIOME" ]] || { echo "FAIL: missing local Biome; run bun install" >&2; exit 1; }

PASS=0
FAIL=0
# Last biome stdout+stderr. assert_biome writes it; callers inspect $BIOME_OUT.
BIOME_OUT=""

fail() {
  echo "FAIL: $1" >&2
  FAIL=$((FAIL + 1))
}

pass() {
  echo "PASS: $1"
  PASS=$((PASS + 1))
}

assert_biome() {
  local name="$1" expected="$2" file="$3"
  local rc=0
  BIOME_OUT="$(cd "$TMP" && node "$BIOME" check --config-path "$TMP/biome.json" "$file" 2>&1)" || rc=$?
  if [[ "$rc" -eq "$expected" ]]; then
    pass "$name"
  else
    fail "$name (expected rc=$expected, got rc=$rc)"
    echo "$BIOME_OUT" >&2
  fi
}

TMP="$(mktemp -d -t cp-biome-XXXXXX)"
trap 'rm -rf "$TMP"' EXIT

# These plants test global rules; the full root lint still runs first.
# A future path-, project-, VCS-, import- or extends-sensitive oracle must
# restore the actual context it needs instead of relying on this snapshot.
cp "$CFG" "$TMP/biome.json"
cp "$ROOT/.gitignore" "$TMP/.gitignore"

# Config contract. A raised threshold or a warn/info demotion fails here,
# even if a later plant happens to sit under the new cap.
if python3 - "$CFG" <<'PY'
import json, sys
cfg = json.load(open(sys.argv[1]))
rules = cfg["linter"]["rules"]
any_level = rules.get("suspicious", {}).get("noExplicitAny")
complexity = rules.get("complexity")
nursery = rules.get("nursery")
errors = []
if any_level != "error":
    errors.append(f"noExplicitAny is {any_level!r}, want error")
if not isinstance(complexity, dict) or complexity.get("preset") != "all":
    errors.append(f"complexity group is not preset all: {complexity!r}")
else:
    cog = complexity.get("noExcessiveCognitiveComplexity")
    level = cog.get("level") if isinstance(cog, dict) else cog
    if level != "error":
        errors.append(f"noExcessiveCognitiveComplexity level is {level!r}, want error")
    options = cog.get("options") if isinstance(cog, dict) else None
    cap = None if not options else options.get("maxAllowedComplexity")
    if cap not in (None, 15):
        errors.append(f"maxAllowedComplexity is {cap!r}, want default 15 (not raised)")
    if complexity.get("noVoid") != "off":
        errors.append("noVoid must stay off: void is the floating-promise marker")
    if complexity.get("useMaxParams") != "off":
        errors.append("useMaxParams must stay off: isolation coordinates exceed a 4-cap")
if nursery is not None:
    errors.append(f"nursery must stay unset (noise not tenable), got {nursery!r}")
if errors:
    print("FAIL: biome.json contract", file=sys.stderr)
    for e in errors:
        print("  " + e, file=sys.stderr)
    sys.exit(1)
PY
then
  pass "biome.json contract"
else
  fail "biome.json contract"
fi

cat >"$TMP/any.ts" <<'EOF'
export const x: any = 1
EOF
cat >"$TMP/any-ignored.ts" <<'EOF'
// biome-ignore lint/suspicious/noExplicitAny: fixture duck-type — DEBT:demo-any
export const x: any = 1
EOF
# 16 sequential ifs → cognitive complexity 16, one over the default cap.
{
  echo 'export function hot(n: number): number {'
  for i in $(seq 0 15); do
    echo "  if (n === $i) return $i"
  done
  echo '  return -1'
  echo '}'
} >"$TMP/hot.ts"
cat >"$TMP/void.ts" <<'EOF'
export function discard(p: Promise<unknown>): void {
  void p
}
EOF
cat >"$TMP/params.ts" <<'EOF'
export function coords(a: number, b: number, c: number, d: number, e: number): number {
  return a + b + c + d + e
}
EOF

echo "== CP-BIOME plants =="
assert_biome "unignored any is an error without --error-on-warnings" 1 "$TMP/any.ts"
if [[ "$BIOME_OUT" == *"lint/suspicious/noExplicitAny"* ]]; then
  pass "any diagnostic category"
else
  fail "any diagnostic category"
  echo "$BIOME_OUT" >&2
fi

assert_biome "DEBT-ignored any stays silent" 0 "$TMP/any-ignored.ts"

assert_biome "cognitive complexity 16 is an error" 1 "$TMP/hot.ts"
if [[ "$BIOME_OUT" == *"lint/complexity/noExcessiveCognitiveComplexity"* ]]; then
  pass "complexity diagnostic category"
else
  fail "complexity diagnostic category"
  echo "$BIOME_OUT" >&2
fi

assert_biome "void floating-promise marker is allowed" 0 "$TMP/void.ts"
if [[ "$BIOME_OUT" == *"lint/complexity/noVoid"* ]]; then
  fail "noVoid fired on the floating-promise marker"
else
  pass "noVoid stays off"
fi

assert_biome "5 isolation-style params are allowed" 0 "$TMP/params.ts"
if [[ "$BIOME_OUT" == *"lint/complexity/useMaxParams"* ]]; then
  fail "useMaxParams fired"
else
  pass "useMaxParams stays off"
fi

echo "== CP-BIOME summary: $PASS pass, $FAIL fail =="
[[ "$FAIL" -eq 0 ]]
