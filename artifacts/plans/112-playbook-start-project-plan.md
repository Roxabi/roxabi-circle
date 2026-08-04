---
title: "Plan: Docs — playbook start projet (Auth/RBAC/MasterData/UI/tokens)"
issue: 112
spec: artifacts/specs/112-playbook-start-project-spec.md
complexity: 3/10
tier: F-lite
generated: "2026-08-04T12:00:00Z"
spark: "silex#88"
---

## Summary

Ship kit-side `docs/playbooks/start-project.md` (foundations companion to zero-edit `start-product` + fork runbook): decision tree, live MasterData `demo_items`, must/opt-in DoD, then discoverability links (README + two companions). Docs-only — no runtime packages.

## Architecture

### Data Flow

**Diagram:** [Reader flow](../visuals/112-playbook-start-project-data-flow.html)

Entry points → N1 decision tree → foundation checklists → process (epics/DoD) → in-tree SSoT citations.

### File x Function Map

**Diagram:** [File map](../visuals/112-playbook-start-project-file-map.html)

One new playbook + three light link-outs; ADRs/`demo_items`/`ui-kit` read-only.

## Bootstrap Context

No analysis (F-lite). Frame + approved spec: residual partial after B5 consumer playbooks; MasterData SSoT = `demo_items` (pattern live, package absent).

## Agents

| Agent | Task count | Files |
|-------|-----------|-------|
| doc-writer-A | 1 | `docs/playbooks/start-project.md` |
| doc-writer-B | 3 | `README.md`, `docs/playbooks/start-product.md`, `docs/playbooks/fork-to-first-issue.md` |
| tester-A | 2 | verify only (paths + banlist) |

## Wave Structure

4 waves, max 1 parallel agent (sequential docs + verify). Elapsed ~1 short session vs sequential same.

| Wave | Trigger | Agents | Tasks |
|------|---------|--------|-------|
| 1 | start | 1 | doc-writer-A: T1 |
| 2 | Wave 1 done | 1 | tester-A: T2 (RED-GATE V1) |
| 3 | Wave 2 done | 1 | doc-writer-B: T3→T4→T5 |
| 4 | Wave 3 done | 1 | tester-A: T6 (RED-GATE V2) |

### Budget — per task

| Task | Items | Class | Est. ops | Split? |
|------|-------|-------|----------|--------|
| T1 write start-project.md | 1 file · 8 sections | judgmental | 12 | — |
| T2 RED-GATE V1 path checks | grep paths | bounded | 3 | — |
| T3 README row | 1 edit | trivial | 2 | — |
| T4 start-product link | 1 edit | trivial | 2 | — |
| T5 fork Phase B link | 1 edit | bounded | 3 | — |
| T6 RED-GATE banlist + links | scripts + grep | bounded | 3 | — |

**Total estimated ops: 25**

### Budget — per agent instance

| Instance | Tasks | Σ ops | Subjects | Split? |
|----------|-------|-------|----------|--------|
| doc-writer-A | T1 | 12 | playbook-body | — |
| doc-writer-B | T3, T4, T5 | 7 | discoverability | — |
| tester-A | T2, T6 | 6 | verify | — |

## Consistency Report

- Criteria covered: 14/14 (SC1–SC14)
- Uncovered criteria: none
- Tasks without spec backing: none
- Gold plating exemptions applied: 0

| SC | Task(s) |
|----|---------|
| SC1 comparison + README | T1, T3 |
| SC2 path-cited checklists | T1, T2 |
| SC3 Auth BA-only | T1 |
| SC4 RBAC opt-in | T1 |
| SC5 demo_items MasterData | T1, T2 |
| SC6 Endpoints required | T1 |
| SC7 UI/tokens opt-in | T1 |
| SC8 epic template | T1 |
| SC9 DoD must/opt-in | T1 |
| SC10 companion links | T4, T5 |
| SC11 banlist | T6 |
| SC12 Spark parent once | T1 |
| SC13 decision tree | T1 |
| SC14 anti-patterns | T1 |

## Ref Patterns

| Path | Steal |
|------|--------|
| `docs/playbooks/start-product.md` | Tone, tables, DoD checklist style, FR-first headings optional (kit README EN) |
| `docs/playbooks/fork-to-first-issue.md` | Phase structure, mental map |
| `docs/ui-kit.md` | UI/tokens pointers |
| `README.md` L11–12 | Playbooks table row format |
| ADR-0002 / ADR-0003 | Auth/RBAC SSoT one-liners |

**Language:** match kit playbook English for `start-project.md` (like `start-product.md`); French OK only where linking into `fork-to-first-issue.md` French body with minimal bilingual bridge if needed.

## Micro-Tasks

### Slice V1: Author `start-project.md`

#### Task 1: Write full foundations playbook → doc-writer-A
- **File:** `docs/playbooks/start-project.md`
- **Snippet:** frontmatter/status living + comparison table (start-product / start-project / fork-to-first-issue) + decision tree (always / if browser / if MT / if MasterData / if SPA) + sections 1–8 with `- [ ]` checklists citing in-tree paths + epic template table + DoD must vs opt-in + anti-patterns (no `@gosilex/masterdata`, no dual-edit ui) + single Spark #84/#88 parent note
- **MasterData SSoT (hard):** `demo_items` · `/api/items` · `/app/items` · `apps/example-api/migrations/0011_demo_items.sql` · README B6 row; package absent; do **not** say “B6 residual pattern”
- **Auth SSoT:** BA-only ADR-0002; dual cookie \| `sk_`; no HMAC-as-live
- **Verify:** `test -f docs/playbooks/start-project.md && grep -q 'demo_items' docs/playbooks/start-project.md && grep -q 'ADR-0002' docs/playbooks/start-project.md` (ready)
- **Expected:** file exists; contains demo_items + ADR-0002 + decision tree + DoD must
- **Time:** 25 min
- **Difficulty:** 3
- **Traces:** SC1–SC9, SC12–SC14, N1–N9, S1–S8
- **Phase:** GREEN
- **Subject:** playbook-body
- **Agent instance:** doc-writer-A

