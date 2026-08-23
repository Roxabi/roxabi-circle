---
title: "Plan: product-owned file-length exemption surface"
issue: 118
spec: artifacts/specs/118-file-length-exemption-surface-spec.md
complexity: 4/10
tier: F-lite
generated: "2026-08-22T20:00:00Z"
---

## Summary

Add a product-owned register at `config/product/file_exemptions.txt`, merge it with the kit register inside `tools/check_file_length.sh`, and fail closed on kit paths, cap-less lines, globs, non-canonical paths, and duplicates. Prove it with a temp-git CP-FILE-LENGTH harness. Document both surfaces.

## Architecture

### Data Flow

```text
qg.conf defaults
  → check_file_length.sh
       G1  load kit: always tools/file_exemptions.txt (live)
       G2  load product worktree file if present
       G3  validate every product $1 (predicate, cap, canonical, unique, no kit-dup)
       G4  apply set: staged=index / tree=worktree
           mktemp union → EXEMPT_FILE → is_exempt / exempt_cap
       G5|G6  scan staged TS or tree
  → leftover: MODE=staged + env -u other QG_FILE_*
  → quality-gates:check: MODE=tree + env -u
  → test-file-length.sh: temp git repo + QG_FILE_HARNESS_SENTINEL
```

Kit invoke sites never set `QG_FILE_MAX` / `QG_FILE_EXEMPTIONS`. Harness may set them only after creating a sentinel file (copy `ZERO_EDIT_HARNESS_SENTINEL`).

### File × Function Map

| File | Symbols / role | Callers |
|------|----------------|---------|
| `tools/check_file_length.sh` | `product_app_ok`, `validate_product_file`, `product_apply_lines`, `merge_registers`, existing `check_one_file` / `scan_*` | leftover, `quality-gates:check`, T1 harness |
| `tools/check_lib.sh` | `is_exempt`, `exempt_cap`, `assert_exempt_no_spaces` | **do not edit** |
| `tools/qg.conf` | `QG_FILE_PRODUCT_EXEMPTIONS:=config/product/file_exemptions.txt` | sourced by checker |
| `scripts/kit/test-file-length.sh` | `make_repo`, `assert_exit`, matrix | `bun run test:file-length` |
| `lefthook.yml` | file-length `env -u` + comment | pre-commit |
| `package.json` | `test:file-length`, `validate:full` entry | leftover pre-push, CI |
| `docs/kit/product-consumer-contract.md` | optional-files list + config table + one-commit cutover | humans / products |
| `.claude/stack.yml` | `product_exemptions_file` | agents |
| `config/kit/file_exemptions.example.txt` | commented `apps/<product>-web/...` line | copy source |
| `docs/kit/testing.md` | CP-FILE-LENGTH row | bar inventory |

## Bootstrap Context

No analysis artifact (F-lite). Frame + spec are the source. Advisory invariant already priced: product surface may never exempt kit paths (`packages/`, `apps/example-*`, `tools/`). Enforcement is in `check_file_length.sh` G3, not docs.

## Agents

| Agent | Task count | Files |
|-------|-----------|-------|
| tester-A | 3 (T1, T5, T6) | `scripts/kit/test-file-length.sh` |
| devops-A | 3 (T2–T4) | `tools/check_file_length.sh` |
| devops-B | 2 (T7, T10) | `lefthook.yml`, `tools/qg.conf`, `package.json` |
| doc-writer-A | 2 (T8, T9) | contract, `stack.yml`, example, `testing.md` |

## Wave Structure

4 waves, max 2 parallel agents. Sequential wall-clock ~1 session.

| Wave | Trigger | Agents | Tasks |
|------|---------|--------|-------|
| 1 | start | 2 ∥ | tester-A: T1 · doc-writer-A: T8 |
| 2 | Wave 1 done | 1 | devops-A: T2→T3→T4 |
| 3 | Wave 2 done | 2 ∥ | tester-A: T5→T6 · devops-B: T7 · doc-writer-A: T9 |
| 4 | Wave 3 done | 1 | devops-B: T10 |

### Budget — per task

