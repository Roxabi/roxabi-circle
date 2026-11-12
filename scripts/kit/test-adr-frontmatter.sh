#!/usr/bin/env bash
# Hermetic self-test for check-adr-frontmatter.ts. Fixtures only; no network.
# Each failing case asserts a whole output line, `file:line: message [rule id]`, and its exact
# violation count, so a case cannot pass on a rule other than the one it targets. A line with a
# variable part is asserted by its prefix and its id. A passing case credits the ids its asserted
# lines end with, and the census at the end fails for each id of the scanner's RULES that no passing
# case credits.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd -P)"
SCANNER="${ROOT}/scripts/kit/check-adr-frontmatter.ts"
[[ -f "$SCANNER" ]] || { echo "FAIL: missing $SCANNER" >&2; exit 1; }
# Detach fixture git repos from the caller before any git init (Roxabi/roxabi-boilerplate-cf#282).
source "${ROOT}/scripts/kit/lib/hermetic-git.sh"
# GATE: the package.json launch flags of this scanner.
source "${ROOT}/scripts/kit/lib/gate-launch.sh"
# The bun executable itself, not a shim in front of it: the isolated cases launch it under a PATH or
# an environment of their own, where a shim's interpreter or HOME may be missing.
BUN_EXEC="$(bun -e 'process.stdout.write(process.execPath)')"

PASS=0
FAIL=0
SKIP=0
TMP="$(mktemp -d -t adr-frontmatter.XXXXXX)"
trap 'rm -rf "$TMP"' EXIT
: >"$TMP/census.ids"
ADR=docs/kit/architecture/adr
INDEX=docs/kit/architecture/index.md
OK='check-adr-frontmatter: OK (3 ADRs, 5 related paths)'
TABLE_SHAPE='the decision-records table must stand alone: a blank line, then | ADR | Decision |'
TABLE_HIDDEN='the decision-records table a reader sees is not the table its source lines render'
RAW_HTML='the index holds raw HTML: it can hide or forge what a reader sees'
DECISION_SHAPE='a decision is plain text (no |, (, < or &) ending in at most one (<status>) marker'
NOT_ADR='not an ADR file: adr/ holds only regular NNNN-slug.md files'
ID_RE=' \[([a-z0-9-]+)\]$'

# credit <lines> — record, for the census, the rule id that ends each of <lines>.
credit() {
  local line
  while IFS= read -r line; do
    if [[ "$line" =~ $ID_RE ]]; then echo "${BASH_REMATCH[1]}" >>"$TMP/census.ids"; fi
  done <<<"$1"
}

# pass <name> <asserted lines> — count a passing case and credit the ids of its asserted lines.
pass() {
  echo "PASS: $1"
  PASS=$((PASS + 1))
  credit "$2"
}

# miss <name> <expectation> <output> — count a failing case and show what the scan printed.
miss() {
  echo "FAIL: $1 ($2)" >&2
  echo "$3" >&2
  FAIL=$((FAIL + 1))
}

# has_line <output> <line> — <line> is a whole line of <output>.
has_line() {
  [[ $'\n'"$1"$'\n' == *$'\n'"$2"$'\n'* ]]
}

# has_prefix <output> <prefix> <id> — a line of <output> starts with <prefix> and ends with [<id>].
has_prefix() {
  local line
  while IFS= read -r line; do
    if [[ "$line" == "$2"* && "$line" == *" [$3]" ]]; then return 0; fi
  done <<<"$1"
  return 1
}

# scan <name> [VAR=value...] — scan the tree in $TMP/<name> with any extra environment given; sets
# OUT and RC.
scan() {
  local name="$1"
  shift
  RC=0
  OUT="$(env "$@" ADR_FRONTMATTER_ROOT="$TMP/$name" bun "${GATE[@]}" "$SCANNER" 2>&1)" || RC=$?
}

# assert_case <name> <expected rc> <line> <summary> [VAR=value...] — the scan exits <expected rc>,
# prints <line> as a whole line and <summary> somewhere.
assert_case() {
  local name="$1" expected="$2" line="$3" summary="$4"
  shift 4
  scan "$name" "$@"
  if [[ "$RC" -eq "$expected" ]] && has_line "$OUT" "$line" && [[ "$OUT" == *"$summary"* ]]; then
    pass "$name" "$line"
  else
    miss "$name" "expected rc=$expected, the line '$line' and '$summary', got rc=$RC" "$OUT"
  fi
}

# assert_prefix <name> <expected rc> <prefix> <id> <summary> [VAR=value...] — as assert_case, for a
# line whose end varies: it starts with <prefix> and ends with [<id>].
assert_prefix() {
  local name="$1" expected="$2" prefix="$3" id="$4" summary="$5"
  shift 5
  scan "$name" "$@"
  if [[ "$RC" -eq "$expected" ]] && has_prefix "$OUT" "$prefix" "$id" && [[ "$OUT" == *"$summary"* ]]; then
    pass "$name" " [$id]"
  else
    miss "$name" "expected rc=$expected, a line '$prefix… [$id]' and '$summary', got rc=$RC" "$OUT"
  fi
}

# fails <name> <line> [count] — the case must fail with exactly <count> (default 1) violations.
fails() {
  assert_case "$1" 1 "$2" "check-adr-frontmatter: FAIL (${3:-1} violation(s))"
}

# fails_prefix <name> <prefix> <id> [count] — as fails, for a line whose end varies.
fails_prefix() {
  assert_prefix "$1" 1 "$2" "$3" "check-adr-frontmatter: FAIL (${4:-1} violation(s))"
}

# fails_exactly <name> <lines> [stub] — the scan of $TMP/<name>, under the --preload <stub> if one is
# given, exits 1 and prints exactly <lines> in that order, then their count.
fails_exactly() {
  local name="$1" lines="$2" count output rc=0
  local -a preload=()
  if [[ -n "${3:-}" ]]; then preload=(--preload "$TMP/$3.ts"); fi
  count="$(grep -c '' <<<"$lines")"
  output="$(ADR_FRONTMATTER_ROOT="$TMP/$name" bun "${GATE[@]}" "${preload[@]}" "$SCANNER" 2>&1)" || rc=$?
  if [[ "$rc" -eq 1 && "$output" == "$lines"$'\n'"check-adr-frontmatter: FAIL ($count violation(s))" ]]; then
    pass "$name" "$lines"
  else
    miss "$name" "expected rc=1 and exactly the $count line(s) '$lines', got rc=$rc" "$output"
  fi
}

# fixture <name> — a copy of the valid base tree to mutate.
fixture() {
  cp -R "$TMP/base" "$TMP/$1"
}

# edit <name> <file> <sed expression> — in-place edit inside a fixture (no GNU-only `sed -i`).
edit() {
  local file="$TMP/$1/$2"
  sed -e "$3" "$file" >"$file.new"
  if cmp -s "$file.new" "$file"; then
    rm -f "$file.new"
    echo "FAIL: edit made no change to $2" >&2
    return 1
  fi
  mv "$file.new" "$file"
}

# insert_after <name> <file> <line> <new line> — add <new line> after each line equal to <line>.
insert_after() {
  local file="$TMP/$1/$2"
  awk -v line="$3" -v add="$4" '{ print } $0 == line { print add }' "$file" >"$file.new"
  mv "$file.new" "$file"
}

# drop_nth <name> <file> <line> <n> — drop the n-th line equal to <line>.
drop_nth() {
  local file="$TMP/$1/$2"
  awk -v line="$3" -v want="$4" '{
    if ($0 == line) { c++; if (c == want) next }
    print
  }' "$file" >"$file.new"
  mv "$file.new" "$file"
}

# fault <stub> <fs function> <path suffix> — a --preload stub making node:fs's <fs function> throw
# EIO for a path ending in <path suffix>: a filesystem error no fixture can provoke on demand.
fault() {
  cat >"$TMP/$1.ts" <<EOF
const fs = require('node:fs')
const real = fs.$2
fs.$2 = (path, ...rest) => {
  if (String(path).endsWith('$3')) throw Object.assign(new Error('EIO: i/o error, $2'), { code: 'EIO' })
  return real(path, ...rest)
}
EOF
}

# fails_under <name> <stub> <line> — the scan of $TMP/<name> under the --preload <stub> prints
# exactly <line> and one violation: the scanner reports the error instead of throwing it.
fails_under() {
  fails_exactly "$1" "$3" "$2"
}

# index_link <name> <path> — a mode-120000 entry at <path> in the index of $TMP/<name>, whatever the
# worktree holds there.
index_link() {
  local blob
  blob="$(printf 'AGENTS.md' | git -C "$TMP/$1" hash-object -w --stdin)"
  git -C "$TMP/$1" update-index --add --cacheinfo "120000,$blob,$2"
}

mkdir -p "$TMP/base/$ADR"
printf '# Agents\n' >"$TMP/base/AGENTS.md"
cat >"$TMP/base/$ADR/0001-axis.md" <<'EOF'
---
title: 'ADR-0001 — Axis'
status: accepted
normative: true
axial: true # the one axial ADR
---

# ADR-0001
EOF
cat >"$TMP/base/$ADR/0002-second.md" <<'EOF'
---
title: 'ADR-0002 — Second'
status: accepted
normative: true
axial: false
related:
  - docs/kit/architecture/index.md
  - 'docs/kit/architecture/index.md#decision-records'
  - docs/kit/architecture/adr/0001-axis.md:3
  - docs/kit/ (the whole kit tree)
  - AGENTS.md
  - Prose entry / not a path
  - 'Roxabi/roxabi-boilerplate-cf#16'
  - https://example.test/doc
  - '@kit/auth/hono'
