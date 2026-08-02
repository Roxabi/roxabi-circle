---
title: "Layer import boundary gate (packages↛apps)"
issue: 69
status: approved
tier: F-lite
date: 2026-08-02
spark: 133
frame: artifacts/frames/69-layer-import-boundary-gate-frame.md
plan_ssot: plans/009-layer-import-gate.md
expert_review: "architect+doc-writer+product-lead+devops 2026-08-02 — workspace map includes apps, export-from+side-effect imports, self-test in validate:full, CP-IMPORT honesty draft, exact exemption path, exit 2 config, p95&lt;3s, single PR preferred"
---

## Context

- **Source:** approved frame `artifacts/frames/69-layer-import-boundary-gate-frame.md` (analyze skipped, F-lite)
- **SSoT plan:** `plans/009-layer-import-gate.md` (normative R1–R4, AC1–AC5, sequencing S1–S3)
- **Axial:** enforces ADR-0001 (packages compose apps) — machine gate, not a new axis
- **Siblings (orthogonal):** #19 B7 quality · #68 MCP agent contracts — no merge into those epics
- **Spark:** #133

## Goal

Ship a **seconds-class, deterministic** import-boundary scanner (R1–R4) wired into `validate:full` / pre-push, with synthetic failure proof, exemptions-with-reason, and an honest **CP-IMPORT** row in `docs/testing.md`.

**JTBD:** an agent (or human) that imports `apps/*` from `packages/*` (or example-web → example-api src / workers bindings) **fails the gate before merge**.

## Users

| Role | Need |
|------|------|
| Kit maintainer | Cannot merge packages→apps or web→api src by accident |
| Coding agent | Gate fails before push; clear violation listing |
| Product eng (consumer) | Kit packages stay free of app deps so extract/zero-edit stay meaningful |
| Reviewer / CI | CP-IMPORT documents Proves / Does not prove; same gate local + GH |

## Expected Behavior

1. **Scanner entry:** `bun run import-boundary` → `bun run scripts/check-import-boundaries.ts` (Bun-runnable; exit **0** clean, exit **1** on ≥1 non-exempt violation, exit **2** on invalid exemptions config).
2. **Walk scope (normative):** roots = **`packages/`** and **`apps/`** only — never `scripts/`, `tools/`, or fixture dirs. Source extensions: `.ts`, `.tsx`, `.js`, `.mjs`. Exclude `node_modules`, `dist`, `.wrangler`, coverage, and production-graph `*.test.ts` / `*.spec.ts`. Proof fixtures **must not** live under `packages|apps`.
3. **Import extraction:** static string literals only — value `from '…'`, `export … from '…'`, side-effect `import '…'`, `require('…')`, `import('…')`. No full type-checker resolve required for v1.
4. **Workspace resolve:** map every workspace `"name"` under **`packages/*` and `apps/*`** (e.g. `@gosilex/example-api`) → that package/app root. Subpaths (`@gosilex/feedback/react`) resolve by **longest name prefix**. Relative imports resolved against the importer file path (normalize `..` / `.`).
5. **R1 — packages ↛ apps (workspace):** any file under `packages/` whose resolved import target is under `apps/` → **violation**.
6. **R2 — packages ↛ apps (relative):** same, for relative path imports that resolve under `apps/`.
7. **R3 — example-web ↛ example-api src:** any file under `apps/example-web/` that imports a path resolving under `apps/example-api/` (workspace name or relative) → **violation**. HTTP client / public URL strings are fine.
8. **R4 — example-web ↛ workers bindings:** any file under `apps/example-web/` that imports `cloudflare:workers` (or clearly worker-only bare specifiers listed in the script’s constant table) → **violation**.
9. **R5 (out of v1 deliverable):** soft optional `routes/**` ↛ `repos/**` same-app — **not required** for SC; may land as follow-up if folder names are consistent.
10. **Exemptions:** `tools/import-boundary-exemptions.txt`. Each active line: **`exact relative importer path`** (v1; no globs unless documented later) + `  # reason — issue/ticket`. Lines without a non-empty reason after `#` → **exit 2**. Comments-only lines (`# …`) allowed. Prefer fixing the edge over permanent exempt.
11. **Report format:** list `RULE file:line → import` (line best-effort); summary count; **remediation footer** one-liner, e.g. `Fix: remove edge | tools/import-boundary-exemptions.txt  # reason — #issue`.
12. **Synthetic proof (AC1) — must run in the trusted chain:** either `bun test scripts/check-import-boundaries.test.ts` (or `import-boundary:self-test`) **included in `validate:full`**, or a deny-upstream-style harness that plants edges in a **temp dir** and asserts non-zero. Prefer temp dir over committed illegal sources. Live monorepo must stay green (AC2).
13. **`validate:full`:** include scan **and** self-test (placement: after `banlist` / with extract·zero-edit). Prefer **single PR** so the gate is not mergeable without the wire. Light `validate` need not include it (primary gate = pre-push `validate:full`). Standalone `import-boundary` for DX.
14. **`docs/testing.md`:** **CP-IMPORT** inventory + Proves / Does not prove (normative draft in § CP-IMPORT below).
15. **No new heavy deps:** Bun + regex/lightweight parse only (SC9).
16. **Clean main:** verify no R1–R4 violations; if latent edge found, **fix** preferred over exemption.
17. **Performance:** clean-tree scan target **p95 &lt; 3s** on kit laptop/CI (soft: log once if over; expect sub-second regex walk).

