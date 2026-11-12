#!/usr/bin/env bash
# Hermetic self-test for check-actions-pin.ts. Fixtures only; no network.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd -P)"
SCANNER="${ROOT}/scripts/kit/check-actions-pin.ts"
[[ -f "$SCANNER" ]] || { echo "FAIL: missing $SCANNER" >&2; exit 1; }

PASS=0
FAIL=0
assert_case() {
  local name="$1" expected="$2" tree="$3" marker="$4"
  local output rc=0
  output="$(ACTIONS_PIN_ROOT="$tree" bun "$SCANNER" 2>&1)" || rc=$?
  if [[ "$rc" -eq "$expected" ]] && [[ "$output" == *"$marker"* ]]; then
    echo "PASS: $name"
    # Show the planted diagnostic so a green run still proves what was rejected.
    if [[ "$expected" -ne 0 ]]; then
      printf '      rc=%s · %s\n' "$rc" "$(printf '%s\n' "$output" | sed -n '1p')"
    fi
    PASS=$((PASS + 1))
  else
    echo "FAIL: $name (expected rc=$expected and marker '$marker', got rc=$rc)" >&2
    echo "$output" >&2
    FAIL=$((FAIL + 1))
  fi
}

CHECKOUT=3d3c42e5aac5ba805825da76410c181273ba90b1 # actions/checkout v7.0.1
CHECKOUT_OLD=9c091bb21b7c1c1d1991bb908d89e4e9dddfe3e0 # actions/checkout v7.0.0
SETUP_BUN=0c5077e51419868618aeaa5fe8019c62421857d6 # oven-sh/setup-bun v2.2.0

# `statuses: read` is a deliberate decoy: it contains the substring `uses:`.
write_base() {
  local tree="$1"
  mkdir -p "$tree/.github/workflows"
  cat >"$tree/.github/workflows/ci.yml" <<EOF
name: CI
permissions:
  statuses: read
jobs:
  quality:
    steps:
      - uses: actions/checkout@${CHECKOUT} # v7.0.1
      - uses: "oven-sh/setup-bun@${SETUP_BUN}" # v2.2.0
      - uses: ./.github/actions/kit-setup
      - run: bun run validate:full
EOF
}

TMP="$(mktemp -d -t actions-pin.XXXXXX)"
trap 'rm -rf "$TMP"' EXIT

echo "== Actions pin self-test =="
BASE="$TMP/base"
write_base "$BASE"
assert_case "pinned SHAs + exempt local ref" 0 "$BASE" \
  "check-actions-pin: OK (2 pinned ref(s), 2 action(s), 1 local ref(s), 1 workflow file(s))"

FLOATING="$TMP/floating"
cp -R "$BASE" "$FLOATING"
cat >"$FLOATING/.github/workflows/pin-case.yml" <<'EOF'
name: Pin case
jobs:
  verify:
    steps:
      - uses: actions/checkout@v7
EOF
assert_case "floating tag" 1 "$FLOATING" \
  ".github/workflows/pin-case.yml:5: unpinned ref \`v7\`"

NO_COMMENT="$TMP/no-comment"
cp -R "$BASE" "$NO_COMMENT"
cat >"$NO_COMMENT/.github/workflows/pin-case.yml" <<EOF
name: Pin case
jobs:
  verify:
    steps:
      - uses: actions/checkout@${CHECKOUT}
EOF
assert_case "SHA without version comment" 1 "$NO_COMMENT" \
  ".github/workflows/pin-case.yml:5: SHA pin needs a trailing version comment"

DRIFT="$TMP/drift"
cp -R "$BASE" "$DRIFT"
cat >"$DRIFT/.github/workflows/pin-case.yml" <<EOF
name: Pin case
jobs:
  verify:
    steps:
      - uses: actions/checkout@${CHECKOUT_OLD} # v7.0.0
EOF
assert_case "half-applied bump (two SHAs for one action)" 1 "$DRIFT" \
  "pin drift for actions/checkout: ${CHECKOUT_OLD} here vs ${CHECKOUT} at .github/workflows/ci.yml:7"

DOCKER="$TMP/docker"
cp -R "$BASE" "$DOCKER"
cat >"$DOCKER/.github/workflows/pin-case.yml" <<'EOF'
name: Pin case
jobs:
  verify:
    steps:
      - uses: docker://alpine:3.21
EOF
assert_case "docker ref fails closed" 1 "$DOCKER" \
  "unpinned ref \`docker://alpine:3.21\`"

BLIND="$TMP/blind"
mkdir -p "$BLIND/.github/workflows"
cat >"$BLIND/.github/workflows/ci.yml" <<'EOF'
name: CI
jobs:
  quality:
    steps:
      - run: bun run validate:full