---

# ADR-0002
EOF
cat >"$TMP/base/$ADR/0003-third.md" <<'EOF'
---
title: 'ADR-0003 — Third'
status: proposed
normative: false
axial: false
---

# ADR-0003
EOF
cat >"$TMP/base/$INDEX" <<'EOF'
# Index

## Decision records

| ADR | Decision |
|---|---|
| [ADR-0001](./adr/0001-axis.md) | Axis |
| [ADR-0002](./adr/0002-second.md) | Second |
| [ADR-0003](./adr/0003-third.md) | Third (proposed) |

## Reading an ADR

| Not | An ADR row |
EOF

# The base tree is a git repository of its own.
git init -q "$TMP/base"
git -C "$TMP/base" add -A

echo "== ADR frontmatter self-test =="
assert_case base 0 "$OK" "OK"

# Cell padding does not change the rendered decision table or relax status and reference checks.
fixture padded-table
edit padded-table "$INDEX" 's/^| ADR | Decision |$/| ADR        | Decision         |/; s/^| \[ADR-\([0-9]*\)\](\(.*\)) | \(.*\) |$/| [ADR-\1](\2)   | \3    |/'
assert_case padded-table 0 "$OK" "OK"

fixture padded-leading-trailing
edit padded-leading-trailing "$INDEX" 's/^| ADR | Decision |$/|   ADR    |    Decision   |/; s/^| \[ADR-/|    [ADR-/; s/ | /   |   /g; s/ |$/   |/'
assert_case padded-leading-trailing 0 "$OK" "OK"

fixture padded-tabs
edit padded-tabs "$INDEX" "s/ | /$(printf '\t')|$(printf '\t')/g; s/^| /|$(printf '\t')/; s/ |$/$(printf '\t')|/"
assert_case padded-tabs 0 "$OK" "OK"

fixture padded-wrong-status
edit padded-wrong-status "$INDEX" 's/^| ADR | Decision |$/| ADR        | Decision         |/; s/^| \[ADR-\([0-9]*\)\](\(.*\)) | \(.*\) |$/| [ADR-\1](\2)   | \3    |/; s/Third (proposed)/Third (accepted)/'
fails padded-wrong-status "$INDEX:9: row shows accepted (marker (accepted)) but 0003-third.md has status: proposed [index-status]"

fixture padded-row-label-mismatch
edit padded-row-label-mismatch "$INDEX" 's/^| ADR | Decision |$/| ADR        | Decision         |/; s/^| \[ADR-\([0-9]*\)\](\(.*\)) | \(.*\) |$/| [ADR-\1](\2)   | \3    |/; s|(./adr/0001-axis.md)|(./adr/0003-third.md)|'
fails_exactly padded-row-label-mismatch "$INDEX:3: 0001-axis.md has no row [index-no-row]"$'\n'"$INDEX:7: ADR row must read | [ADR-NNNN](./adr/NNNN-slug.md) | decision | [index-row-shape]"

# Rule 1 — a key removed, mistyped or declared twice.
fixture missing-axial
edit missing-axial "$ADR/0002-second.md" '/^axial:/d'
fails missing-axial "$ADR/0002-second.md:1: missing key: axial [boolean-missing]"

fixture missing-status
edit missing-status "$ADR/0002-second.md" '/^status:/d'
fails missing-status "$ADR/0002-second.md:1: missing key: status [status-missing]"

fixture unknown-status
edit unknown-status "$ADR/0002-second.md" 's/^status: accepted/status: draft/'
fails unknown-status "$ADR/0002-second.md:3: status must be one of accepted, deprecated, proposed, rejected, superseded, got draft [status-word]"

# A status and an axial value written as block scalars.
fixture status-block-scalar
edit status-block-scalar "$ADR/0003-third.md" 's/^status: proposed$/status: |/'
insert_after status-block-scalar "$ADR/0003-third.md" 'status: |' '  draft'
fails status-block-scalar "$ADR/0003-third.md:3: status must be one of accepted, deprecated, proposed, rejected, superseded, got |… [status-word]"

fixture boolean-block-scalar
edit boolean-block-scalar "$ADR/0003-third.md" 's/^axial: false$/axial: |/'
insert_after boolean-block-scalar "$ADR/0003-third.md" 'axial: |' '  false'
fails boolean-block-scalar "$ADR/0003-third.md:5: axial must be true or false, got |… [boolean-literal]"

fixture frontmatter-unclosed
drop_nth frontmatter-unclosed "$ADR/0003-third.md" '---' 2
fails frontmatter-unclosed "$ADR/0003-third.md:1: YAML frontmatter is not closed by --- [fm-unclosed]"

fixture quoted-normative
edit quoted-normative "$ADR/0002-second.md" 's/^normative: true/normative: "true"/'
fails quoted-normative "$ADR/0002-second.md:4: normative must be true or false, got \"true\" [boolean-literal]"

fixture capitalised-axial
edit capitalised-axial "$ADR/0002-second.md" 's/^axial: false/axial: False/'
fails capitalised-axial "$ADR/0002-second.md:5: axial must be true or false, got False [boolean-literal]"

fixture duplicate-key
insert_after duplicate-key "$ADR/0003-third.md" 'axial: false' 'normative: true'
fails duplicate-key "$ADR/0003-third.md:6: key normative is declared twice (first at line 4) [fm-key-twice]"

# A second key spelled "key":, key : or ? key.
fixture duplicate-quoted
insert_after duplicate-quoted "$ADR/0002-second.md" 'axial: false' '"axial": true'
fails duplicate-quoted "$ADR/0002-second.md:6: key axial is declared twice (first at line 5) [fm-key-twice]"

fixture duplicate-spaced
insert_after duplicate-spaced "$ADR/0003-third.md" 'axial: false' 'normative : true'
fails duplicate-spaced "$ADR/0003-third.md:6: key normative is declared twice (first at line 4) [fm-key-twice]"

fixture duplicate-explicit
insert_after duplicate-explicit "$ADR/0003-third.md" 'axial: false' '? axial'
insert_after duplicate-explicit "$ADR/0003-third.md" '? axial' ': true'
fails duplicate-explicit "$ADR/0003-third.md:6: key axial is declared twice (first at line 5) [fm-key-twice]"

fixture nested-duplicate
insert_after nested-duplicate "$ADR/0003-third.md" 'axial: false' 'extra: {a: 1, a: 2}'
fails nested-duplicate "$ADR/0003-third.md:6: frontmatter is not valid YAML: Map keys must be unique [fm-yaml]"

# One character per range edge outside the printable subset, inside a comment followed by
# `axial: true`.
for char in 0000:'\000' 0001:'\001' 0008:'\010' 000B:'\013' 000C:'\014' 000D:'\015' \
  000E:'\016' 001B:'\033' 001F:'\037' 007F:'\177' 0080:'\302\200' 0084:'\302\204' \
  0085:'\302\205' 0086:'\302\206' 009B:'\302\233' 009F:'\302\237' 00AD:'\302\255' \
  200B:'\342\200\213' 200E:'\342\200\216' 2028:'\342\200\250' 2029:'\342\200\251' \
  202E:'\342\200\256' FEFF:'\357\273\277' FFFE:'\357\277\276' FFFF:'\357\277\277' \
  1FFFE:'\360\237\277\276'; do
  fixture "char-${char%%:*}"
  printf -- "---\ntitle: 'ADR-0003 — Third'\nstatus: proposed\nnormative: false\naxial: false # x%baxial: true\n---\n" "${char#*:}" >"$TMP/char-${char%%:*}/$ADR/0003-third.md"
  fails "char-${char%%:*}" "$ADR/0003-third.md:5: frontmatter has a character outside the printable subset (U+${char%%:*}) [fm-unprintable]"
done

fixture tab-comment
edit tab-comment "$ADR/0003-third.md" "s/^axial: false$/axial: false$(printf '\t')# tab/"
assert_case tab-comment 0 "$OK" "OK"

fixture invalid-utf8
printf -- "---\ntitle: 'ADR-0003 — Third'\nstatus: proposed\nnormative: false\naxial: false # \377\n---\n" >"$TMP/invalid-utf8/$ADR/0003-third.md"
fails invalid-utf8 "$ADR/0003-third.md:1: file is not valid UTF-8 [adr-utf8]"

fixture file-bom
printf -- "\357\273\277---\ntitle: 'ADR-0003 — Third'\nstatus: proposed\nnormative: false\naxial: false\n---\n" >"$TMP/file-bom/$ADR/0003-third.md"
fails file-bom "$ADR/0003-third.md:1: no YAML frontmatter: line 1 must be --- [fm-missing]"

fixture yaml-directive
insert_after yaml-directive "$ADR/0003-third.md" 'axial: false' '%YAML 1.2'
fails yaml-directive "$ADR/0003-third.md:6: frontmatter has a YAML directive or document marker [fm-marker]"

fixture doc-end
insert_after doc-end "$ADR/0003-third.md" 'axial: false' '...'
insert_after doc-end "$ADR/0003-third.md" '...' '%YAML 1.2'
fails doc-end "$ADR/0003-third.md:6: frontmatter has a YAML directive or document marker [fm-marker]"

fixture doc-end-tab
insert_after doc-end-tab "$ADR/0003-third.md" 'axial: false' "...$(printf '\t')"
fails doc-end-tab "$ADR/0003-third.md:6: frontmatter has a YAML directive or document marker [fm-marker]"

fixture doc-start-space
insert_after doc-start-space "$ADR/0003-third.md" 'axial: false' '--- '
fails doc-start-space "$ADR/0003-third.md:6: frontmatter has a YAML directive or document marker [fm-marker]"