| Task | Items | Class | Est. ops | Split? |
|------|-------|-------|----------|--------|
| T1 RED harness skeleton | 1 | bounded | 3 | — |
| T2 predicate + G3 | 1 | judgmental | 5 | — |
| T3 merge + apply set | 1 | judgmental | 6 | — |
| T4 sentinel + live unset | 1 | bounded | 3 | — |
| T5 GREEN matrix | 1 | judgmental | 5 | — |
| T6 RED-GATE V1 | 1 | trivial | 1 | — |
| T7 leftover + qg.conf | 1 | bounded | 3 | — |
| T8 contract cutover | 1 | bounded | 3 | — |
| T9 stack + example + CP row | 1 | bounded | 3 | — |
| T10 package.json wire | 1 | trivial | 2 | — |

**Total estimated ops: 34**

### Budget — per agent instance

| Instance | Tasks | Σ ops | Subjects | Split? |
|----------|-------|-------|----------|--------|
| tester-A | T1, T5, T6 | 9 | harness | — |
| devops-A | T2, T3, T4 | 14 | checker | — |
| devops-B | T7, T10 | 5 | invoke | — |
| doc-writer-A | T8, T9 | 6 | docs | — |

## Consistency Report

- Criteria covered: 18/18
- Uncovered criteria: none
- Tasks without spec backing: none
- Gold plating exemptions applied: 0

SC map: T2+T3 → SC allow / kit-path / cap / wildcard / dup / canonical / over-cap / missing file / check_lib untouched / folder-size untouched. T4+T7 → live kit register pinned. T5 → CP matrix + staged-empty + unstaged apply. T8+T9 → contract, example, cutover, stack.yml. T10 → `validate:full` only.

## Micro-Tasks

Planning **all** slices (V1→V2→V3). Single feature; V2/V3 are wiring, not independent products.

### Slice V1: Checker merge + fail-closed validation

#### Task 1: Write RED temp-git harness skeleton [P] → tester-A
- **File:** `scripts/kit/test-file-length.sh`
- **Snippet:** `make_repo` + `assert_exit` copied from `scripts/kit/test-deny-upstream.sh`; plant `apps/acme-web/src/god.tsx`; cases for kit-path / no-cap / `..` expected ≠ 0 (fail until T2–T4).
- **Verify:** `test -f scripts/kit/test-file-length.sh && grep -q 'make_repo' scripts/kit/test-file-length.sh` (ready)
- **Expected:** script exists; not yet wired into `package.json`
- **Time:** 8 min | **Difficulty:** 3
- **Traces:** T1, G3, SC kit-path / no-cap | **Phase:** RED
- **Subject:** harness

#### Task 2: Add product-app predicate + validate-before-scan → devops-A
- **File:** `tools/check_file_length.sh`
- **Snippet:** `product_app_ok` (`^apps/([^/]+)-(api|web|mcp)/`, name≠example, first≠mcp-example, reject `.`/`..`/`./`/`/`); `validate_product_file` on worktree file; run before `case "$MODE"`; cap regex `# *[0-9]+ *lines`.
- **Verify:** `grep -q 'product_app_ok' tools/check_file_length.sh && ! grep -q 'isFreeProductAppPath' tools/check_file_length.sh` (ready)
- **Expected:** G3 exists; `check_lib.sh` unchanged
- **Time:** 8 min | **Difficulty:** 4
- **Traces:** G3, SC allow / kit-path / cap / wildcard / canonical / dup | **Phase:** GREEN
- **Subject:** checker

#### Task 3: Merge temp + staged index apply set → devops-A
- **File:** `tools/check_file_length.sh`
- **Snippet:** apply set = `git show :config/product/file_exemptions.txt` when `MODE=staged`; tree = worktree; `mktemp` union; `trap 'rm -f "$MERGED"' EXIT`; `EXEMPT_FILE=$MERGED`; over-cap stderr names source register.
- **Verify:** `grep -q 'git show :' tools/check_file_length.sh && grep -q 'config/product/file_exemptions.txt' tools/check_file_length.sh` (ready)
- **Expected:** last-line-wins impossible (kit-dup rejected in T2); mktemp not leaked in errors
- **Time:** 8 min | **Difficulty:** 4
- **Traces:** G4, G5, G6, SC staged apply / over-cap message | **Phase:** GREEN
- **Subject:** checker

