---
title: "Plan: extract honours product identity (ADR-0009 D5)"
issue: 156
spec: artifacts/specs/156-3-exception-extract-dry-run-attendre-le-kit-spec.md
complexity: 4/10
tier: F-lite
generated: "2026-08-24T20:30:00Z"
normative: false
---

## Summary

Wire `scripts/kit/extract-dry-run.sh` to the ADR-0009 D5 tree classifier (same signal as `check-zero-edit-zones.sh`), not a homegrown `EXTRACT_MODE` default. **Kit** trees keep fail-closed example-app allowlist; **product** trees allow any non-example app under `apps/` without patching the gate or a zero-edit exception. Unclassified trees fail closed with the same actionable remedy. `EXTRACT_MODE` becomes harness-only behind `EXTRACT_HARNESS_SENTINEL` (mirror `ZERO_EDIT_MODE` discipline). Residency (`extract-residency.ts`) and compose proof (`extract-compose-proof.ts`) stay untouched. No product extract exception register.

One F-lite PR, TDD waves, shared classifier module to prevent drift with zero-edit.

## Architecture links

- **ADR:** [`docs/kit/architecture/adr/0009-kit-namespace-polarity-inheritance-marker.md`](../../docs/kit/architecture/adr/0009-kit-namespace-polarity-inheritance-marker.md) (D5 mode detection)
- **Contract:** [`docs/kit/product-consumer-contract.md`](../../docs/kit/product-consumer-contract.md) (kit vs product apps)
- **Spec:** [156 spec](../specs/156-3-exception-extract-dry-run-attendre-le-kit-spec.md)
- **Predecessor:** #144 extract bar (allowlist, residency, compose) — behaviour preserved except identity branching

```text
config/kit/zero-edit-zones.json
  → resolve-tree-identity.mjs (ADR-0009 D5)
       kit | product | die(unclassified)
  → extract-dry-run.sh
       kit     → example-app allowlist gate
       product → skip allowlist; product apps OK
       harness EXTRACT_MODE only with EXTRACT_HARNESS_SENTINEL
       → banlist (unchanged)
       → package import smoke (unchanged)
       → extract-residency.ts (unchanged)
       → extract-compose-proof.ts (unchanged)
  → test-extract-dry-run.sh (temp-git matrix)
  → validate:full (unchanged wiring — already runs extract + test:extract-dry-run)
```

### File × Function Map

| File | Symbols / role | Callers |
|------|----------------|---------|
| `scripts/kit/resolve-tree-identity.mjs` | `resolveTreeIdentity({ root, modeEnv, harnessSentinel })` → `{ mode, identity, reason? }` | **new** — shared by extract + (optional later) zero-edit refactor |
| `scripts/kit/check-zero-edit-zones.sh` | inline D5 today | `zero-edit`, lefthook, `validate:full` |
| `scripts/kit/extract-dry-run.sh` | `KIT_APP_ALLOW`, allowlist gate, `EXTRACT_MODE` | `extract-dry-run`, `validate`, `validate:full` |
| `scripts/kit/extract-residency.ts` | kit-table / org-policy scan | extract-dry-run |
| `scripts/kit/extract-compose-proof.ts` | temp compose proof | extract-dry-run |
| `scripts/kit/test-extract-dry-run.sh` | `make_repo`, `assert_exit`, allowlist helper | `test:extract-dry-run` |
| `config/kit/zero-edit-zones.json` | `kit_origin_allowlist`, `inheritance_file` | classifier |
| `package.json` | `extract-dry-run`, `test:extract-dry-run` in `validate:full` | lefthook pre-push, CI |
| `docs/kit/testing.md` | CP-EXTRACT row (identity note) | bar inventory |

## Bootstrap Context

- Frame: none (F-lite). Spec is normative.
- After #144, `extract-dry-run.sh` defaults `EXTRACT_MODE=kit` and hardcodes `apps/share-api` / `apps/share-web` as product probes — violates AC 1, 3, 5.
- Zero-edit already implements D5 in embedded Node (`check-zero-edit-zones.sh` L150–180) with `isFreeProductAppPath` complement logic (L256–263).
- Kit example set SSoT: `example-api`, `example-web`, `example-web-branded`, `mcp-example` (already in `KIT_APP_ALLOW` + test helper).
- `EXTRACT_MODE=mono` today bypasses allowlist — must not be reachable on lefthook/CI without sentinel (AC 4).