# Frontmatter that the yaml package and Bun.YAML load to different values.
fixture empty-verbatim-tag
edit empty-verbatim-tag "$ADR/0003-third.md" 's/^normative: false$/normative: !<> false/'
fails_prefix empty-verbatim-tag "$ADR/0003-third.md:2: frontmatter does not load with Bun.YAML: " fm-bun-yaml-error

fixture continuation-drop
insert_after continuation-drop "$ADR/0003-third.md" 'axial: false' '? "notes" :#'
insert_after continuation-drop "$ADR/0003-third.md" '? "notes" :#' '  normative: true'
fails_prefix continuation-drop "$ADR/0003-third.md:2: frontmatter does not load with Bun.YAML: " fm-bun-yaml-error

fixture blank-block-scalar
insert_after blank-block-scalar "$ADR/0003-third.md" 'axial: false' 'notes: |1-'
insert_after blank-block-scalar "$ADR/0003-third.md" 'notes: |1-' '   '
fails blank-block-scalar "$ADR/0003-third.md:6: frontmatter reads differently with Bun.YAML at key notes [fm-readers-differ]"

fixture nested-int-key
insert_after nested-int-key "$ADR/0003-third.md" 'axial: false' 'extra: {1: a, "1": b}'
fails nested-int-key "$ADR/0003-third.md:6: frontmatter mapping keys must be strings [fm-key-type]"

fixture merge-related
insert_after merge-related "$ADR/0003-third.md" 'axial: false' '<<: {related: [docs/kit/missing.md]}'
fails merge-related "$ADR/0003-third.md:6: frontmatter keys must be lowercase names ([a-z][a-z0-9_]*) [fm-key-name]"

fixture lookalike-key
OMICRON="$(printf '\316\277')"
insert_after lookalike-key "$ADR/0003-third.md" 'axial: false' "n${OMICRON}rmative: true"
fails lookalike-key "$ADR/0003-third.md:6: frontmatter keys must be lowercase names ([a-z][a-z0-9_]*) [fm-key-name]"

fixture alias-key
edit alias-key "$ADR/0003-third.md" 's/^axial: false$/\&k axial: false/'
insert_after alias-key "$ADR/0003-third.md" '&k axial: false' '*k : true'
fails alias-key "$ADR/0003-third.md:6: frontmatter keys must be lowercase names ([a-z][a-z0-9_]*) [fm-key-name]"

fixture tagged-axial
edit tagged-axial "$ADR/0002-second.md" 's/^axial: false$/axial: !!bool false/'
fails tagged-axial "$ADR/0002-second.md:5: frontmatter uses an anchor, alias or tag (&, *, !) [fm-anchor]"

fixture anchored-normative
edit anchored-normative "$ADR/0002-second.md" 's/^normative: true$/normative: \&n true/'
fails anchored-normative "$ADR/0002-second.md:4: frontmatter uses an anchor, alias or tag (&, *, !) [fm-anchor]"

fixture unresolved-alias
edit unresolved-alias "$ADR/0003-third.md" 's/^title: .*/title: *nope/'
fails unresolved-alias "$ADR/0003-third.md:2: frontmatter uses an anchor, alias or tag (&, *, !) [fm-anchor]"

fixture related-anchor
insert_after related-anchor "$ADR/0003-third.md" 'axial: false' 'related:'
insert_after related-anchor "$ADR/0003-third.md" 'related:' '  - &p AGENTS.md'
fails related-anchor "$ADR/0003-third.md:7: frontmatter uses an anchor, alias or tag (&, *, !) [fm-anchor]"

fixture not-a-mapping
printf -- '---\n- status: accepted\n---\n' >"$TMP/not-a-mapping/$ADR/0003-third.md"
fails not-a-mapping "$ADR/0003-third.md:2: frontmatter is not a YAML mapping [fm-not-mapping]"

fixture invalid-yaml
edit invalid-yaml "$ADR/0003-third.md" "s/^title: .*/title: 'unclosed/"
fails_prefix invalid-yaml "$ADR/0003-third.md:5: frontmatter is not valid YAML: " fm-yaml

fixture no-frontmatter
printf '# ADR-0003\n\nstatus: accepted\n' >"$TMP/no-frontmatter/$ADR/0003-third.md"
fails no-frontmatter "$ADR/0003-third.md:1: no YAML frontmatter: line 1 must be --- [fm-missing]"

# Rule 2 — a normative ADR that is not accepted.
fixture normative-proposed
edit normative-proposed "$ADR/0003-third.md" 's/^normative: false/normative: true/'
fails normative-proposed "$ADR/0003-third.md:4: normative: true requires status: accepted, got proposed [normative-accepted]"

# Rule 3 — no axial ADR, or two.
fixture zero-axial
edit zero-axial "$ADR/0001-axis.md" 's/^axial: true.*/axial: false/'
fails zero-axial "$ADR:1: no ADR declares axial: true; exactly one must [axial-none]"

fixture two-axial
edit two-axial "$ADR/0002-second.md" 's/^axial: false/axial: true/'
fails two-axial "$ADR/0002-second.md:5: axial: true is also declared by $ADR/0001-axis.md; exactly one ADR is axial [axial-many]" 2

# Rule 4 — related entries that name a path, and entries that do not.
fixture related-missing
insert_after related-missing "$ADR/0002-second.md" '  - AGENTS.md' '  - docs/kit/missing.md'
fails related-missing "$ADR/0002-second.md:12: related path does not exist: docs/kit/missing.md [related-missing]"

fixture related-bare-file
edit related-bare-file "$ADR/0002-second.md" 's|^  - AGENTS.md$|  - AGENT.md|'
fails related-bare-file "$ADR/0002-second.md:11: related path does not exist: AGENT.md [related-missing]"

# Root-level files with a #fragment or :line suffix.
fixture related-bare-fragment
edit related-bare-fragment "$ADR/0002-second.md" 's|^  - AGENTS.md$|  - MISSING.md#section|'
fails related-bare-fragment "$ADR/0002-second.md:11: related path does not exist: MISSING.md#section [related-missing]"

fixture related-bare-line
edit related-bare-line "$ADR/0002-second.md" 's|^  - AGENTS.md$|  - GONE.md:12|'
fails related-bare-line "$ADR/0002-second.md:11: related path does not exist: GONE.md:12 [related-missing]"

# A related path under a regular file.
fixture related-file-parent
edit related-file-parent "$ADR/0002-second.md" 's|^  - AGENTS.md$|  - AGENTS.md/x.md|'
fails related-file-parent "$ADR/0002-second.md:11: related path does not exist: AGENTS.md/x.md [related-unlisted]"

# Paths with a . or .. segment, and an absolute path.
fixture related-dotdot
mkdir -p "$TMP/outside/sub"
printf 'outside\n' >"$TMP/outside/AGENTS.md"
ln -s "$TMP/outside/sub" "$TMP/related-dotdot/link"
edit related-dotdot "$ADR/0002-second.md" 's|^  - AGENTS.md$|  - link/../AGENTS.md|'
fails related-dotdot "$ADR/0002-second.md:11: related path must be repository-relative, without . or .. segments: link/../AGENTS.md [related-relative]"

fixture related-dot
edit related-dot "$ADR/0002-second.md" 's|^  - AGENTS.md$|  - ./AGENTS.md|'
fails related-dot "$ADR/0002-second.md:11: related path must be repository-relative, without . or .. segments: ./AGENTS.md [related-relative]"

fixture related-absolute
edit related-absolute "$ADR/0002-second.md" 's|^  - AGENTS.md$|  - /AGENTS.md|'
fails related-absolute "$ADR/0002-second.md:11: related path must be repository-relative, without . or .. segments: /AGENTS.md [related-relative]"

# Entries shaped like owner/repo#N.
fixture related-dotdot-issue-shape
edit related-dotdot-issue-shape "$ADR/0002-second.md" 's|^  - AGENTS.md$|  - ../outside.md#1|'
fails related-dotdot-issue-shape "$ADR/0002-second.md:11: related path must be repository-relative, without . or .. segments: ../outside.md#1 [related-relative]"

fixture related-path-issue-shape
insert_after related-path-issue-shape "$ADR/0002-second.md" '  - AGENTS.md' '  - docs/missing.md#3'
fails related-path-issue-shape "$ADR/0002-second.md:12: related path does not exist: docs/missing.md#3 [related-missing]"

fixture related-dot-owner
edit related-dot-owner "$ADR/0002-second.md" 's|^  - AGENTS.md$|  - x./y#1|'
fails related-dot-owner "$ADR/0002-second.md:11: related path does not exist: x./y#1 [related-missing]"

fixture related-dot-repo
edit related-dot-repo "$ADR/0002-second.md" 's|^  - AGENTS.md$|  - Roxabi/x.y#1|'
fails related-dot-repo "$ADR/0002-second.md:11: related path does not exist: Roxabi/x.y#1 [related-missing]"

# An owner/repo#N entry whose owner is a directory at the root of the tree.
fixture related-issue-as-path
mkdir -p "$TMP/related-issue-as-path/Roxabi"
fails related-issue-as-path "$ADR/0002-second.md:13: related path does not exist: Roxabi/roxabi-boilerplate-cf#16 [related-missing]"

fixture related-scalar
insert_after related-scalar "$ADR/0003-third.md" 'axial: false' 'related: docs/kit/missing.md'
fails related-scalar "$ADR/0003-third.md:6: related must be a list of strings [related-list]"