#### Task 4: Pin live kit register; honor QG_FILE_* only with sentinel → devops-A
- **File:** `tools/check_file_length.sh`
- **Snippet:** live: kit path hardcoded `tools/file_exemptions.txt`, product path hardcoded `config/product/file_exemptions.txt`. If any `QG_FILE_{MAX,EXEMPTIONS,ROOTS,PRODUCT_EXEMPTIONS}` differs from default, require `QG_FILE_HARNESS_SENTINEL` file exists (else die).
- **Verify:** `grep -q 'QG_FILE_HARNESS_SENTINEL' tools/check_file_length.sh` (ready)
- **Expected:** ambient `QG_FILE_EXEMPTIONS` without sentinel fails closed
- **Time:** 5 min | **Difficulty:** 3
- **Traces:** G1, G2, SC kit register stays | **Phase:** GREEN
- **Subject:** checker

#### RED-GATE: RED complete V1 → tester-A
- **Verify:** T1 exists; T2–T4 landed
- **Phase:** RED-GATE

### Slice V2: CP-FILE-LENGTH harness

#### Task 5: Fill GREEN matrix in temp git repo → tester-A
- **File:** `scripts/kit/test-file-length.sh`
- **Snippet:** full spec Tests table; `env -C "$TMP"` + abs path to live checker; create sentinel before `QG_FILE_*`; unset `GIT_DIR`/`GIT_WORK_TREE`/`GIT_COMMON_DIR`; never plant under live `apps/`/`packages/`.
- **Verify:** `bash scripts/kit/test-file-length.sh` (deferred until T2–T4)
- **Expected:** `CP-FILE-LENGTH: OK` / exit 0
- **Time:** 8 min | **Difficulty:** 3
- **Traces:** T1, SC CP matrix | **Phase:** GREEN
- **Subject:** harness

#### Task 6: RED-GATE V2 → tester-A
- **Verify:** `bash scripts/kit/test-file-length.sh` exits 0
- **Phase:** RED-GATE

### Slice V3: Contract + stack + example + bar wiring

#### Task 7: leftover env -u + qg.conf default [P] → devops-B
- **File:** `lefthook.yml`, `tools/qg.conf`, `package.json` (`quality-gates:check`)
- **Snippet:** leftover `env -u QG_FILE_EXEMPTIONS -u QG_FILE_MAX -u QG_FILE_ROOTS -u QG_FILE_PRODUCT_EXEMPTIONS QG_FILE_MODE=staged bash tools/check_file_length.sh`; same unset on `quality-gates:check`; qg.conf `:=config/product/file_exemptions.txt`; comment names both registers. Do not add test script to leftover.
- **Verify:** `grep -q 'QG_FILE_PRODUCT_EXEMPTIONS' tools/qg.conf && grep -q 'env -u QG_FILE_EXEMPTIONS' lefthook.yml` (ready)
- **Expected:** leftover still staged-only
- **Time:** 4 min | **Difficulty:** 2
- **Traces:** D2, D5 | **Phase:** GREEN
- **Subject:** invoke

#### Task 8: Consumer contract + one-commit cutover [P] → doc-writer-A
- **File:** `docs/kit/product-consumer-contract.md`
- **Snippet:** optional-files list + config table row; copy-from-example; one-commit delete kit rows + add product file; product-validate must not export `QG_FILE_MAX` / `QG_FILE_EXEMPTIONS`.
- **Verify:** `grep -q 'config/product/file_exemptions.txt' docs/kit/product-consumer-contract.md` (ready)
- **Expected:** both surfaces named; LGU/EtherOs cutover is docs-only
- **Time:** 5 min | **Difficulty:** 2
- **Traces:** D1, SC docs / cutover | **Phase:** GREEN
- **Subject:** docs

