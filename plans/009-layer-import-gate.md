# Plan 009 — Layer import boundary gate (machine)

> **Status:** DONE (GH #69 · branch feat/69-layer-import-boundary-gate)  
> **Date:** 2026-08-02  
> **Source:** factory `.importlinter` + ADR-0001 (kit axial packages compose apps) — **TS light**, not Python importlinter  
> **Inspiration:** roxabi-factory stage-axis contracts (executable boundaries)  
> **Orthogonal to:** [007](007-quality-gates-post-review.md) B7 · [008](008-mcp-agent-contracts.md) MCP  
> **Epic:** Spark **#133** · GH **[#69](https://github.com/go-silex/silex-boilerplate/issues/69)** · p1 · todo · onRoadmap

---

## Issue mapping

| | |
|---|---|
| Spark | **#133** |
| GitHub | **[#69](https://github.com/go-silex/silex-boilerplate/issues/69)** |
| Priority | p1 · todo · onRoadmap |

---

## Problem

ADR-0001 states **PRIMARY axis = packages compose apps**, but enforcement is **prose + banlist/extract** only. Nothing fails CI if:

- `packages/*` imports `apps/*`
- `apps/example-web` imports server-only modules from example-api
- routes reach into “repo” paths that should stay behind services (soft, path-based)

Factory solves this with **importlinter** (layers, ports purity). Kit is Bun/TS Workers — need a **cheap** gate, not a Python monorepo port.

---

## Goals

1. Machine-checkable **import boundaries** for monorepo Chemin A.  
2. Runs in **`validate:full`** (and pre-push) — deterministic, seconds-class.  
3. Document **Proves / Does not prove** in `docs/testing.md` (same honesty as 007 A5).

**JTBD:**  
> Un agent qui importe `apps/example-api` depuis `packages/auth` échoue au gate avant merge.

---

## Non-goals

| Out | Why |
|---|---|
| Full hexagonal graph (every service → repo edge) | Path conventions vary; start coarse |
| Python importlinter / eslint monorepo zoo | Biome stays sole style tool |
| Product app graphs in kit | Product repos own extra rules |
| Axial auto-label workflow | Separate optional process (plan 010 / later) |

---

## Rules (v1 — normative)

| # | Rule | Fail when |
|---|---|---|
| **R1** | packages ↛ apps | Any `packages/**` file imports path/`@gosilex` that resolves to `apps/` |
| **R2** | packages ↛ apps relative | `from '../../apps/...` or alias to apps |
| **R3** | example-web ↛ example-api src | Web must use HTTP client only (no direct import of api `src/`) |
| **R4** | example-web ↛ workers bindings | No `cloudflare:workers` / D1/R2 types in web app (if detectable by import path) |
| **R5** (soft optional v1.1) | `**/routes/**` ↛ `**/repos/**` | Same app — only if tree uses those folder names consistently |

Use **static scan** of import/export/require/dynamic import string literals (TypeScript AST or regex+tsc paths — prefer small dedicated script in `scripts/` or `tools/`).

**Allowlist exemptions file:** `tools/import-boundary-exemptions.txt` (path + reason + issue) — rare.

---

## Implementation sketch

```text
scripts/check-import-boundaries.ts   # or tools/
  - walk packages/**, apps/**
  - parse imports (ts-morph optional; or oxc/swc if already dep — prefer zero new heavy dep: regex + package.json exports)
  - resolve workspace names @gosilex/* → packages/*
  - apply R1–R4
  - exit 1 + list violations

package.json:
  "import-boundary": "bun run scripts/check-import-boundaries.ts"
  validate:full += import-boundary  (after banlist or typecheck)

docs/testing.md:
  CP-IMPORT | proves package/app isolation | does not prove runtime DI purity
```

---

## Acceptance criteria

| # | Criterion |
|---|---|
| AC1 | Script fails on synthetic violation (fixture or unit test of scanner) |
| AC2 | Clean tree green on current main |
| AC3 | In `validate:full` |
| AC4 | testing.md row CP-IMPORT with Proves/Does not prove |
| AC5 | Exemptions require reason line |

---

## Sequencing

```text
S1  Scanner R1–R3 + unit self-test
S2  R4 + wire validate:full
S3  Docs + optional R5
```

**Effort:** S–M  
**Priority:** P1 (after or parallel 007/008; no file conflict with MCP if only new script)

---

## PR slicing

| PR | Content |
|---|---|
| PR-009-1 | scanner + tests + package script |
| PR-009-2 | validate:full + testing.md |

---

## Chain

| | |
|---|---|
| Predecessor | ADR-0001 · factory importlinter analysis |
| Sibling | 007, 008, 010 |
| Do not merge into | #19 B7 or #68 MCP |