## Agents

| Agent | Task count | Files |
|-------|-----------|-------|
| tester-A | 4 (T1, T5, T6, T7) | `scripts/kit/test-extract-dry-run.sh` |
| devops-A | 3 (T2, T3, T4) | `scripts/kit/resolve-tree-identity.mjs`, `extract-dry-run.sh` |
| doc-writer-A | 1 (T8) | `docs/kit/testing.md` |

## Wave Structure

4 waves, max 2 parallel agents. Sequential wall-clock ~1 session.

| Wave | Trigger | Agents | Tasks |
|------|---------|--------|-------|
| 1 | start | 2 ∥ | tester-A: T1 · devops-A: T2 |
| 2 | Wave 1 done | 1 | devops-A: T3 → T4 |
| 3 | Wave 2 done | 1 | tester-A: T5 → T6 → T7 |
| 4 | Wave 3 done | 1 | doc-writer-A: T8 |

### Budget — per task

| Task | Items | Class | Est. ops | Split? |
|------|-------|-------|----------|--------|
| T1 RED harness matrix skeleton | 1 | bounded | 4 | — |
| T2 shared D5 classifier module | 1 | judgmental | 6 | — |
| T3 extract wires classifier + product allow | 1 | judgmental | 5 | — |
| T4 EXTRACT_MODE sentinel gate | 1 | bounded | 3 | — |
| T5 GREEN product-tree pass | 1 | judgmental | 4 | — |
| T6 GREEN kit-tree + override negatives | 1 | judgmental | 5 | — |
| T7 RED-GATE harness self-test | 1 | trivial | 1 | — |
| T8 CP-EXTRACT docs note | 1 | bounded | 2 | — |

**Total estimated ops: 30**

## Consistency Report

| Acceptance | Plan coverage |
|------------|---------------|
| AC1 Product tree + product apps passes | T2–T5 (classifier `product`, skip kit allowlist) |
| AC2 Kit tree + stray app fails | T3, T6 |
| AC3 Harness “force kit” on product tree still fails on product apps | T4, T6 |
| AC4 Permissive override on kit tree blocked without sentinel | T4, T6 |
| AC5 Complement-of-examples, not product-name enum | T2 (`isKitExampleApp`), T5 (generic `acme-api`) |
| AC6 Residency + compose unchanged | explicit non-goals in T3; no edits to `extract-residency.ts` / `extract-compose-proof.ts` |
| AC7 Single `validate:full` bar | T7 verifies existing wiring; no new script entry |

- Criteria covered: 7/7
- Uncovered criteria: none
- Tasks without spec backing: none
- Gold plating exemptions applied: 0 (no exception register, no zero-edit refactor unless trivial import)

## Phased Steps (Acceptance-tied)

### Phase 1 — Shared identity (AC 5, unclassified fail-closed)

**Goal:** One ADR-0009 D5 classifier; product app = any `apps/*` dir not in the kit example set.

- **T2:** Extract D5 resolution from `check-zero-edit-zones.sh` into `scripts/kit/resolve-tree-identity.mjs` (read `zero-edit-zones.json`, inheritance marker, allowlist, harness env). Export `isKitExampleApp(name)` as complement logic.
- **Verify:** `node scripts/kit/resolve-tree-identity.mjs` on live kit HEAD → `mode=kit`.
- **Traces:** AC5, invariant 3 (one identity)

### Phase 2 — Extract gate branching (AC 1, AC 2)

**Goal:** Classified mode drives allowlist, not `EXTRACT_MODE` default.

- **T3:** `extract-dry-run.sh` calls classifier; run kit allowlist only when `mode=kit`; remove hardcoded `apps/share-*` probe loop; product mode logs product apps as expected.
- **T5:** Temp-git fixture: `config/product/inheritance.json` + `apps/acme-api/` + examples only → extract allowlist section passes (exit 0 through allowlist stage).
- **T6:** Temp-git kit fixture: `apps/acme-api/` on allowlisted origin, no marker → allowlist exit ≠ 0.
- **Traces:** AC1, AC2, invariant 2 + 4

### Phase 3 — Harness override discipline (AC 3, AC 4)

**Goal:** `EXTRACT_MODE` / equivalent forbidden on normal path; audit overrides fail correctly.