#### Task 9: stack.yml + example template + CP-FILE-LENGTH row → doc-writer-A
- **File:** `.claude/stack.yml`, `config/kit/file_exemptions.example.txt`, `docs/kit/testing.md`
- **Snippet:** `product_exemptions_file: config/product/file_exemptions.txt`; commented `apps/<product>-web/src/god.tsx  # 400 lines`; CP row names `bun run test:file-length`, `scripts/kit/test-file-length.sh`, `(in validate:full)` only.
- **Verify:** `grep -q 'product_exemptions_file' .claude/stack.yml && grep -q 'CP-FILE-LENGTH' docs/kit/testing.md && test -f config/kit/file_exemptions.example.txt` (ready)
- **Expected:** no live `config/product/file_exemptions.txt`; `.gitkeep` stays
- **Time:** 5 min | **Difficulty:** 2
- **Traces:** D2, D3, D4 | **Phase:** GREEN
- **Subject:** docs

#### Task 10: Wire test:file-length into validate:full → devops-B
- **File:** `package.json`
- **Snippet:** `"test:file-length": "bash scripts/kit/test-file-length.sh"` and add it to `validate:full` next to other `test:*` scripts. Do not add to short `validate`. Do not nest inside `quality-gates:check`.
- **Verify:** `grep -q 'test:file-length' package.json` (ready)
- **Expected:** `check-bar-ssot` still green (no copied step list in AGENTS/testing/lefthook)
- **Time:** 3 min | **Difficulty:** 1
- **Traces:** D4, SC validate:full | **Phase:** GREEN
- **Subject:** invoke

## Task Seeding Blueprint

<!-- Used by /implement to seed TaskCreate calls on session start. -->

### Wave 1 — no deps, 2 agents ∥

| Task | Agent instance | blockedBy | Subject |
|------|---------------|-----------|---------|
| T1 | tester-A | — | harness |
| T8 | doc-writer-A | — | docs |

### Wave 2 — after Wave 1, 1 agent

| Task | Agent instance | blockedBy | Subject |
|------|---------------|-----------|---------|
| T2 | devops-A | T1 | checker |
| T3 | devops-A | T2 | checker |
| T4 | devops-A | T3 | checker |

### Wave 3 — after Wave 2, 2 agents ∥

| Task | Agent instance | blockedBy | Subject |
|------|---------------|-----------|---------|
| T5 | tester-A | T4 | harness |
| T6 | tester-A | T5 | harness |
| T7 | devops-B | T4 | invoke |
| T9 | doc-writer-A | T8 | docs |

### Wave 4 — after Wave 3, 1 agent

| Task | Agent instance | blockedBy | Subject |
|------|---------------|-----------|---------|
| T10 | devops-B | T5,T7 | invoke |

## Ref patterns

- Harness: `scripts/kit/test-deny-upstream.sh` (`make_repo`, `assert_exit`, unset `GIT_*`)
- Sentinel: `scripts/kit/check-zero-edit-zones.sh` `ZERO_EDIT_HARNESS_SENTINEL`
- Exemption parse: `tools/check_lib.sh` `exempt_cap` (`# *[0-9]+ *lines`)
- Product-owned path: `config/product/inheritance.json` / `zero-edit-exceptions.json` polarity (ADR-0009)

## Red-team residuals (already priced)

| Attack | Plan response |
|--------|----------------|
| Product exempts `packages/` / `example-*` / `tools/` | T2 predicate + T5 oracles |
| `apps/example-web-branded` / unsuffixed `apps/acme/` | refused (not `isFreeProductAppPath`) |
| `apps/acme-web/../../packages/...` | T2 canonical reject |
| Unstaged product file greens leftover | T3 staged apply = index; T5 case |
| Ambient `QG_FILE_EXEMPTIONS` replaces kit register | T4 sentinel + T7 `env -u` |
| Over-cap message points at kit file | T3 names product register |
| Temp tree scans live index | T1/T5 `git init` fixture |

No better plan: folder-size is a sibling ticket; widening the allowlist to `isFreeProductAppPath` would violate the issue AC and the advisory you just got.

## Task IDs

<!-- Generated by /plan. Used by /implement to resume tasks on session restart. -->
- T1: T1 — harness
- T2: T2 — checker
- T3: T3 — checker
- T4: T4 — checker
- T5: T5 — harness
- T6: T6 — harness
- T7: T7 — invoke
- T8: T8 — docs
- T9: T9 — docs
- T10: T10 — invoke

