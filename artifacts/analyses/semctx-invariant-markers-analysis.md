---
title: "semctx invariant markers — feasibility measurements on packages/flows"
status: advisory
normative: false
date: 2026-08-09
subject: "packages/flows authority/grant/check/snapshot + semctx 0.1.17 strict tier"
---

> **Advisory only.** This file records *measurements*. It states no invariant and carries no
> authority. Every invariant referenced here is owned by
> [`ADR-0005 D4`](../../docs/architecture/adr/0005-flows-platform-agentic-workflows.md); the
> machine-readable encoding lives in `@invariant` markers in the source. If this file and the
> ADR disagree, the ADR wins and this file is stale.

## Question

Do semctx strict-tier rules catch anything real on this repo, and at what operating cost —
before considering any CI wiring?

## Method

Four functions annotated with `@invariant` markers restating cited ADR-0005 D4 lines. Symbol
bodies then touched with throwaway probes so the diff enters each symbol's line range, and
`semctx verify diff` run against the resulting working diff. Probes removed afterwards.

Tool: semctx **0.1.17**, CLI bundled with the plugin.

## Measurements

### M1 — comment-only diffs are inert

Adding the markers alone produced `changedSymbols: []`, `impactedInvariants: []`, verdict PASS.
A JSDoc block sits above the declaration, so it never enters the symbol's line range.

Consequence: annotating is a safe incremental operation — it cannot itself trip the gate.
Corollary: a PASS on a comment-only diff proves nothing.

### M2 — the strict tier fires, and discriminates

Before targeted tests existed, probing the four bodies:

| Symbol | Invariant status | Verdict |
|---|---|---|
| `checkPlan` | tested | — |
| `createRunSnapshot` | tested | — |
| `resolveEffectiveAuthority` | **inferred** | **BLOCK** |
| `parseCapabilityGrant` | **inferred** | **BLOCK** ×2 |

Two findings, both on the two uncovered symbols; the covered ones stayed silent. The gate is
selective, not a blanket blocker.

### M3 — coverage floors cannot see this class of gap

`packages/flows` before targeted tests: **87.5% stmts / 75.4% branch / 95.2% funcs / 87.5% lines**,
`test-coverage: OK`.

After adding 40 targeted tests: **identical figures**, to the decimal, across two runs.

`resolveEffectiveAuthority` and `parseCapabilityGrant` were already executed transitively through
`checkPlan`. They were covered in the *execution* sense and unasserted in the *behavioural* sense.
A percentage floor cannot separate those two things; semctx's `tested_by` link can.

This is the measurement that motivated the work, not the tooling.

### M4 — gap closed

After `authority.test.ts` (11 tests) and `grant.test.ts` (29 tests), re-probing the same four
bodies: all five invariants report `tested`, verdict **PASS**, zero findings.

`@kit/flows`: 41 → 81 tests.

### M5 — final state after follow-ups

Hardening `capabilityGrantSchema` and adding a sixth invariant on `verifyApiKey`
(ADR-0002 D6) brings the annotated set to **six invariants across five symbols**, all `tested`,
verdict PASS. `@kit/flows`: 84 tests. `flows` coverage moves to 87.7 / 76.1 / 95.3 / 87.7 —
the shift comes from the new source in `grant.ts`, not from the tests of M3.

## Operating costs found

| Cost | Detail |
|---|---|
| Version pinning is mandatory | An index written by CLI 0.1.16 is rejected by the 0.1.17 plugin (`binding: invalid`, `TOOL_VERSION_MISMATCH`). Use the plugin's bundled CLI; never `bunx semctx@latest`. |
| Index is local and gitignored | `.semctx/` is not tracked, so every clone must index. Any CI or product-fork wiring inherits that cost. |
| Coverage stays `partial` | 349 selected / 106 excluded under the current `include` globs; `NEGATIVE_COMPLETENESS_MISSING` is a standing reason code. |
| Pre-1.0 | 0.1.x, adapter boundary documented private/provisional. |

## Incidental findings

- **zod `.strict()` and `__proto__`** — an own `__proto__` key was not flagged as unknown, while a
  plain extra key was. No impact reached the parsed grant, but the gap was real.
  **Acted on:** `capabilityGrantSchema` now rejects prototype-shaped keys before the object stage;
  the test asserts rejection.
- **`packages/ui/src/paths-smoke.ts`** — fails coverage remapping (`RolldownError: Parse failed`)
  and is silently excluded from the coverage report. Pre-existing, from the ts-major batch
  (`48dd7e0`), unrelated to this work. **Filed as #46** — the failure *mode* (a file can leave
  coverage without reddening the gate) matters more than the file.

## Not concluded here

Whether semctx should become a gate in `validate:full` is not settled by these measurements and
is deliberately left open. The costs above — pinning, per-clone indexing, product-fork inheritance,
pre-1.0 status — are inputs to that decision, which belongs in an ADR if it is ever taken.