fixture related-number
insert_after related-number "$ADR/0003-third.md" 'axial: false' 'related: [AGENTS.md, 42]'
fails related-number "$ADR/0003-third.md:6: related must be a list of strings [related-list]"

fixture related-quoted
insert_after related-quoted "$ADR/0003-third.md" 'axial: false' '"related":'
insert_after related-quoted "$ADR/0003-third.md" '"related":' '  - docs/kit/missing.md'
fails related-quoted "$ADR/0003-third.md:7: related path does not exist: docs/kit/missing.md [related-missing]"

# Rule 5 — index rows missing, repeated, misshapen or showing another status.
fixture unmarked-proposed
edit unmarked-proposed "$INDEX" 's/ | Third (proposed) |/ | Third |/'
fails unmarked-proposed "$INDEX:9: row shows accepted (no status marker) but 0003-third.md has status: proposed [index-status]"

fixture wrong-marker
edit wrong-marker "$INDEX" 's/ | Axis |/ | Axis (proposed) |/'
fails wrong-marker "$INDEX:7: row shows proposed (marker (proposed)) but 0001-axis.md has status: accepted [index-status]"

fixture marker-case
edit marker-case "$INDEX" 's/ | Third (proposed) |/ | Third (Proposed) |/'
assert_case marker-case 0 "$OK" "OK"

# A status marker outside the plain text of the decision cell.
fixture marker-extra-cell
edit marker-extra-cell "$INDEX" 's/ | Third (proposed) |/ | Third | (proposed) |/'
fails marker-extra-cell "$INDEX:9: $DECISION_SHAPE [index-decision-shape]"

fixture marker-in-link
edit marker-in-link "$INDEX" 's/ | Third (proposed) |/ | [Third](proposed) |/'
fails marker-in-link "$INDEX:9: $DECISION_SHAPE [index-decision-shape]"

fixture marker-hidden-html
edit marker-hidden-html "$INDEX" 's/ | Third (proposed) |/ | Third <details> (proposed) |/'
fails marker-hidden-html "$INDEX:9: $RAW_HTML [index-raw-html]"

fixture marker-entity
edit marker-entity "$INDEX" 's/ | Axis |/ | Axis \&#40;proposed\&#41; |/'
fails marker-entity "$INDEX:7: $DECISION_SHAPE [index-decision-shape]"

fixture malformed-row
edit malformed-row "$INDEX" 's|(./adr/0003-third.md)|(adr/0003-third.md)|'
fails malformed-row "$INDEX:9: ADR row must read | [ADR-NNNN](./adr/NNNN-slug.md) | decision | [index-row-shape]" 2

fixture row-label-mismatch
edit row-label-mismatch "$INDEX" 's|(./adr/0001-axis.md)|(./adr/0003-third.md)|'
fails_exactly row-label-mismatch "$INDEX:3: 0001-axis.md has no row [index-no-row]"$'\n'"$INDEX:7: ADR row must read | [ADR-NNNN](./adr/NNNN-slug.md) | decision | [index-row-shape]"

fixture row-ghost
insert_after row-ghost "$INDEX" '| [ADR-0003](./adr/0003-third.md) | Third (proposed) |' '| [ADR-0018](./adr/0018-ghost.md) | Ghost |'
fails row-ghost "$INDEX:10: no ADR file 0018-ghost.md [index-row-ghost]"

fixture missing-row
edit missing-row "$INDEX" '/ADR-0003/d'
fails missing-row "$INDEX:3: 0003-third.md has no row [index-no-row]"

fixture duplicate-row
insert_after duplicate-row "$INDEX" '| [ADR-0001](./adr/0001-axis.md) | Axis |' '| [ADR-0001](./adr/0001-axis.md) | Axis |'
fails duplicate-row "$INDEX:8: 0001-axis.md is already listed at line 7 [index-row-twice]"

# Tables and ADR links around the decision-records table.
fixture decoy-table
cat >>"$TMP/decoy-table/$INDEX" <<'EOF'

| ADR | Status |
|---|---|
| ADR-0003 | accepted |
EOF
fails decoy-table "$INDEX:17: a table outside the decision-records table names an ADR [index-other-table]"

fixture link-entity
insert_after link-entity "$INDEX" '| Not | An ADR row |' '[ADR-0003](./adr&#47;0003-third.md)'
fails link-entity "$INDEX:14: an ADR file is linked outside the decision-records table [index-outside-link]"

fixture bad-header
edit bad-header "$INDEX" 's/^| ADR | Decision |$/| ADR | Decision | Note |/'
fails bad-header "$INDEX:5: $TABLE_SHAPE [index-table-shape]"

fixture bad-delimiter
edit bad-delimiter "$INDEX" 's/^|---|---|$/|---|---|---|/'
fails bad-delimiter "$INDEX:5: $TABLE_HIDDEN [index-rendered]"

fixture row-after-table
insert_after row-after-table "$INDEX" '| [ADR-0003](./adr/0003-third.md) | Third (proposed) |' 'ADR-0003 | Third'
fails row-after-table "$INDEX:5: $TABLE_HIDDEN [index-rendered]"

fixture link-outside-table
insert_after link-outside-table "$INDEX" '| Not | An ADR row |' '[ADR-0003](./adr/0003-third.md) | Third'
fails link-outside-table "$INDEX:14: an ADR file is linked outside the decision-records table [index-outside-link]"

fixture link-ref-definition
insert_after link-ref-definition "$INDEX" '| Not | An ADR row |' '[adr3]: ./adr/0003-third.md'
fails link-ref-definition "$INDEX:14: an ADR file is linked outside the decision-records table [index-outside-ref]"

fixture index-invalid-utf8
printf '\xFF' >>"$TMP/index-invalid-utf8/$INDEX"
fails index-invalid-utf8 "$INDEX:1: file is not valid UTF-8 [index-utf8]"

# A CR inside a comment and inside a fence.
fixture index-cr-comment
printf '\r<!--\n-->\n' >>"$TMP/index-cr-comment/$INDEX"
fails index-cr-comment "$INDEX:14: index has a character outside the printable subset (U+000D) [index-unprintable]"

fixture index-cr-fence
printf '\r```\n' >>"$TMP/index-cr-fence/$INDEX"
fails index-cr-fence "$INDEX:14: index has a character outside the printable subset (U+000D) [index-unprintable]"

fixture index-bidi
edit index-bidi "$INDEX" "s/ (proposed)/$(printf '\342\200\256') (proposed)/"
fails index-bidi "$INDEX:9: index has a character outside the printable subset (U+202E) [index-unprintable]"

# A code fence before the table, one case per fence marker.
for fence in 'backtick:```' 'tilde:~~~'; do
  fixture "hiding-${fence%%:*}"
  insert_after "hiding-${fence%%:*}" "$INDEX" '## Decision records' "${fence#*:}"
  fails "hiding-${fence%%:*}" "$INDEX:6: $TABLE_HIDDEN [index-rendered]"
done

fixture hiding-html
insert_after hiding-html "$INDEX" '## Decision records' '   <details>'
fails hiding-html "$INDEX:4: $RAW_HTML [index-raw-html]"

fixture missing-index
rm "$TMP/missing-index/$INDEX"
# ADR-0002 relates two paths under the index, hence 3 violations.
fails missing-index "$INDEX:1: ADR index is missing [index-missing]" 3

# Scope — entries of adr/ other than a regular NNNN-slug.md file.
fixture misnamed-adr
cp "$TMP/misnamed-adr/$ADR/0001-axis.md" "$TMP/misnamed-adr/$ADR/0004_axis.md"
fails misnamed-adr "$ADR/0004_axis.md:1: $NOT_ADR [adr-entry]"

fixture adr-subdirectory
mkdir -p "$TMP/adr-subdirectory/$ADR/drafts"
fails adr-subdirectory "$ADR/drafts:1: $NOT_ADR [adr-entry]"

fixture adr-symlink
ln -s 0003-third.md "$TMP/adr-symlink/$ADR/0004-fourth.md"
fails adr-symlink "$ADR/0004-fourth.md:1: $NOT_ADR [adr-entry]"

fixture adr-dir-symlink
mv "$TMP/adr-dir-symlink/$ADR" "$TMP/adr-dir-symlink/docs/adr-real"
ln -s ../../adr-real "$TMP/adr-dir-symlink/$ADR"
fails adr-dir-symlink "$ADR:1: ADR directory is missing or not a real directory [adr-dir-missing]"

fixture no-adr-directory
rm -r "$TMP/no-adr-directory/$ADR"
fails no-adr-directory "$ADR:1: ADR directory is missing or not a real directory [adr-dir-missing]"