## Data Model & Consumers

Policy domain — entities are import edges and rules, not DB tables.

**Data structure:** [Import edge + rules layered model](../visuals/69-layer-import-boundary-gate-data-model.html)  
**Consumer map:** [Who consumes the import boundary](../visuals/69-layer-import-boundary-gate-consumers.html)

| Consumer | Facts consumed | When | Status |
|----------|----------------|------|--------|
| Kit maintainer / agent | violation list R1–R4 | every `validate:full` / pre-push | this issue |
| CI validate-full | exit code of import-boundary | PR / push | this issue |
| Reviewer | CP-IMPORT Proves/Does not | PR review | this issue |
| Exemption author | path + reason + issue | rare dual-edge | this issue |
| Product eng | packages free of apps | extract / dogfood | this issue (indirect) |
| R5 routes↛repos | folder convention | later | future |
| Product-owned graphs | product monorepo layout | product repos | future / out of kit |

### Normative decision (v1)

```text
if exemptions file has active line without reason → exit 2
for each source_file in packages/** ∪ apps/** (scoped globs, exclusions):
  for each import_literal in file:
    target := resolve(import_literal, source_file, workspace_map)
    if exempt(importer_path exact): continue
    if from packages and target under apps → R1|R2 fail
    if from example-web and target under example-api → R3 fail
    if from example-web and literal in WORKER_BAR_IMPORTS → R4 fail
if any fail → exit 1 else exit 0
```

### CP-IMPORT (normative draft for `docs/testing.md`)

| Surface | Content |
|---------|---------|
| **Inventory** | **CP-IMPORT** \| static R1–R4 import edges (packages↛apps, example-web↛example-api src / `cloudflare:workers`) after exemptions \| `bun run import-boundary` · `scripts/check-import-boundaries.ts` (+ self-test in `validate:full`) |
| **Proves** | String-literal import/`export from`/require/`import()` edges that resolve under forbidden zones; clean tree exit 0; synthetic plant exit ≠ 0; exemption lines require reason |
| **Does not prove** | Runtime/DI purity; non-literal dynamic imports; full tsconfig alias graph (unless implemented); product-owned layer graphs; R5 routes↛repos; that excluding `*.test.ts` still polices test-only edges; `package.json` deps without a source import |

## Breadboard

### U — User / machine affordances

| ID | Affordance | Handler (file) | Data / fact |
|----|------------|----------------|-------------|
| U1 | Scan + report R1–R4 | `scripts/check-import-boundaries.ts` | import literals · workspace map · zones |
| U2 | Exemptions file | `tools/import-boundary-exemptions.txt` | exact importer path · reason · issue; reason required |
| U3 | package.json script | root `package.json` | `"import-boundary": "bun run scripts/check-import-boundaries.ts"` |
| U4 | validate:full wire | root `package.json` | scan + self-test with arch gates (single PR preferred) |
| U5 | Synthetic failure proof | temp-dir harness or `scripts/check-import-boundaries.test.ts` **in validate:full** | planted violation → non-zero; not under packages\|apps |
| U6 | CP-IMPORT docs | `docs/testing.md` | inventory + Proves / Does not prove (normative draft above) |
| U7 | Plan SSoT status | `plans/009-layer-import-gate.md` | mark done / link PR when shipping (optional) |

