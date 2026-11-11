#!/usr/bin/env bash
# Hermetic self-test for check-doc-hygiene.ts. Fixtures only; no network.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd -P)"
SCANNER="${ROOT}/scripts/kit/check-doc-hygiene.ts"
[[ -f "$SCANNER" ]] || { echo "FAIL: missing $SCANNER" >&2; exit 1; }
# GATE: the package.json launch flags of this scanner.
source "${ROOT}/scripts/kit/lib/gate-launch.sh"

PASS=0
FAIL=0
assert_case() {
  local name="$1" expected="$2" tree="$3" marker="$4"
  local output rc=0
  output="$(DOC_HYGIENE_ROOT="$tree" bun "${GATE[@]}" "$SCANNER" 2>&1)" || rc=$?
  if [[ "$rc" -eq "$expected" ]] && [[ "$output" == *"$marker"* ]]; then
    echo "PASS: $name"
    PASS=$((PASS + 1))
  else
    echo "FAIL: $name (expected rc=$expected and marker '$marker', got rc=$rc)" >&2
    echo "$output" >&2
    FAIL=$((FAIL + 1))
  fi
}

write_base() {
  local tree="$1"
  mkdir -p "$tree/.dev" "$tree/docs/kit"
  cat >"$tree/.dev/stack.yml" <<'EOF'
schema_version: "1.0"
docs:
  path: docs/kit
standards:
  testing: docs/kit/testing.md
  agent_entry: AGENTS.md
  agents: AGENTS.md
  contributing: README.md
EOF
  cat >"$tree/AGENTS.md" <<'EOF'
# Agents

See the [kit index](docs/kit/README.md) and [testing](docs/kit/testing.md).
EOF
  cat >"$tree/README.md" <<'EOF'
# Fixture

See the [kit index](docs/kit/README.md).
EOF
  cat >"$tree/docs/kit/README.md" <<'EOF'
# Kit documentation

- [Testing](testing.md)
EOF
  cat >"$tree/docs/kit/testing.md" <<'EOF'
# Testing

Back to the [index](README.md#kit-documentation).
[External](https://example.test) [mail](mailto:test@example.test) [anchor](#testing)
[home](~/notes.md) [placeholder](<DOC_PATH>) [later](...)

```md
[example only](missing-in-fence.md)
```
EOF
}

TMP="$(mktemp -d -t doc-hygiene.XXXXXX)"
trap 'rm -rf "$TMP"' EXIT

echo "== doc hygiene self-test =="
BASE="$TMP/base"
write_base "$BASE"
assert_case "valid documentation tree" 0 "$BASE" "check-doc-hygiene: OK"

BROKEN="$TMP/broken-link"
cp -R "$BASE" "$BROKEN"
printf '\n[Broken](missing.md)\n' >>"$BROKEN/README.md"
assert_case "broken internal link" 1 "$BROKEN" "README.md:5: broken internal link: missing.md"

STANDARD="$TMP/missing-standard"
cp -R "$BASE" "$STANDARD"
printf '  absent: docs/kit/absent.md\n' >>"$STANDARD/.dev/stack.yml"
assert_case "missing standard target" 1 "$STANDARD" "absent target does not exist"

ORPHAN="$TMP/orphan"
cp -R "$BASE" "$ORPHAN"
printf '# Orphan\n' >"$ORPHAN/docs/kit/orphan.md"
assert_case "documentation not indexed" 1 "$ORPHAN" "document is not referenced by docs/kit/README.md"

# A cwd .env or bunfig preload re-points the root unless the package.json flags close it.
assert_gate_launch DOC_HYGIENE_ROOT "$BROKEN" "README.md:5: broken internal link: missing.md"

echo "== doc hygiene summary: $PASS pass, $FAIL fail =="
[[ "$FAIL" -eq 0 ]]