- **T4:** Mirror zero-edit: if `EXTRACT_MODE` set without `EXTRACT_HARNESS_SENTINEL` file → die. Sentinel present → honour override for audit only.
- **T6 (cont.):** Product tree + harness `EXTRACT_MODE=kit` + sentinel → still fails on `apps/acme-api`. Kit tree + `EXTRACT_MODE=mono` without sentinel → die (not green).
- **Traces:** AC3, AC4, invariant 4

### Phase 4 — Proof + docs (AC 6, AC 7)

**Goal:** Residency/compose untouched; bar inventory accurate.

- **T7:** `bun run test:extract-dry-run` green; confirm `validate:full` still lists `extract-dry-run` + `test:extract-dry-run` (no duplicate bar).
- **T8:** Update CP-EXTRACT row in `docs/kit/testing.md`: identity = ADR-0009 D5; product apps allowed on product trees; harness sentinel for `EXTRACT_MODE`.
- **Traces:** AC6, AC7

## Micro-Tasks

### Slice V1: Classifier + extract wiring

#### Task 1: Write RED temp-git harness skeleton [P] → tester-A
- **File:** `scripts/kit/test-extract-dry-run.sh`
- **Snippet:** Add `make_repo` (from `test-deny-upstream.sh`); cases stubbed for product-pass / kit-fail / override-fail (expect ≠ 0 until T2–T4).
- **Verify:** `test -f scripts/kit/test-extract-dry-run.sh && grep -q 'make_repo' scripts/kit/test-extract-dry-run.sh`
- **Expected:** existing residency cases still pass; new cases RED
- **Time:** 10 min | **Difficulty:** 3
- **Traces:** T1, AC1/AC2 | **Phase:** RED

#### Task 2: Shared `resolve-tree-identity.mjs` → devops-A
- **File:** `scripts/kit/resolve-tree-identity.mjs`
- **Snippet:** Port D5 from `check-zero-edit-zones.sh` (marker, allowlist, `ZERO_EDIT_MODE` harness pattern → `EXTRACT_MODE` param). Export `isKitExampleApp`, `KIT_EXAMPLE_APPS`.
- **Verify:** `node -e "import('./scripts/kit/resolve-tree-identity.mjs').then(m => m.resolveTreeIdentity({root:'.'}))"` prints `mode kit` on live tree
- **Expected:** parity with zero-edit classification on kit HEAD
- **Time:** 20 min | **Difficulty:** 4
- **Traces:** T2, AC5, inv 3 | **Phase:** GREEN

#### Task 3: Extract uses classifier for allowlist gate → devops-A
- **File:** `scripts/kit/extract-dry-run.sh`
- **Snippet:** Replace `MODE="${EXTRACT_MODE:-kit}"` default path with classifier output; gate block at L62–79 only when resolved `mode=kit`; delete `apps/share-api`/`share-web` hardcode (L81–95).
- **Verify:** `bash scripts/kit/extract-dry-run.sh` still OK on live kit tree
- **Expected:** kit HEAD unchanged behaviour
- **Time:** 15 min | **Difficulty:** 4
- **Traces:** T3, AC1/AC2 | **Phase:** GREEN

#### Task 4: `EXTRACT_HARNESS_SENTINEL` gate → devops-A
- **File:** `scripts/kit/extract-dry-run.sh`, `resolve-tree-identity.mjs`
- **Snippet:** Copy sentinel discipline from `ZERO_EDIT_HARNESS_SENTINEL`; document env names in script header; `mono`/`kit` override only when sentinel exists.
- **Verify:** `EXTRACT_MODE=mono bash scripts/kit/extract-dry-run.sh` exits ≠ 0 without sentinel
- **Expected:** fail-closed message mentions sentinel / ADR-0009 D5
- **Time:** 10 min | **Difficulty:** 3
- **Traces:** T4, AC3/AC4 | **Phase:** GREEN

### Slice V2: Harness matrix + docs

#### Task 5: GREEN product-tree pass case → tester-A
- **File:** `scripts/kit/test-extract-dry-run.sh`
- **Snippet:** Fixture: inheritance.json + `apps/acme-api` + minimal example-api tree; run classifier + `check_kit_allowlist` skipped / extract identity helper returns product.
- **Verify:** `bash scripts/kit/test-extract-dry-run.sh` → PASS for product case
- **Expected:** generic `acme-api` name (not share/lgu enum)
- **Time:** 12 min | **Difficulty:** 3
- **Traces:** T5, AC1/AC5 | **Phase:** GREEN