fixture empty-adr-dir
rm -f "$TMP/empty-adr-dir/$ADR"/*.md
fails empty-adr-dir "$ADR:1: no ADR file [adr-none]"

# An adr/ holding a README and a draft, and no ADR file.
fixture adr-dir-no-adr
rm -f "$TMP/adr-dir-no-adr/$ADR"/*.md
printf '# ADRs\n' >"$TMP/adr-dir-no-adr/$ADR/README.md"
printf 'draft\n' >"$TMP/adr-dir-no-adr/$ADR/draft.md"
fails_exactly adr-dir-no-adr "$ADR:1: no ADR file [adr-none]"$'\n'"$ADR/README.md:1: $NOT_ADR [adr-entry]"$'\n'"$ADR/draft.md:1: $NOT_ADR [adr-entry]"

# The architecture directory as a symlink to a valid tree, outside the root and inside it.
fixture parent-symlink-out
cp -R "$TMP/parent-symlink-out/docs/kit/architecture" "$TMP/outside-arch"
rm -r "$TMP/parent-symlink-out/docs/kit/architecture"
ln -s "$TMP/outside-arch" "$TMP/parent-symlink-out/docs/kit/architecture"
fails parent-symlink-out "$ADR:1: ADR directory is not at its canonical path [adr-dir-alias]"

fixture parent-symlink-alias
cp -R "$TMP/parent-symlink-alias/docs/kit/architecture" "$TMP/parent-symlink-alias/alias-target"
rm -r "$TMP/parent-symlink-alias/docs/kit/architecture"
ln -s "$TMP/parent-symlink-alias/alias-target" "$TMP/parent-symlink-alias/docs/kit/architecture"
fails parent-symlink-alias "$ADR:1: ADR directory is not at its canonical path [adr-dir-alias]"

# The root reached through a symlink.
ln -s "$TMP/base" "$TMP/root-link"
assert_case root-link 0 "$OK" "OK"

# The index as a symlink to a copy, with the adr directory left canonical.
fixture index-symlink
cp "$TMP/index-symlink/$INDEX" "$TMP/index-symlink/docs/kit/architecture/index-copy.md"
rm "$TMP/index-symlink/$INDEX"
ln -s index-copy.md "$TMP/index-symlink/$INDEX"
git -C "$TMP/index-symlink" add docs/kit/architecture/index-copy.md "$INDEX"
# ADR-0002 relates two paths under the index, hence 3 violations.
fails index-symlink "$INDEX:1: ADR index is not at its canonical path [index-alias]" 3

# EIO from realpath on the ADR directory and on the index. The index fixture relates no path to the
# index, which the stub would fail too.
fixture adr-dir-realpath-error
fault realpath-adr-dir realpathSync /docs/kit/architecture/adr
fails_under adr-dir-realpath-error realpath-adr-dir "$ADR:1: ADR directory is not at its canonical path: EIO: i/o error, realpathSync [adr-dir-unresolved]"

fixture index-realpath-error
edit index-realpath-error "$ADR/0002-second.md" '/architecture\/index\.md/d'
fault realpath-index realpathSync /docs/kit/architecture/index.md
fails_under index-realpath-error realpath-index "$INDEX:1: ADR index is not at its canonical path: EIO: i/o error, realpathSync [index-unresolved]"

# EIO reading the ADR directory, an ADR entry, an ADR, the index and a related path's directory.
fixture adr-dir-lstat-error
fault lstat-adr-dir lstatSync /docs/kit/architecture/adr
fails_under adr-dir-lstat-error lstat-adr-dir "$ADR:1: ADR directory cannot be read: EIO: i/o error, lstatSync [adr-dir-unreadable]"

fixture adr-dir-readdir-error
fault readdir-adr-dir readdirSync /docs/kit/architecture/adr
fails_under adr-dir-readdir-error readdir-adr-dir "$ADR:1: ADR directory cannot be read: EIO: i/o error, readdirSync [adr-dir-unreadable]"

fixture adr-entry-lstat-error
fault lstat-adr-entry lstatSync /0003-third.md
fails_under adr-entry-lstat-error lstat-adr-entry "$ADR/0003-third.md:1: ADR entry cannot be read: EIO: i/o error, lstatSync [adr-entry-unreadable]"

fixture adr-read-error
fault read-adr readFileSync /0003-third.md
fails_under adr-read-error read-adr "$ADR/0003-third.md:1: file cannot be read: EIO: i/o error, readFileSync [adr-unreadable]"

fixture index-read-error
fault read-index readFileSync /docs/kit/architecture/index.md
fails_under index-read-error read-index "$INDEX:1: file cannot be read: EIO: i/o error, readFileSync [index-unreadable]"

fixture related-readdir-error
mkdir -p "$TMP/related-readdir-error/notes"
printf 'note\n' >"$TMP/related-readdir-error/notes/n.md"
git -C "$TMP/related-readdir-error" add notes/n.md
edit related-readdir-error "$ADR/0002-second.md" 's|^  - AGENTS.md$|  - notes/n.md|'
fault readdir-notes readdirSync /notes
fails_under related-readdir-error readdir-notes "$ADR/0002-second.md:11: related path cannot be listed: EIO: i/o error, readdirSync: notes/n.md [related-dir-unreadable]"

# EIO listing the root, under an owner/repo#N entry.
fixture related-root-unlisted
edit related-root-unlisted "$ADR/0002-second.md" '/^  - /d'
insert_after related-root-unlisted "$ADR/0002-second.md" 'related:' "  - 'Roxabi/roxabi-boilerplate-cf#16'"
fault readdir-root readdirSync /related-root-unlisted
fails_under related-root-unlisted readdir-root "$ADR/0002-second.md:7: related path cannot be listed: EIO: i/o error, readdirSync: Roxabi/roxabi-boilerplate-cf#16 [related-dir-unreadable]"

# EIO from the .git lstat.
fixture git-dir-lstat-error
fault lstat-dot-git lstatSync /.git
fails_under git-dir-lstat-error lstat-dot-git ".:1: git is required to verify related paths: EIO: i/o error, lstatSync [git-failed]"

# Paths on disk that the index does not hold.
fixture related-untracked
printf 'loose\n' >"$TMP/related-untracked/loose.md"
edit related-untracked "$ADR/0002-second.md" 's|^  - AGENTS.md$|  - loose.md|'
fails related-untracked "$ADR/0002-second.md:11: related path is not delivered by a tracked entry: loose.md [related-undelivered]"

fixture related-ignored
printf 'ignored.md\n' >"$TMP/related-ignored/.gitignore"
printf 'ignored\n' >"$TMP/related-ignored/ignored.md"
edit related-ignored "$ADR/0002-second.md" 's|^  - AGENTS.md$|  - ignored.md|'
fails related-ignored "$ADR/0002-second.md:11: related path is not delivered by a tracked entry: ignored.md [related-undelivered]"

fixture related-git-head
edit related-git-head "$ADR/0002-second.md" 's|^  - AGENTS.md$|  - .git/HEAD|'
fails related-git-head "$ADR/0002-second.md:11: related path is not delivered by a tracked entry: .git/HEAD [related-undelivered]"

fixture related-node-modules
mkdir -p "$TMP/related-node-modules/node_modules/yaml"
printf '{}\n' >"$TMP/related-node-modules/node_modules/yaml/package.json"
edit related-node-modules "$ADR/0002-second.md" 's|^  - AGENTS.md$|  - node_modules/yaml/package.json|'
fails related-node-modules "$ADR/0002-second.md:11: related path is not delivered by a tracked entry: node_modules/yaml/package.json [related-undelivered]"

# A related directory holding only untracked files, and one with a tracked sibling that shares its
# prefix.
fixture related-untracked-dir
mkdir -p "$TMP/related-untracked-dir/scratch"
printf 'loose\n' >"$TMP/related-untracked-dir/scratch/loose.md"
edit related-untracked-dir "$ADR/0002-second.md" 's|^  - AGENTS.md$|  - scratch/|'
fails related-untracked-dir "$ADR/0002-second.md:11: related path is not delivered by a tracked entry: scratch/ [related-undelivered]"

fixture related-dir-prefix
mkdir -p "$TMP/related-dir-prefix/notes" "$TMP/related-dir-prefix/notes-extra"
printf 'loose\n' >"$TMP/related-dir-prefix/notes/loose.md"
printf 'kept\n' >"$TMP/related-dir-prefix/notes-extra/x.md"
git -C "$TMP/related-dir-prefix" add notes-extra/x.md
edit related-dir-prefix "$ADR/0002-second.md" 's|^  - AGENTS.md$|  - notes/|'
fails related-dir-prefix "$ADR/0002-second.md:11: related path is not delivered by a tracked entry: notes/ [related-undelivered]"

# A related directory whose only tracked entry is a link.
fixture related-link-only-dir
mkdir -p "$TMP/related-link-only-dir/d"
ln -s ../AGENTS.md "$TMP/related-link-only-dir/d/l.md"
git -C "$TMP/related-link-only-dir" add d/l.md
edit related-link-only-dir "$ADR/0002-second.md" 's|^  - AGENTS.md$|  - d/|'
assert_case related-link-only-dir 0 "$OK" "OK"

# A tracked executable file.
fixture related-exec-file
printf '#!/bin/sh\n' >"$TMP/related-exec-file/run.sh"
chmod +x "$TMP/related-exec-file/run.sh"
git -C "$TMP/related-exec-file" -c core.fileMode=true add run.sh
edit related-exec-file "$ADR/0002-second.md" 's|^  - AGENTS.md$|  - run.sh|'
assert_case related-exec-file 0 "$OK" "OK"

# A related directory whose only tracked entry is a gitlink.
fixture related-gitlink-dir
mkdir -p "$TMP/related-gitlink-dir/vendor/mod"
git -C "$TMP/related-gitlink-dir" update-index --add --cacheinfo 160000,0123456789abcdef0123456789abcdef01234567,vendor/mod
edit related-gitlink-dir "$ADR/0002-second.md" 's|^  - AGENTS.md$|  - vendor/|'
assert_case related-gitlink-dir 0 "$OK" "OK"

# A gitlink over a worktree file. Git does not look up a gitlink's commit, so any object id serves.
fixture related-gitlink
printf 'file\n' >"$TMP/related-gitlink/sub.md"
git -C "$TMP/related-gitlink" update-index --add --cacheinfo 160000,0123456789abcdef0123456789abcdef01234567,sub.md
edit related-gitlink "$ADR/0002-second.md" 's|^  - AGENTS.md$|  - sub.md|'
fails related-gitlink "$ADR/0002-second.md:11: related path is not delivered by a tracked entry: sub.md [related-undelivered]"

# Rule 4, symlinks — links on disk and in the index, one case per position and per kind of link.
fixture related-link-tracked
ln -s AGENTS.md "$TMP/related-link-tracked/linked.md"
git -C "$TMP/related-link-tracked" add linked.md
edit related-link-tracked "$ADR/0002-second.md" 's|^  - AGENTS.md$|  - linked.md|'
fails related-link-tracked "$ADR/0002-second.md:11: related path goes through a symlink: linked.md [related-link]"

fixture related-link-dir-mid
ln -s docs/kit "$TMP/related-link-dir-mid/kitlink"
git -C "$TMP/related-link-dir-mid" add kitlink
edit related-link-dir-mid "$ADR/0002-second.md" 's|^  - AGENTS.md$|  - kitlink/architecture/index.md|'
fails related-link-dir-mid "$ADR/0002-second.md:11: related path goes through a symlink: kitlink/architecture/index.md [related-link]"

fixture related-link-untracked
ln -s AGENTS.md "$TMP/related-link-untracked/linked.md"
edit related-link-untracked "$ADR/0002-second.md" 's|^  - AGENTS.md$|  - linked.md|'
fails related-link-untracked "$ADR/0002-second.md:11: related path goes through a symlink: linked.md [related-link]"

fixture related-link-out
ln -s "$TMP/outside/AGENTS.md" "$TMP/related-link-out/linked.md"
git -C "$TMP/related-link-out" add linked.md
edit related-link-out "$ADR/0002-second.md" 's|^  - AGENTS.md$|  - linked.md|'
fails related-link-out "$ADR/0002-second.md:11: related path goes through a symlink: linked.md [related-link]"

fixture related-link-out-mid
mkdir -p "$TMP/related-link-out-dir"
printf 'outside\n' >"$TMP/related-link-out-dir/notes.md"
ln -s "$TMP/related-link-out-dir" "$TMP/related-link-out-mid/outlink"
edit related-link-out-mid "$ADR/0002-second.md" 's|^  - AGENTS.md$|  - outlink/notes.md|'
fails related-link-out-mid "$ADR/0002-second.md:11: related path goes through a symlink: outlink/notes.md [related-link]"

fixture related-link-dangling
ln -s missing.md "$TMP/related-link-dangling/gone.md"
git -C "$TMP/related-link-dangling" add gone.md
edit related-link-dangling "$ADR/0002-second.md" 's|^  - AGENTS.md$|  - gone.md|'
fails related-link-dangling "$ADR/0002-second.md:11: related path goes through a symlink: gone.md [related-link]"

# An owner/repo#N-shaped entry whose owner is a root link to a missing target outside the
# repository.
fixture related-link-issue-shape
ln -s "$TMP/related-link-issue-shape-target" "$TMP/related-link-issue-shape/ext"
git -C "$TMP/related-link-issue-shape" add ext
edit related-link-issue-shape "$ADR/0002-second.md" 's|^  - AGENTS.md$|  - ext/notes#3|'
fails related-link-issue-shape "$ADR/0002-second.md:11: related path goes through a symlink: ext/notes#3 [related-link]"

# A link followed by a component that does not exist: a tracked directory link, then a dangling one.
fixture related-link-dir-missing
ln -s docs/kit "$TMP/related-link-dir-missing/kitlink"
git -C "$TMP/related-link-dir-missing" add kitlink
edit related-link-dir-missing "$ADR/0002-second.md" 's|^  - AGENTS.md$|  - kitlink/missing.md|'
fails related-link-dir-missing "$ADR/0002-second.md:11: related path goes through a symlink: kitlink/missing.md [related-link]"

fixture related-link-dangling-mid
ln -s missing "$TMP/related-link-dangling-mid/gone"
git -C "$TMP/related-link-dangling-mid" add gone
edit related-link-dangling-mid "$ADR/0002-second.md" 's|^  - AGENTS.md$|  - gone/x.md|'
fails related-link-dangling-mid "$ADR/0002-second.md:11: related path goes through a symlink: gone/x.md [related-link]"

# Index link entries over regular worktree files, at the end and in the middle of the related path.
fixture related-index-link-end
printf 'plain\n' >"$TMP/related-index-link-end/p.md"
index_link related-index-link-end p.md
edit related-index-link-end "$ADR/0002-second.md" 's|^  - AGENTS.md$|  - p.md|'
fails related-index-link-end "$ADR/0002-second.md:11: related path goes through a symlink of the index: p.md [related-index-link]"

fixture related-index-link-mid
mkdir -p "$TMP/related-index-link-mid/p"
printf 'plain\n' >"$TMP/related-index-link-mid/p/x.md"
index_link related-index-link-mid p
edit related-index-link-mid "$ADR/0002-second.md" 's|^  - AGENTS.md$|  - p/x.md|'
fails related-index-link-mid "$ADR/0002-second.md:11: related path goes through a symlink of the index: p/x.md [related-index-link]"

# An index link over a worktree directory, followed by a component that does not exist.
fixture related-index-link-dir-missing
mkdir -p "$TMP/related-index-link-dir-missing/p"
printf 'plain\n' >"$TMP/related-index-link-dir-missing/p/x.md"
index_link related-index-link-dir-missing p
edit related-index-link-dir-missing "$ADR/0002-second.md" 's|^  - AGENTS.md$|  - p/missing.md|'
fails related-index-link-dir-missing "$ADR/0002-second.md:11: related path goes through a symlink of the index: p/missing.md [related-index-link]"

# EIO from lstat on a related path component.
fixture related-lstat-error
fault lstat-agents lstatSync /AGENTS.md
fails_under related-lstat-error lstat-agents "$ADR/0002-second.md:11: related path cannot be read: EIO: i/o error, lstatSync: AGENTS.md [related-unreadable]"

# Names that are not UTF-8. Each case needs a filesystem that stores such a name (Linux does; APFS
# refuses); elsewhere it is skipped, and on CI that is a failure.
RAW=$'\xff'
FFFD=$'\xef\xbf\xbd'
if { : >"$TMP/raw-name-$RAW"; } 2>/dev/null; then
  # An adr/ entry whose name is not UTF-8.
  fixture adr-raw-name
  printf 'raw\n' >"$TMP/adr-raw-name/$ADR/$RAW.md"
  fails adr-raw-name "$ADR/$FFFD.md:1: $NOT_ADR [adr-entry]"

  # A tracked file whose name is not UTF-8, related by the U+FFFD name a lossy read decodes it to.
  fixture related-raw-name
  printf 'raw\n' >"$TMP/related-raw-name/docs/$RAW.md"
  git -C "$TMP/related-raw-name" add -- "docs/$RAW.md"
  edit related-raw-name "$ADR/0002-second.md" "s|^  - AGENTS.md\$|  - docs/$FFFD.md|"
  fails related-raw-name "$ADR/0002-second.md:11: related path does not exist: docs/$FFFD.md [related-missing]"

  # A tracked name that is not UTF-8, next to an untracked file named by the U+FFFD it decodes to.
  fixture related-raw-tracked
  printf 'raw\n' >"$TMP/related-raw-tracked/$RAW.md"
  printf 'loose\n' >"$TMP/related-raw-tracked/$FFFD.md"
  git -C "$TMP/related-raw-tracked" add -- "$RAW.md"
  edit related-raw-tracked "$ADR/0002-second.md" "s|^  - AGENTS.md\$|  - $FFFD.md|"
  fails related-raw-tracked "$ADR/0002-second.md:11: related path is not delivered by a tracked entry: $FFFD.md [related-undelivered]"

  # A related directory whose only tracked entry has a name that is not UTF-8.
  fixture related-raw-dir
  mkdir -p "$TMP/related-raw-dir/raw"
  printf 'raw\n' >"$TMP/related-raw-dir/raw/$RAW.md"
  git -C "$TMP/related-raw-dir" add -- "raw/$RAW.md"
  edit related-raw-dir "$ADR/0002-second.md" 's|^  - AGENTS.md$|  - raw/|'
  assert_case related-raw-dir 0 "$OK" "OK"

  # A tracked directory whose name is not UTF-8, next to an untracked directory named by the U+FFFD
  # it decodes to.
  fixture related-raw-tracked-dir
  mkdir -p "$TMP/related-raw-tracked-dir/$RAW" "$TMP/related-raw-tracked-dir/$FFFD"
  printf 'raw\n' >"$TMP/related-raw-tracked-dir/$RAW/x.md"
  printf 'loose\n' >"$TMP/related-raw-tracked-dir/$FFFD/x.md"
  git -C "$TMP/related-raw-tracked-dir" add -- "$RAW/x.md"
  edit related-raw-tracked-dir "$ADR/0002-second.md" "s|^  - AGENTS.md\$|  - $FFFD/|"
  fails related-raw-tracked-dir "$ADR/0002-second.md:11: related path is not delivered by a tracked entry: $FFFD/ [related-undelivered]"
else
  for name in adr-raw-name related-raw-name related-raw-tracked related-raw-dir related-raw-tracked-dir; do
    if [[ -n "${CI:-}" ]]; then
      echo "FAIL: $name (this filesystem refuses a name that is not UTF-8, which CI must run)" >&2
      FAIL=$((FAIL + 1))
    else
      echo "SKIP: $name (this filesystem refuses a name that is not UTF-8)"
      SKIP=$((SKIP + 1))
    fi
  done
fi

# A tracked name that starts with a BOM, related without it.
fixture related-bom-tracked
printf 'bom\n' >"$TMP/related-bom-tracked/"$'\357\273\277'"x.md"
git -C "$TMP/related-bom-tracked" add -- $'\357\273\277'"x.md"
printf 'loose\n' >"$TMP/related-bom-tracked/x.md"
edit related-bom-tracked "$ADR/0002-second.md" 's|^  - AGENTS.md$|  - x.md|'
fails related-bom-tracked "$ADR/0002-second.md:11: related path is not delivered by a tracked entry: x.md [related-undelivered]"

# An intent-to-add path.
fixture related-intent-to-add
printf 'staged\n' >"$TMP/related-intent-to-add/staged.md"
git -C "$TMP/related-intent-to-add" add -N staged.md
edit related-intent-to-add "$ADR/0002-second.md" 's|^  - AGENTS.md$|  - staged.md|'
assert_case related-intent-to-add 0 "$OK" "OK"

# No repository, and no git binary on PATH.
GIT_REQUIRED='.:1: git is required to verify related paths: '
fixture no-git
rm -rf "$TMP/no-git/.git"
fails_prefix no-git "$GIT_REQUIRED" git-failed

fixture git-missing
mkdir -p "$TMP/bun-only"
ln -s "$BUN_EXEC" "$TMP/bun-only/bun"
assert_prefix git-missing 1 "$GIT_REQUIRED" git-failed "FAIL (1 violation(s))" PATH="$TMP/bun-only"

# A git that exits 1 and prints nothing.
mkdir -p "$TMP/git-silent"
printf '#!/bin/sh\nexit 1\n' >"$TMP/git-silent/git"
chmod +x "$TMP/git-silent/git"
fixture git-silent-fail
assert_case git-silent-fail 1 "${GIT_REQUIRED}git rev-parse exited 1 [git-failed]" "FAIL (1 violation(s))" \
  PATH="$TMP/git-silent:$PATH"

# A git that exits 1 and prints two stderr lines.
mkdir -p "$TMP/git-two-lines"
printf '#!/bin/sh\necho "fatal: first line" >&2\necho "hint: second line" >&2\nexit 1\n' >"$TMP/git-two-lines/git"
chmod +x "$TMP/git-two-lines/git"
fixture git-first-line
assert_case git-first-line 1 "${GIT_REQUIRED}fatal: first line [git-failed]" "FAIL (1 violation(s))" \
  PATH="$TMP/git-two-lines:$PATH"

# Layouts where git would read another index or work tree, and linked worktrees.
IDENTITY="${GIT_REQUIRED}the scan root is not the work tree of its own repository"

# A tree without a .git, inside an enclosing repository.
mkdir -p "$TMP/enclosing"
git init -q "$TMP/enclosing"
fixture enclosing-borrow
rm -rf "$TMP/enclosing/borrow"
mv "$TMP/enclosing-borrow" "$TMP/enclosing/borrow"
rm -rf "$TMP/enclosing/borrow/.git"
git -C "$TMP/enclosing" add -A
fails_prefix enclosing/borrow "$IDENTITY" git-not-own

# An enclosing repository whose core.worktree names the tree.
git init -q "$TMP/enclosing-worktree"
cp -R "$TMP/base" "$TMP/enclosing-worktree/borrow"
rm -rf "$TMP/enclosing-worktree/borrow/.git"
git -C "$TMP/enclosing-worktree" config core.worktree "$TMP/enclosing-worktree/borrow"
git -C "$TMP/enclosing-worktree/borrow" add -A
fails_prefix enclosing-worktree/borrow "$IDENTITY" git-not-own

# An empty .git directory, which git walks past, inside an enclosing repository.
git init -q "$TMP/enclosing-dotgit"
cp -R "$TMP/base" "$TMP/enclosing-dotgit/borrow"
rm -rf "$TMP/enclosing-dotgit/borrow/.git"
git -C "$TMP/enclosing-dotgit" config core.worktree "$TMP/enclosing-dotgit/borrow"
git -C "$TMP/enclosing-dotgit/borrow" add -A
mkdir "$TMP/enclosing-dotgit/borrow/.git"
fails_prefix enclosing-dotgit/borrow "$IDENTITY" git-not-own

# A core.worktree that moves the work tree up, so every tracked path carries an inner/ prefix.
mkdir -p "$TMP/core-worktree"
cp -R "$TMP/base" "$TMP/core-worktree/inner"
git -C "$TMP/core-worktree/inner" config core.worktree "$TMP/core-worktree"
git -C "$TMP/core-worktree/inner" add -A
fails_prefix core-worktree/inner "$IDENTITY" git-not-own

# The decoy repository tracks decoy-target.md, which the git-env-decoy tree's own index does not:
# a scan that reads the decoy's index wrongly accepts it.
fixture git-env-decoy
printf 'decoy\n' >"$TMP/git-env-decoy/decoy-target.md"
edit git-env-decoy "$ADR/0002-second.md" 's|^  - AGENTS.md$|  - decoy-target.md|'
cp -R "$TMP/git-env-decoy" "$TMP/decoy-index"
rm -rf "$TMP/decoy-index/.git"
git init -q "$TMP/decoy-index"
git -C "$TMP/decoy-index" add -A
git -C "$TMP/decoy-index" -c user.name=t -c user.email=t@t commit -q -m seed
UNDELIVERED="$ADR/0002-second.md:11: related path is not delivered by a tracked entry: decoy-target.md [related-undelivered]"

# Decoy GIT_DIR, GIT_INDEX_FILE and GIT_WORK_TREE values; a hook in a linked worktree exports GIT_DIR.
assert_case git-env-decoy 1 "$UNDELIVERED" "FAIL (1 violation(s))" GIT_DIR="$TMP/decoy-index/.git"
cp -R "$TMP/git-env-decoy" "$TMP/git-index-decoy"
assert_case git-index-decoy 1 "$UNDELIVERED" "FAIL (1 violation(s))" GIT_INDEX_FILE="$TMP/decoy-index/.git/index"
fixture git-work-tree-decoy
assert_case git-work-tree-decoy 0 "$OK" "OK" GIT_WORK_TREE="$TMP/decoy-index"

# Under a sparse index ls-files expands collapsed directories from the object store, which
# GIT_COMMON_DIR would move: an empty store drops notes/n.md from the index the gate reads.
fixture git-common-dir-decoy
mkdir -p "$TMP/git-common-dir-decoy/notes"
printf 'note\n' >"$TMP/git-common-dir-decoy/notes/n.md"
edit git-common-dir-decoy "$ADR/0002-second.md" 's|^  - AGENTS.md$|  - notes/n.md|'
git -C "$TMP/git-common-dir-decoy" add -A
git -C "$TMP/git-common-dir-decoy" write-tree >/dev/null
git -C "$TMP/git-common-dir-decoy" sparse-checkout set --cone --sparse-index docs
# The sparse checkout removed notes/ from disk; the gate also needs the file to exist.
mkdir -p "$TMP/git-common-dir-decoy/notes"
printf 'note\n' >"$TMP/git-common-dir-decoy/notes/n.md"
git init -q --bare "$TMP/empty-common.git"
assert_case git-common-dir-decoy 0 "$OK" "OK" GIT_COMMON_DIR="$TMP/empty-common.git"

# A .git gitfile or symlink to another repository makes git read that repository's index.
cp -R "$TMP/git-env-decoy" "$TMP/gitfile-foreign"
rm -rf "$TMP/gitfile-foreign/.git"
printf 'gitdir: %s\n' "$TMP/decoy-index/.git" >"$TMP/gitfile-foreign/.git"
fails_prefix gitfile-foreign "$IDENTITY" git-not-own

cp -R "$TMP/git-env-decoy" "$TMP/gitlink-foreign"
rm -rf "$TMP/gitlink-foreign/.git"
ln -s "$TMP/decoy-index/.git" "$TMP/gitlink-foreign/.git"
fails_prefix gitlink-foreign "$IDENTITY" git-not-own

# A back-pointer file planted in another repository's own git dir; git writes one only under
# <common dir>/worktrees/.
cp -R "$TMP/decoy-index" "$TMP/planted-index"
cp -R "$TMP/git-env-decoy" "$TMP/gitfile-planted"
rm -rf "$TMP/gitfile-planted/.git"
printf 'gitdir: %s\n' "$TMP/planted-index/.git" >"$TMP/gitfile-planted/.git"
printf '%s\n' "$TMP/gitfile-planted/.git" >"$TMP/planted-index/.git/gitdir"
fails_prefix gitfile-planted "$IDENTITY" git-not-own

# Linked worktrees with an absolute and a relative back-pointer, then a copied and a moved one. The
# relative pointer is written by hand, in the form worktree.useRelativePaths writes, so any git
# exercises it (that setting is recent).
git -C "$TMP/decoy-index" worktree add -q --detach "$TMP/linked-worktree"
assert_case linked-worktree 0 "$OK" "OK"
git -C "$TMP/decoy-index" worktree add -q --detach "$TMP/linked-worktree-relative"
printf '../../../../linked-worktree-relative/.git\n' \
  >"$(git -C "$TMP/linked-worktree-relative" rev-parse --absolute-git-dir)/gitdir"
assert_case linked-worktree-relative 0 "$OK" "OK"
cp -R "$TMP/linked-worktree" "$TMP/copied-worktree"
fails_prefix copied-worktree "$IDENTITY" git-not-own
git -C "$TMP/decoy-index" worktree add -q --detach "$TMP/moved-from"
mv "$TMP/moved-from" "$TMP/moved-worktree"
fails_prefix moved-worktree "$IDENTITY" git-not-own
git -C "$TMP/decoy-index" worktree add -q --detach "$TMP/linked-worktree-unreadable"
fault read-back-pointer readFileSync /gitdir
fails_under linked-worktree-unreadable read-back-pointer ".:1: git is required to verify related paths: EIO: i/o error, readFileSync [git-failed]"

# A .git symlink to the tree's own worktree registration, whose back-pointer names this .git.
git -C "$TMP/decoy-index" worktree add -q --detach "$TMP/linked-worktree-symlink"
symlink_gitdir="$(git -C "$TMP/linked-worktree-symlink" rev-parse --absolute-git-dir)"
rm "$TMP/linked-worktree-symlink/.git"
ln -s "$symlink_gitdir" "$TMP/linked-worktree-symlink/.git"
fails_prefix linked-worktree-symlink "$IDENTITY" git-not-own

# A --separate-git-dir checkout and a submodule keep their git dir outside the tree, in no
# worktree registration.
fixture separate-git-dir
rm -rf "$TMP/separate-git-dir/.git"
git init -q --separate-git-dir "$TMP/separate.git" "$TMP/separate-git-dir"
git -C "$TMP/separate-git-dir" add -A
fails_prefix separate-git-dir "$IDENTITY" git-not-own

git init -q "$TMP/super"
git -C "$TMP/super" -c protocol.file.allow=always submodule add -q "$TMP/decoy-index" sub
fails_prefix super/sub "$IDENTITY" git-not-own

# A repository git refuses as dubiously owned (git's test knob stands in for another owner). The
# caller's environment could trust the repository (a global or command-line safe.directory),
# translate the refusal or print a trace ahead of it, so the scan runs in an empty environment but
# PATH. Git then still reads the system config file, where GitHub's runner image trusts every
# directory, hence GIT_CONFIG_NOSYSTEM.
fixture dubious-ownership
assert_prefix dubious-ownership 1 "${GIT_REQUIRED}fatal: detected dubious ownership in repository at" git-failed \
  "check-adr-frontmatter: FAIL (1 violation(s))" -i PATH="$(dirname "$BUN_EXEC"):$PATH" GIT_TEST_ASSUME_DIFFERENT_OWNER=1 GIT_CONFIG_NOSYSTEM=1

# The gate launched from a subdirectory.
subdir_rc=0
subdir_out="$(cd "$TMP/base/docs" && ADR_FRONTMATTER_ROOT="$TMP/base" bun "${GATE[@]}" "$SCANNER" 2>&1)" || subdir_rc=$?
if [[ "$subdir_rc" -eq 0 ]] && has_line "$subdir_out" "$OK"; then
  pass subdir-cwd ""
else
  miss subdir-cwd "rc=$subdir_rc" "$subdir_out"
fi

# Related paths spelled with the wrong case.
fixture related-wrong-case
edit related-wrong-case "$ADR/0002-second.md" 's|^  - AGENTS.md$|  - agents.md|'
fails related-wrong-case "$ADR/0002-second.md:11: related path does not match the spelling in its directory: agents.md [related-spelling]"

fixture related-wrong-case-parent
edit related-wrong-case-parent "$ADR/0002-second.md" 's|^  - AGENTS.md$|  - Docs/kit/architecture/index.md|'
fails related-wrong-case-parent "$ADR/0002-second.md:11: related path does not match the spelling in its directory: Docs/kit/architecture/index.md [related-spelling]"

# A trailing slash on a tracked file, and on a tracked file the worktree replaced with a directory.
fixture related-trailing-slash-file
edit related-trailing-slash-file "$ADR/0002-second.md" 's|^  - AGENTS.md$|  - AGENTS.md/|'
fails related-trailing-slash-file "$ADR/0002-second.md:11: related path ends with / but is not a directory: AGENTS.md/ [related-slash]"

fixture related-trailing-slash-index-file
printf 'file\n' >"$TMP/related-trailing-slash-index-file/notes"
git -C "$TMP/related-trailing-slash-index-file" add notes
rm "$TMP/related-trailing-slash-index-file/notes"
mkdir -p "$TMP/related-trailing-slash-index-file/notes"
printf 'loose\n' >"$TMP/related-trailing-slash-index-file/notes/x.md"
edit related-trailing-slash-index-file "$ADR/0002-second.md" 's|^  - AGENTS.md$|  - notes/|'
fails related-trailing-slash-index-file "$ADR/0002-second.md:11: related path ends with / but is not a directory: notes/ [related-slash]"

# A trailing slash on an untracked file.
fixture related-trailing-slash-untracked
printf 'loose\n' >"$TMP/related-trailing-slash-untracked/u.md"
edit related-trailing-slash-untracked "$ADR/0002-second.md" 's|^  - AGENTS.md$|  - u.md/|'
fails related-trailing-slash-untracked "$ADR/0002-second.md:11: related path is not delivered by a tracked entry: u.md/ [related-undelivered]"

# A substitution that matches nothing, given to the edit helper.
fixture edit-no-match
edit_rc=0
edit edit-no-match "$ADR/0001-axis.md" 's/this pattern matches nothing//' 2>"$TMP/edit-no-match.err" || edit_rc=$?
if [[ "$edit_rc" -ne 0 ]] && grep -q 'edit made no change' "$TMP/edit-no-match.err"; then
  pass edit-no-match ""
else
  miss edit-no-match "a nonmatching edit exited $edit_rc" ""
fi

# Bun.YAML.parse removed by a --preload stub. The expected name is read from the package.json the
# scanner reads, so a Bun bump needs no second edit here.
printf 'globalThis.Bun.YAML.parse = undefined\n' >"$TMP/strip-yaml.ts"
package_bun="$(bun -e 'process.stdout.write(String(JSON.parse(require("node:fs").readFileSync(process.argv[1], "utf8")).packageManager))' "$ROOT/package.json")"
fixture missing-bun-yaml
fails_exactly missing-bun-yaml ".:1: Bun.YAML.parse is unavailable; this gate needs the packageManager Bun (${package_bun}) [bun-yaml]" strip-yaml

# A package.json that cannot be read.
fault strip-yaml-no-package readFileSync /package.json
printf 'globalThis.Bun.YAML.parse = undefined\n' >>"$TMP/strip-yaml-no-package.ts"
fixture missing-bun-yaml-package
fails_exactly missing-bun-yaml-package ".:1: Bun.YAML.parse is unavailable; this gate needs the packageManager Bun (unreadable: EIO: i/o error, readFileSync) [bun-yaml]" strip-yaml-no-package

# A cwd .env and a cwd bunfig preload, under the package.json launch flags.
assert_gate_launch ADR_FRONTMATTER_ROOT "$TMP/related-untracked" \
  "$ADR/0002-second.md:11: related path is not delivered by a tracked entry: loose.md [related-undelivered]"
assert_gate_requires_install doc:check \
  'check-adr-frontmatter: yaml is not installed; run bun install'
assert_gate_rethrows_yaml_initialization doc:check \
  'check-adr-frontmatter: yaml is not installed; run bun install'



# Census — the scanner's RULES, read with the gate's launch flags, and each id's report sites: the
# string literals equal to it in the scanner's syntax tree outside the RULES declaration. An id fails
# unless it has exactly one site and a passing case above credits it. A RULES or a syntax tree that
# cannot be read fails the census.
census_rc=0
census="$(cd "$ROOT" && ADR_SCANNER="$SCANNER" bun "${GATE[@]}" -e '
  import { API } from "typescript/unstable/async"
  import { SyntaxKind } from "typescript/unstable/ast"
  const scanner = process.env.ADR_SCANNER
  const { RULES } = await import(scanner)
  if (!Array.isArray(RULES) || RULES.length === 0) throw new Error("RULES is empty")
  const api = new API({ cwd: process.cwd() })
  try {
    const snapshot = await api.updateSnapshot({ openFiles: [scanner] })
    const project = await snapshot.getDefaultProjectForFile(scanner)
    const source = await project?.program.getSourceFile(scanner)
    if (source === undefined) throw new Error(`no syntax tree for ${scanner}`)
    const sites = new Map(RULES.map((id) => [id, 0]))
    let declarations = 0
    const visit = (node) => {
      if (node.kind === SyntaxKind.VariableDeclaration && node.name?.text === "RULES") {
        declarations += 1
        return
      }
      const literal =
        node.kind === SyntaxKind.StringLiteral ||
        node.kind === SyntaxKind.NoSubstitutionTemplateLiteral
      if (literal && sites.has(node.text)) sites.set(node.text, sites.get(node.text) + 1)
      node.forEachChild(visit)
    }
    visit(source)
    if (declarations !== 1) throw new Error(`${declarations} RULES declarations in the syntax tree`)
    for (const [id, count] of sites) console.log(`${id} ${count}`)
  } finally {
    await api.close()
  }
')" || census_rc=$?
if [[ "$census_rc" -ne 0 || -z "$census" ]]; then
  miss census "cannot read RULES or the syntax tree of $SCANNER (rc=$census_rc)" "$census"
else
  census_fails=0
  while read -r id sites; do
    if [[ "$sites" -ne 1 ]]; then
      echo "FAIL: census: rule $id has $sites report sites, not 1" >&2
      census_fails=$((census_fails + 1))
    fi
    if ! grep -qxF -- "$id" "$TMP/census.ids"; then
      echo "FAIL: census: no case reports rule $id" >&2
      census_fails=$((census_fails + 1))
    fi
  done <<<"$census"
  if [[ "$census_fails" -eq 0 ]]; then
    pass census ""
  else
    FAIL=$((FAIL + census_fails))
  fi
fi

echo "== ADR frontmatter summary: $PASS pass, $FAIL fail, $SKIP skip =="
[[ "$FAIL" -eq 0 ]]