#### Task 2: RED-GATE V1 — path existence → tester-A
- **File:** verify only
- **Snippet:** for each cited path in Auth/RBAC/MasterData/Endpoints/UI sections, assert target exists (ADRs, ui-kit, migration, example routes/pages as linked)
- **Verify:** `test -f docs/architecture/adr/0002-session-hmac-interim-vs-better-auth.md && test -f docs/architecture/adr/0003-multi-tenant-rbac-modules.md && test -f docs/ui-kit.md && test -f apps/example-api/migrations/0011_demo_items.sql && grep -q 'demo_items' docs/playbooks/start-project.md && ! grep -qi 'B6 residual' docs/playbooks/start-project.md` (ready)
- **Expected:** all pass; no “B6 residual” for MasterData pattern
- **Time:** 5 min
- **Difficulty:** 1
- **Traces:** SC2, SC5
- **Phase:** RED-GATE
- **Subject:** verify
- **Agent instance:** tester-A

### Slice V2: Discoverability

#### Task 3: README playbooks table row → doc-writer-B
- **File:** `README.md`
- **Snippet:** insert row after Start a product / before First issue (or after First issue): **Start project (foundations)** → `docs/playbooks/start-project.md`
- **Verify:** `grep -q 'start-project.md' README.md` (ready)
- **Expected:** row present
- **Time:** 3 min
- **Difficulty:** 1
- **Traces:** SC1, U1
- **Phase:** GREEN
- **Subject:** discoverability
- **Agent instance:** doc-writer-B

#### Task 4: start-product outbound link → doc-writer-B
- **File:** `docs/playbooks/start-product.md`
- **Snippet:** short “Foundations next” after Opt-in multi-tenant section and/or Refs table → `./start-project.md` — **no** zero-edit rewrite
- **Verify:** `grep -q 'start-project.md' docs/playbooks/start-product.md` (ready)
- **Expected:** link present
- **Time:** 4 min
- **Difficulty:** 1
- **Traces:** SC10, U2, S5
- **Phase:** GREEN
- **Subject:** discoverability
- **Agent instance:** doc-writer-B

#### Task 5: fork-to-first-issue Phase B link → doc-writer-B
- **File:** `docs/playbooks/fork-to-first-issue.md`
- **Snippet:** link near Phase B (repo compose / checklist fin Phase B §3.8) to kit foundations playbook — **not** under Phase C métier
- **Verify:** `grep -n 'start-project' docs/playbooks/fork-to-first-issue.md | head` (ready)
- **Expected:** link in Phase B region (line context near “Phase B”)
- **Time:** 5 min
- **Difficulty:** 2
- **Traces:** SC10, U3
- **Phase:** GREEN
- **Subject:** discoverability
- **Agent instance:** doc-writer-B

#### Task 6: RED-GATE V2 — banlist + link graph → tester-A
- **File:** verify only
- **Snippet:** banlist + all three entry points resolve
- **Verify:** `bash scripts/check-banned-strings.sh && grep -q 'start-project.md' README.md && grep -q 'start-project.md' docs/playbooks/start-product.md && grep -q 'start-project' docs/playbooks/fork-to-first-issue.md` (ready)
- **Expected:** banlist exit 0; three greps match
- **Time:** 5 min
- **Difficulty:** 1
- **Traces:** SC10, SC11
- **Phase:** RED-GATE
- **Subject:** verify
- **Agent instance:** tester-A

## Task Seeding Blueprint

<!-- Used by /implement to seed TaskCreate calls on session start. -->

### Wave 1 — no deps, 1 agent

| Task | Agent instance | blockedBy | Subject |
|------|---------------|-----------|---------|
| T1 | doc-writer-A | — | playbook-body |

### Wave 2 — after Wave 1, 1 agent

| Task | Agent instance | blockedBy | Subject |
|------|---------------|-----------|---------|
| T2 | tester-A | T1 | verify |

### Wave 3 — after Wave 2, 1 agent (sequential T3→T4→T5)

| Task | Agent instance | blockedBy | Subject |
|------|---------------|-----------|---------|
| T3 | doc-writer-B | T2 | discoverability |
| T4 | doc-writer-B | T3 | discoverability |
| T5 | doc-writer-B | T4 | discoverability |

### Wave 4 — after Wave 3, 1 agent

| Task | Agent instance | blockedBy | Subject |
|------|---------------|-----------|---------|
| T6 | tester-A | T5 | verify |

## Task IDs

<!-- Generated by /plan. Used by /implement to resume tasks on session restart. -->
- T1: plan-112-T1 — playbook-body
- T2: plan-112-T2 — verify
- T3: plan-112-T3 — discoverability
- T4: plan-112-T4 — discoverability
- T5: plan-112-T5 — discoverability
- T6: plan-112-T6 — verify