#### Task 6: GREEN kit-fail + override negatives → tester-A
- **File:** `scripts/kit/test-extract-dry-run.sh`
- **Snippet:** Kit fixture + `acme-api` → fail; product fixture + harness force-kit + sentinel → still fail; kit + `EXTRACT_MODE=mono` no sentinel → die.
- **Verify:** `bash scripts/kit/test-extract-dry-run.sh` all cases PASS
- **Expected:** 3 new negative oracles
- **Time:** 15 min | **Difficulty:** 4
- **Traces:** T6, AC2/AC3/AC4 | **Phase:** GREEN

#### Task 7: RED-GATE self-test entry → tester-A
- **File:** (read-only) `package.json`
- **Snippet:** none — confirm `test:extract-dry-run` already in `validate:full`; run `bun run test:extract-dry-run`.
- **Verify:** `bun run test:extract-dry-run` exit 0
- **Expected:** no new package.json script needed
- **Time:** 3 min | **Difficulty:** 1
- **Traces:** T7, AC7 | **Phase:** GREEN

#### Task 8: CP-EXTRACT docs note → doc-writer-A
- **File:** `docs/kit/testing.md`
- **Snippet:** CP-EXTRACT row: product identity via ADR-0009 D5; example-app allowlist kit-only; `EXTRACT_HARNESS_SENTINEL` for audit overrides.
- **Verify:** `grep -q 'ADR-0009' docs/kit/testing.md`
- **Expected:** no second bar documented
- **Time:** 8 min | **Difficulty:** 2
- **Traces:** T8, AC6/AC7 | **Phase:** GREEN

## Task Seeding Blueprint

### Wave 1 — no deps, 2 agents ∥

| Task | Agent instance | blockedBy | Subject |
|------|---------------|-----------|---------|
| T1 | tester-A | — | harness |
| T2 | devops-A | — | classifier |

### Wave 2 — after Wave 1, 1 agent

| Task | Agent instance | blockedBy | Subject |
|------|---------------|-----------|---------|
| T3 | devops-A | T2 | extract |
| T4 | devops-A | T3 | extract |

### Wave 3 — after Wave 2, 1 agent

| Task | Agent instance | blockedBy | Subject |
|------|---------------|-----------|---------|
| T5 | tester-A | T3 | harness |
| T6 | tester-A | T4,T5 | harness |
| T7 | tester-A | T6 | gate |

### Wave 4 — after Wave 3, 1 agent

| Task | Agent instance | blockedBy | Subject |
|------|---------------|-----------|---------|
| T8 | doc-writer-A | T7 | docs |

## Ref patterns

- Harness: `scripts/kit/test-deny-upstream.sh` (`make_repo`, `assert_exit`, unset `GIT_*`)
- Classifier: `scripts/kit/check-zero-edit-zones.sh` D5 block (L150–180)
- Product-app complement: `isFreeProductAppPath` (L256–263)
- Sentinel: `ZERO_EDIT_HARNESS_SENTINEL` in `check-zero-edit-zones.sh`
- Example set: `KIT_APP_ALLOW` in `extract-dry-run.sh` L55–60

## Red-team residuals (already priced)

| Attack | Plan response |
|--------|----------------|
| Product tree greens by renaming to `share-*` | T5 uses `acme-api` (AC5) |
| Marker without allowlist check → silent kit | T2 full D5 port |
| `EXTRACT_MODE=mono` on CI greens kit + product app | T4 sentinel + T6 |
| Harness force-kit on product tree hides product apps | T6 override audit case (AC3) |
| Drift between zero-edit and extract classifiers | T2 shared module (optional follow-up: wire zero-edit to import) |
| Editing residency/compose to “fix” product pass | Out of scope; T3 touches only allowlist branch |

## Task IDs

- T1: T1 — harness RED skeleton
- T2: T2 — resolve-tree-identity.mjs
- T3: T3 — extract classifier wiring
- T4: T4 — EXTRACT_HARNESS_SENTINEL
- T5: T5 — product-tree GREEN
- T6: T6 — kit-fail + override negatives
- T7: T7 — test:extract-dry-run gate
- T8: T8 — testing.md CP-EXTRACT
