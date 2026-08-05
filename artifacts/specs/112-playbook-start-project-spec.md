---
title: "Docs — playbook start projet (Auth/RBAC/MasterData/UI/tokens)"
description: "Kit-side opinionated start-project playbook: foundation checklists + epic template, companion to start-product / fork-to-first-issue."
type: spec
status: approved
issue: 112
tier: F-lite
date: 2026-08-04
spark: "silex#88"
frame: artifacts/frames/112-playbook-start-project-frame.md
---

## Context

| | |
|---|---|
| **GitHub** | [#112](https://github.com/go-silex/silex-boilerplate/issues/112) |
| **Spark** | silex **#88** (Boilerplate) · parent Plugins **#84** |
| **Frame** | [`artifacts/frames/112-playbook-start-project-frame.md`](../frames/112-playbook-start-project-frame.md) (approved, F-lite) |
| **Residual** | `docs/playbooks/start-product.md` + `fork-to-first-issue.md` live (B5 consumer path). Gap = foundation checklist named / scoped as start-project. |

Promoted from frame. Analyze skipped (F-lite).

## Intent

Eng (and agents) spinning a Chemin A product still rediscover Auth / RBAC / MasterData / API layers / UI shell / tokens from AGENTS archaeology and closed epics. Consumer compose playbooks exist; the **opinionated foundation checklist** aligned with Spark #84 does not live as a first-class kit playbook.

Why now: triage 2026-08-03 kept #88 open as **partial** — residual not closed by rename of `start-product`.

## Goal

Ship `docs/playbooks/start-project.md` with copiable foundation checklists (Auth→DoD), an epic-split template, and cross-links from existing playbooks + README — without rewriting zero-edit consumer contract or implementing a product.

## Users

- **Primary:** Eng starting `go-silex/<product>` (or foreign-org) on this kit as `upstream`.
- **Secondary:** Agents (`/dev`, Lucy) and founders checking DoD “projet starté”.

## Expected Behavior

1. Reader opens **README playbooks table** → finds **Start project (foundations)** distinct from **Start product (zero-edit compose)** and **Fork → first issue**.
2. **Reading order:** day-0 remotes / zero-edit / kit bar → `start-product.md` first; then foundations here; then métier + first issue via `fork-to-first-issue.md`. N1 opens with a comparison table (compose remotes vs foundations vs first-issue) so the three playbooks do not fight.
3. **Decision tree (required vs opt-in)** before checklists:
   - **Always (spine):** compose `@gosilex/*`, error envelope + layers, zero-edit link-out.
   - **If browser users:** Auth BA sessions + cookies (+ dual-path cookie \| `sk_`).
   - **If multi-tenant SaaS:** RBAC (ADR-0003), invites, org modules.
   - **If referential CRUD / catalogue:** MasterData pattern (`demo_items`).
   - **If SPA shell:** UI `@gosilex/ui` + app-owned tokens.
   - Thin Worker / MCP-only products may skip SPA/RBAC sections with explicit “skip if…” rules — not universal MT SaaS clone.
4. `start-project.md` sections (each marked **required | opt-in | pointer-only**):
   1. Auth — BA-only, env shape (no secrets), flows, dual-path guards (**opt-in** if no browser users; dual-path `sk_` still **required** when machine clients exist)
   2. RBAC — platform + org matrix mini, where to check (**opt-in** multi-tenant)
   3. MasterData — live pattern `demo_items` · `/api/items` · `/app/items`; **package absent** (app-only copy) — not “B6 residual pattern”
   4. Endpoints — envelope, Zod, routes→services→repos (**required** for any Hono API)
   5. UI shadcn + shell (**opt-in** SPA)
   6. Design tokens / app `DESIGN.md` — CSS vars; never patch `packages/ui` (**opt-in** SPA)
   7. Découpage epics → Spark tickets (template table) (**required** process)
   8. DoD « projet starté » — split **must** vs **opt-in** rows
5. Each foundation section: opinionated default + **in-tree path links** (ADR, package, example route) that exist today + copiable `- [ ]` checklist (≥3 items for Auth…tokens; epic template and DoD have their own forms).
6. Explicit “not this doc”: zero-edit remotes, product-validate, deny-upstream → `start-product.md` / contract.
7. Parent Spark #84 once as Plugins umbrella; this file is **kit SSoT**, not a duplicated Plugins essay.
8. Anti-patterns box: never invent `@gosilex/masterdata` / dual-edit `packages/ui` or `example-*` without ADR + A8 (two call sites).

## Data Model & Consumers

Docs structure only (no runtime schema).

| Artifact | Role | Frozen vs mutable |
|---|---|---|
| `docs/playbooks/start-project.md` | **New** primary SSoT foundations | mutable living doc |
| `docs/playbooks/start-product.md` | Zero-edit compose (existing) | light link-out only |
| `docs/playbooks/fork-to-first-issue.md` | Runbook day-0 → first ship | light link-out only |
| `README.md` (and/or playbooks index if present) | Discoverability | light index row |

**Consumers**

| Consumer | Reads | When |
|---|---|---|
| Human eng | all checklists | day 0 foundations |
| Agent /dev | DoD + epic template | issue breakdown |
| Future silex-plugins skill | same paths | optional later (out of scope) |

## Breadboard

### Navigation (U*)

| ID | Affordance | Handler / target |
|---|---|---|
| U1 | **README playbooks table row** “Start project (foundations)” next to Start product / First issue | → N1 |
| U2 | Cross-link from `start-product.md` after compose/opt-in modules (“Foundations next”) | → N1 |
| U3 | Cross-link from `fork-to-first-issue.md` **Phase B** (repo compose / kit bar green) + mental-map “concepts master data” note — not Phase C métier | → N1 |
| U4 | Back-links from N1 to `start-product` + `fork-to-first-issue` + contract | → existing files |

### Doc nodes (N*)

| ID | Node | Content duty |
|---|---|---|
| N1 | `docs/playbooks/start-project.md` | Comparison table (3 playbooks) + decision tree + ordered sections + anti-patterns + “not this doc” |
| N2 | Section Auth | BA-only, env shape, flows, dual-path; mark required/opt-in per decision tree |
| N3 | Section RBAC | ADR-0003 dual-level mini matrix; where guards live; **opt-in** MT |
| N4 | Section MasterData | Live SSoT: `demo_items` · `/api/items` · `/app/items` · migration `0011_demo_items.sql`; package **absent** (app-only). `demo_notes` = older layer/ownership demo only if mentioned |
| N5 | Section Endpoints | Envelope `{ error, requestId }`, Zod, layer table — **required** spine |
| N6 | Section UI | `@gosilex/ui` + shells; `docs/ui-kit.md` — opt-in SPA |
| N7 | Section tokens | App-owned CSS vars / DESIGN.md pattern; anti dual-edit `packages/ui` |
| N8 | Epic template | Table epic → Spark ticket → GH issue (process form, not ≥3 foundation rule) |
| N9 | DoD checklist | Split **must** vs **opt-in**; no vacuous all-deferred |

### System / SSoT edges (S*)

| ID | Edge | Rule |
|---|---|---|
| S1 | N2 → ADR-0002 + `@gosilex/auth` + example-api guards | BA-only session truth |
| S2 | N3 → ADR-0003 | multi-tenant RBAC modules |
| S3 | N5 → `@gosilex/core` AppError + example routes | no second envelope |
| S4 | N6/N7 → `docs/ui-kit.md` + product-consumer-contract design_overrides | zero-edit brand |
| S5 | N1 ↛ rewrite start-product | companion, not replace |
| S6 | N9 → `start-product.md` § Checklist DoD consumer | foundations DoD links consumer DoD |
| S7 | N4 → `demo_items` paths (README B6 row, migration, items routes/pages) | live MasterData pattern |
| S8 | N1 → ADR-0001 / start-product compose axis | packages → compose apps |

## Slices

| # | Slice | Demo | IDs |
|---|-------|------|-----|
| **V1** | Author `start-project.md`: comparison + decision tree + 8 sections + checklists + epic template + must/opt-in DoD + anti-patterns | Open file alone: eng can decide scope + tick foundations without AGENTS archaeology | N1–N9, S1–S8 |
| **V2** | Discoverability: README table row + `start-product.md` (U2) + `fork-to-first-issue.md` Phase B (U3) | From README or either companion, one click to foundations | U1–U4 |

V1 is shippable alone; V2 is required for Done (discoverability is part of goal).

## Success Criteria

- [ ] **SC1:** `docs/playbooks/start-project.md` exists **and** has a dedicated row in the **README playbooks table** (same table as Start product / First issue). N1 includes a comparison table of the three playbooks.
- [ ] **SC2:** Doc contains ordered sections Auth, RBAC, MasterData, Endpoints, UI, Design tokens, Epic split, DoD. Foundation sections Auth…tokens each have ≥3 `- [ ]` items that cite **in-tree** paths (ADR / package / example route). Epic template (N8) and DoD (N9) use their own forms (not the ≥3 rule).
- [ ] **SC3:** Auth section states BA-only sessions + dual credential cookie \| Bearer `sk_`, points at ADR-0002 / example-api guards (no HMAC-as-live), and marks browser-session pieces as opt-in when no browser users.
- [ ] **SC4:** RBAC section points at ADR-0003 dual-level model, where checks run (API vs UI), and is marked **opt-in multi-tenant**.
- [ ] **SC5:** MasterData section points at live pattern **`demo_items` · `/api/items` · `/app/items`** (README B6 + migration `0011_demo_items.sql`); states pattern **shipped**, package **absent**; does **not** call the pattern “B6 residual” or claim `@gosilex/masterdata`.
- [ ] **SC6:** Endpoints section documents envelope + Zod + routes→services→repos (forbids repos-from-routes) and is marked **required** for Hono APIs.
- [ ] **SC7:** UI + tokens sections require compose `@gosilex/ui` and app-owned CSS vars; forbid permanent dual-edit of `packages/ui`; marked opt-in SPA.
- [ ] **SC8:** Epic-split template table present (epic → Spark ticket → GH issue columns or equivalent).
- [ ] **SC9:** DoD « projet starté » has two blocks: **must** (compose spine, envelope/layers, zero-edit link-out, dual-path if machine clients, decision tree completed) and **opt-in** (BA browser, RBAC MT, MasterData, SPA shell) with explicit “skip if…” — **must** rows cannot be closed by blank “deferred”. Links to `start-product.md` consumer DoD (S6).
- [ ] **SC10:** `start-product.md` and `fork-to-first-issue.md` gain outbound links to `start-project.md` (U2 at compose/opt-in; U3 at Phase B — not Phase C métier). No rewrite of zero-edit contract.
- [ ] **SC11:** `bash scripts/check-banned-strings.sh` green (no product métier strings). Docs-only change; no runtime package surface.
- [ ] **SC12:** Spark #84 / #88 referenced once as parent context — no duplicated long Plugins essay.
- [ ] **SC13:** N1 decision tree present (required vs opt-in matrix) before foundation checklists.
- [ ] **SC14:** Anti-patterns box forbids inventing packages / dual-editing kit paths without ADR+A8.

## Edge Cases

| Edge | Handling |
|---|---|
| Reader confuses start-product vs start-project | Comparison table in N1 (SC1) |
| MasterData package absent | SC5: pattern live app-only; package absent — not “pattern residual” |
| Thin API / MCP-only product | Decision tree skip SPA/RBAC; must-set still holds |
| DESIGN.md absent in kit | Tokens section = **app-owned** DESIGN.md / CSS vars; do not invent kit DESIGN.md |
| Foreign-org product | Point to start-product foreign-org CI App; no fork |
| Agent invents packages | Anti-patterns box + SC14 |
| Agent-only consumption | Checklists `- [ ]` ASCII |

## Non-goals (restate)

- Client product implementation
- New packages or runtime code
- silex-plugins skill (optional follow-up)
- Replacing zero-edit / product-validate docs

## χ Clarifications

none remaining — MasterData pointer frozen to live `demo_items` (pattern shipped, package absent); resolved during expert review (was demo_notes / “B6 residual”).
