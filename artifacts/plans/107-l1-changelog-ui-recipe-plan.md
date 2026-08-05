---
title: "Plan: L1 — Changelog UI recipe (example-web, not package)"
issue: 107
spec: artifacts/specs/107-l1-changelog-ui-recipe-spec.md
complexity: 3/10
tier: F-lite
generated: 2026-08-04T13:40:00Z
slice: V1
---

## Summary

Ship V1 dogfood: typed static `Release[]` under `apps/example-web`, authenticated `/app/changelog` page, avatar menu entry, FR/EN strings, unit tests, ownership recipe + DR-B8-03 park amend. **No package, no D1.** V2 GIF scripts deferred (optional follow-up).

## Architecture

**Data flow:** [107 data flow](../visuals/107-l1-changelog-ui-recipe-data-flow.html)  
**File map:** [107 file map](../visuals/107-l1-changelog-ui-recipe-file-map.html)

```text
content/releases (TS)
  → getReleases() + locale pick
  → ChangelogPage @ /app/changelog (appLayout, auth)
  → NavUser menu item (app-shell)
```

## Bootstrap Context

- Ref: `apps/example-web/src/routes/settings.tsx` (page shell)
- Ref: `apps/example-web/src/components/app-shell.tsx` (NavUser children)
- Ref: `apps/example-web/src/routeTree.tsx` (appLayout child routes)
- Ref: `apps/example-web/src/messages/{fr,en}.ts` (catalog pattern)
- Spec AC1–AC8 = V1 bar; AC9 = V2 skip

## Agents

| Agent | Tasks | Files |
|-------|-------|-------|
| frontend-dev-A | T1–T5 | content, lib, routes, routeTree, app-shell, messages |
| tester-A | T6 | `releases.test.ts` |
| doc-writer-A | T7–T8 | recipe + park-decisions |

## Wave Structure

2 waves, max 1 parallel agent chain (small F-lite). Elapsed ~0.5d vs sequential same.

| Wave | Trigger | Agents | Tasks |
|------|---------|--------|-------|
| 1 | start | frontend-dev-A | T1→T2→T3→T4→T5 |
| 2 | Wave 1 done | tester-A ∥ doc-writer-A | T6 · T7→T8 |
| 3 | Wave 2 done | — | T9 RED-GATE V1 |

### Budget — per task

| Task | Class | Est. ops | Split? |
|------|-------|----------|--------|
| T1 content types + demo | bounded | 3 | — |
| T2 getReleases helpers | bounded | 3 | — |
| T3 ChangelogPage | judgmental | 5 | — |
| T4 routeTree wire | bounded | 2 | — |
| T5 app-shell + i18n | bounded | 4 | — |
| T6 unit tests | bounded | 3 | — |
| T7 recipe doc | bounded | 3 | — |
| T8 park amend | trivial | 2 | — |
| T9 RED-GATE | trivial | 2 | — |

**Total estimated ops: ~27**

### Budget — per agent instance

| Instance | Tasks | Σ ops | Subjects | Split? |
|----------|-------|-------|----------|--------|
| frontend-dev-A | T1–T5 | 17 | content, page, nav | — |
| tester-A | T6 | 3 | unit | — |
| doc-writer-A | T7–T8 | 5 | recipe, park | — |

## Consistency Report

| Metric | Value |
|--------|-------|
| Spec AC covered | AC1–AC8 via T1–T9; AC9 V2 **exempt** (slice deferred) |
| Breadboard IDs | U1–U5, N1–N2, S1–S2, D1–D2, T1 (spec test) → tasks; G1 **exempt** V2 |
| Uncovered | G1, AC9 (V2) |
| Untraced tasks | none |

## Micro-Tasks (V1)

### T1 — Release content module
- **Agent:** frontend-dev-A · **Subject:** content · **Slice:** V1 · **Phase:** GREEN
- **File:** `apps/example-web/src/content/releases/index.ts` (+ optional `demo.ts`)
- **Desc:** Export `Release` type + `releases` array with ≥1 FR/EN demo entry (version, date, title, bullets).
- **Verify:** `test -f apps/example-web/src/content/releases/index.ts`
- **Spec:** S1 · AC2 · AC3
- **Est:** 5 min

### T2 — getReleases helpers
- **Agent:** frontend-dev-A · **Subject:** content · **Slice:** V1 · **Phase:** GREEN
- **File:** `apps/example-web/src/lib/releases.ts`
- **Desc:** `getReleases()` sort date desc; `pickLocalized(record, locale)` with fr→en→id fallback; tolerate bad dates (sort last).
- **Verify:** `grep -q getReleases apps/example-web/src/lib/releases.ts`
- **Spec:** U3 · edge cases · AC2
- **Est:** 5 min · deps T1

### T3 — ChangelogPage
- **Agent:** frontend-dev-A · **Subject:** page · **Slice:** V1 · **Phase:** GREEN
- **File:** `apps/example-web/src/routes/changelog.tsx`
- **Desc:** Page using `@gosilex/ui` Card shell + PageHeader; list releases for `useLocale()`; empty state; optional gif if `gifSrc`.
- **Verify:** `grep -q ChangelogPage apps/example-web/src/routes/changelog.tsx`
- **Spec:** U2–U5 · AC2
- **Est:** 10 min · deps T2