### N — Narrative nodes

| ID | Node | Role |
|----|------|------|
| N1 | Scanner | Single decision point for import zones |
| N2 | Workspace map | `@gosilex/*` → packages |
| N3 | Exemptions | Fail-closed without reason |
| N4 | validate:full | Local primary gate + CI guardrail |
| N5 | CP-IMPORT | Honesty contract in testing.md |

### S — System / CI

| ID | System | Touch |
|----|--------|-------|
| S1 | Lefthook pre-push | via `validate:full` only (no separate hook unless already pattern) |
| S2 | GH Actions validate-full | inherits package.json script chain |
| S3 | Biome | unchanged; scanner is not a linter plugin |

## Slices

| # | Slice | Demo value | Affordances |
|---|-------|------------|-------------|
| **V1** | Scanner R1–R3 + unit/fixture proof + script | Illegal packages→apps and web→api edges fail; clean tree green | U1, U3, U5 |
| **V2** | R4 + exemptions + validate:full | Workers import banned from web; exemptions need reason; full gate | U1, U2, U4 |
| **V3** | CP-IMPORT docs (+ optional plan 009 status) | Reviewers know Proves / Does not prove | U6, U7 |

PR slicing (from plan 009, optional): PR-009-1 = V1; PR-009-2 = V2+V3 — **single PR acceptable** if small.

## Success Criteria

- [ ] **SC1** — `bun run import-boundary` exits **0** on current clean monorepo tree (no planted live violations).
- [ ] **SC2** — Self-test in the trusted chain (temp-dir harness or `bun test` wired in **`validate:full`**) proves scanner exits **non-zero** on a planted illegal edge **outside** `packages|apps`.
- [ ] **SC3** — **Both** R1 (workspace name packages→apps) **and** R2 (relative packages→apps) have an explicit failing case in the self-test harness.
- [ ] **SC4** — R3: example-web → example-api src edge fails the gate (self-test case).
- [ ] **SC5** — R4: example-web importing `cloudflare:workers` fails the gate (self-test case).
- [ ] **SC6** — Exemption line **without** reason → exit **2**; valid exemption with reason suppresses the matching importer path.
- [ ] **SC7** — Root `package.json` defines `import-boundary` and includes **scan + self-test** in **`validate:full`**.
- [ ] **SC8** — `docs/testing.md` has **CP-IMPORT** inventory row **and** Proves / Does not prove matching the normative draft above.
- [ ] **SC9** — No new heavy parser dependency required for green CI (zero or already-present deps only).
- [ ] **SC11** — Clean-tree scan completes in **&lt; 3s** on a typical kit CI/laptop run (soft budget; document if exceeded).

## Edge Cases

| Case | Handling |
|------|----------|
| Dynamic import with non-literal | **Ignore** (does not prove runtime purity — document in Does not prove) |
| Re-export chains package→package→app | v1 catches **direct** edges only; multi-hop via another package still caught if any package file imports apps |
| `import type` only | Treat as import (still a TS dependency edge) unless implementer documents type-only skip — **default: fail same as value import** |
| Path aliases outside `@gosilex/*` | Resolve via known tsconfig paths if cheap; else document as Does not prove full alias graph |
| Empty exemptions file | OK (zero exemptions) |
| Product apps under `apps/<product>-*` in fork | Same R1 still applies to packages; product-specific graphs out of scope for kit ruleset expansion |
| mcp-example | Treated as app under `apps/`; packages must not import it; web rules do not special-case mcp |

## Out of Scope (normative)

- Full hexagonal / service→repo graph (R5 optional later)
- Python importlinter / ESLint boundary plugins
- Product repo custom graphs
- Axial auto-label workflow
- Runtime DI / obfuscated dynamic imports

## Open / χ

none (plan 009 + frame supply R1–R4, AC, wire points; implementation path choice scripts vs tools is constrained to default `scripts/` + `tools/` exemptions)