EOF
assert_case "workflows with zero action refs" 1 "$BLIND" "scanner is blind"

WRAPPED="$TMP/wrapped"
cp -R "$BASE" "$WRAPPED"
cat >"$WRAPPED/.github/workflows/pin-case.yml" <<'EOF'
name: Pin case
jobs:
  verify:
    steps:
      - uses:
          attacker/exfil@main
EOF
assert_case "wrapped uses value" 1 "$WRAPPED" \
  "unpinned ref \`main\`"

QUOTED="$TMP/quoted"
cp -R "$BASE" "$QUOTED"
cat >"$QUOTED/.github/workflows/pin-case.yml" <<'EOF'
name: Pin case
jobs:
  verify:
    steps:
      - "uses": attacker/exfil@main
EOF
assert_case "quoted uses key" 1 "$QUOTED" \
  "unpinned ref \`main\`"

FLOW="$TMP/flow"
cp -R "$BASE" "$FLOW"
cat >"$FLOW/.github/workflows/pin-case.yml" <<'EOF'
name: Pin case
jobs:
  verify:
    steps: [{ uses: attacker/exfil@main }]
EOF
assert_case "flow-style steps uses" 1 "$FLOW" \
  "unpinned ref \`main\`"

ABSENT="$TMP/absent"
mkdir -p "$ABSENT"
assert_case "absent workflows dir" 1 "$ABSENT" "discovery is broken"

EMPTY="$TMP/empty"
mkdir -p "$EMPTY/.github/workflows"
assert_case "empty workflows dir" 1 "$EMPTY" "discovery is broken"

COMPOSITE="$TMP/composite"
write_base "$COMPOSITE"
mkdir -p "$COMPOSITE/.github/actions/kit-setup"
cat >"$COMPOSITE/.github/actions/kit-setup/action.yml" <<'EOF'
name: kit-setup
runs:
  using: composite
  steps:
    - uses: attacker/exfil@main
EOF
assert_case "local composite unpinned uses" 1 "$COMPOSITE" \
  ".github/actions/kit-setup/action.yml:5: unpinned ref \`main\`"

WRAPPED_PIN="$TMP/wrapped-pin"
mkdir -p "$WRAPPED_PIN/.github/workflows"
cat >"$WRAPPED_PIN/.github/workflows/ci.yml" <<EOF
name: CI
permissions:
  statuses: read
jobs:
  quality:
    steps:
      - uses:
          actions/checkout@${CHECKOUT} # v7.0.1
      - uses: "oven-sh/setup-bun@${SETUP_BUN}" # v2.2.0
      - uses: ./.github/actions/kit-setup
      - run: bun run validate:full
EOF
assert_case "wrapped pinned SHA with version comment" 0 "$WRAPPED_PIN" \
  "check-actions-pin: OK (2 pinned ref(s), 2 action(s), 1 local ref(s), 1 workflow file(s))"

# A shape the walk cannot read is a violation, never a skip: it could hold an unseen `uses:`.
shape_case() {
  local name="$1" marker="$2" dir="$TMP/shape-$3"
  cp -R "$BASE" "$dir"
  cat >"$dir/.github/workflows/pin-case.yml"
  assert_case "$name" 1 "$dir" "$marker"
}
shape_case "jobs that are not a mapping" ".github/workflows/pin-case.yml:1: \`jobs\` is not a mapping" jobs <<'EOF'
name: Pin case
jobs: [verify]
EOF
shape_case "a job that is not a mapping" "job 'verify' is not a mapping" job <<'EOF'
name: Pin case
jobs:
  verify:
EOF
shape_case "steps that are not a list" "job 'verify' steps is not a list" steps <<'EOF'
name: Pin case
jobs:
  verify:
    steps:
      uses: attacker/exfil@main
EOF
shape_case "a step that is not a mapping" "job 'verify' step 1 is not a mapping" step <<'EOF'
name: Pin case
jobs:
  verify:
    steps:
      - attacker/exfil@main
EOF

RUNS="$TMP/shape-runs"
write_base "$RUNS"
mkdir -p "$RUNS/.github/actions/kit-setup"
printf '%s\n' 'name: kit-setup' 'runs: composite' >"$RUNS/.github/actions/kit-setup/action.yml"
assert_case "composite runs that are not a mapping" 1 "$RUNS" \
  ".github/actions/kit-setup/action.yml:1: \`runs\` is not a mapping"

echo "== Actions pin summary: $PASS pass, $FAIL fail =="
[[ "$FAIL" -eq 0 ]]