### T4 — Register route
- **Agent:** frontend-dev-A · **Subject:** page · **Slice:** V1 · **Phase:** GREEN
- **File:** `apps/example-web/src/routeTree.tsx`
- **Desc:** `appChangelogRoute` path `/app/changelog` under `appLayoutRoute`; wire component; add to route tree array.
- **Verify:** `grep -q \"/app/changelog\" apps/example-web/src/routeTree.tsx`
- **Spec:** N1 · AC1 · AC7
- **Est:** 5 min · deps T3

### T5 — Avatar menu + i18n + pageTitle
- **Agent:** frontend-dev-A · **Subject:** nav · **Slice:** V1 · **Phase:** GREEN
- **Files:** `apps/example-web/src/components/app-shell.tsx`, `apps/example-web/src/messages/fr.ts`, `apps/example-web/src/messages/en.ts` (+ contract test if required)
- **Desc:** NavUser item → `/app/changelog`; keys `navChangelog`, `changelogTitle`, `changelogDesc`, `changelogEmpty`; pageTitle branch.
- **Verify:** `grep -q navChangelog apps/example-web/src/messages/fr.ts`
- **Spec:** U1 · N2 · S2 · AC1
- **Est:** 8 min · deps T4

### T6 — Unit tests
- **Agent:** tester-A · **Subject:** unit · **Slice:** V1 · **Phase:** GREEN
- **File:** `apps/example-web/src/lib/releases.test.ts`
- **Desc:** sort newest-first; locale pick fr/en + fallback; no throw on empty list.
- **Verify:** `bun run --filter @gosilex/example-web test`
- **Spec:** T1 (spec) · AC8
- **Est:** 8 min · deps T2

### T7 — Recipe doc
- **Agent:** doc-writer-A · **Subject:** recipe · **Slice:** V1 · **Phase:** GREEN
- **File:** `docs/recipes/changelog-l1.md` (or `docs/playbooks/` if recipes dir absent — create `docs/recipes/`)
- **Desc:** Dual-catalogue ownership; copy steps for product; link start-product; no package; optional GIF later.
- **Verify:** `grep -q dual apps/example-web 2>/dev/null; grep -qi ownership docs/recipes/changelog-l1.md`
- **Spec:** D1 · AC5
- **Est:** 8 min · deps —

### T8 — Park decisions amend
- **Agent:** doc-writer-A · **Subject:** park · **Slice:** V1 · **Phase:** GREEN
- **File:** `docs/park-decisions-b8.md` (+ AGENTS checklist line if needed)
- **Desc:** DR-B8-03 posture → **L1 shipping (#107 / Spark #100)**; L2 package **still park** with same unpark criteria.
- **Verify:** `grep -q L1 docs/park-decisions-b8.md`
- **Spec:** D2 · AC6
- **Est:** 5 min · deps —

### T9 — RED-GATE V1
- **Agent:** tester-A · **Subject:** gate · **Slice:** V1 · **Phase:** RED-GATE
- **Desc:** typecheck example-web; run unit tests; manual checklist AC1–AC8; no new packages/* entry.
- **Verify:** `bun run --filter @gosilex/example-web typecheck && bun run --filter @gosilex/example-web test && ! test -d packages/patchlog`
- **Spec:** AC1–AC8
- **Est:** 10 min · deps T5,T6,T7,T8

## Task Seeding Blueprint

<!-- Used by /implement to seed TaskCreate calls on session start.
     Format: T{n} | agent-instance | blockedBy | subject -->

### Wave 1 — no deps / sequential frontend, 1 agent

| Task | Agent instance | blockedBy | Subject |
|------|---------------|-----------|---------|
| T1 | frontend-dev-A | — | content |
| T2 | frontend-dev-A | T1 | content |
| T3 | frontend-dev-A | T2 | page |
| T4 | frontend-dev-A | T3 | page |
| T5 | frontend-dev-A | T4 | nav |

### Wave 2 — after Wave 1, 2 agents ∥

| Task | Agent instance | blockedBy | Subject |
|------|---------------|-----------|---------|
| T6 | tester-A | T2 | unit |
| T7 | doc-writer-A | — | recipe |
| T8 | doc-writer-A | T7 | park |

### Wave 3 — RED-GATE

| Task | Agent instance | blockedBy | Subject |
|------|---------------|-----------|---------|
| T9 | tester-A | T5,T6,T7,T8 | gate |

## Out of plan (V2)

- GIF Playwright scripts (G1 / AC9) — re-run `/plan` when needed

## Task IDs

<!-- Generated by /plan. Used by /implement to resume tasks on session restart. -->
- T1: T1 — content
- T2: T2 — content
- T3: T3 — page
- T4: T4 — page
- T5: T5 — nav
- T6: T6 — unit
- T7: T7 — recipe
- T8: T8 — park
- T9: T9 — gate
