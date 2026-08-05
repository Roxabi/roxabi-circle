---
title: "Layer import boundary gate (packages↛apps)"
issue: 69
status: approved
tier: F-lite
date: 2026-08-02
spark: 133
---

## Problem

ADR-0001 (PRIMARY axis = packages compose apps) is **prose only**. Factory enforces layer isolation with importlinter; the Chemin A kit (Bun/TS Workers) has **no machine gate** that fails when:

1. `packages/*` imports from `apps/*` (absolute workspace name or relative)
2. `apps/example-web` imports `apps/example-api` source (must stay HTTP-client-only)
3. Web app pulls Workers/runtime bindings (`cloudflare:workers`, D1/R2 types via import path)

Banlist/extract cover **domain string leakage** (share strings, product dual-edit), not the **import graph**. Agents and humans can merge a dependency edge that breaks extractability and monorepo isolation without CI catching it.

**Why now:** Goal 002 multi-tenant + consumer contract are live; plan 009 is normative; gate is orthogonal to B7 quality / MCP and only adds scripts + validate wiring.

**Observable impact:** A `packages/auth` → `apps/example-api` import can ship green until a product extract or architectural review; reverse of factory’s fail-closed stage contracts.

## Who

- **Primary:** Kit maintainers and coding agents running `validate:full` / pre-push (Lefthook)
- **Secondary:** Product engineers consuming the kit as `upstream` (zero-edit zones stay honest only if packages never pull apps)

## Constraints

- **Cheap TS gate** — seconds-class, deterministic; prefer zero new heavy dep (regex/static scan of import string literals + workspace name resolve); not a Python importlinter port
- Wire into **`validate:full`** (and thus pre-push) alongside banlist/extract/zero-edit
- Normative rules **R1–R4** from `plans/009-layer-import-gate.md`; R5 (routes↛repos) soft/optional v1.1
- Exemptions file with **path + reason + issue** (fail-closed without reason)
- No conflict with MCP (#68) / B7 (#19) if only new scripts + docs + package.json script line
- Inspiration: roxabi-factory `.importlinter` — light port of *intent*, not a copy of the Python tool

## Out of Scope

- Full hexagonal graph (every service → repo edge)
- Python importlinter / ESLint monorepo boundary plugins (Biome remains sole style tool)
- Product app graphs inside this kit repo (product repos own extra rules)
- Axial auto-label workflow (plan 010 / later)
- Runtime DI purity / dynamic import obfuscation beyond string-literal scan

## Premise Validity

**Success in 6 months:** Any PR that introduces packages→apps or example-web→example-api src (or web→workers bindings) **fails `validate:full`** before merge; clean tree stays green; CP-IMPORT documents Proves / Does not prove; exemptions are rare and reasoned.

**Failure in 6 months:** Gate absent or flaky → at least one merged kit change where a package imports an app (or web imports api src), discovered only at extract/product dogfood; ADR-0001 remains unenforceable prose.

**Simplest alternative:** Strengthen banlist/docs (“don’t import apps from packages”) without a dedicated scanner.
**Why not simplest:** Banlist is string/domain oriented; prose never fails CI; factory already proved that **executable boundaries** are the durable form — kit needs the TS equivalent at R1–R4 coarse grain.

## Complexity

**Tier: F-lite** — clear single-domain scope (new scanner script + tests + validate:full wire + testing.md CP-IMPORT + exemptions file); rules already normative in plan 009; no product domain, no new runtime architecture.

Signals:

- Effort S–M on plan 009; new scripts only
- Single concern: static import boundaries
- User-selected F-lite via `/dev` (no size label on issue)
- Analyze skipped (frame + plan SSoT sufficient)
