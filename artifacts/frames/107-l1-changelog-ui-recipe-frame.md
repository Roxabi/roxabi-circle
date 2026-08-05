---
title: "L1 — Changelog UI recipe (example-web, not package)"
issue: 107
status: approved
tier: F-lite
date: 2026-08-04
---

## Problem

Product teams need a simple way to show clients **what changed** after a release (Nouveautés / patch log), without a CMS and without dual-editing the kit. Spark #100 was parked as DR-B8-03 (recipe L1, not package); it is now **unparked L1** for dogfood in `example-web`.

Today the kit has **no** in-app changelog: only a fake sidebar “Changelog” `#` link in demo nav data, and Metalyde’s local Playwright GIF scripts (not an in-app page). Products that append a shared kit `CHANGELOG.md` would hit **git merge conflicts** and **zero-edit** violations.

## Who

- **Primary:** Kit / product builders wiring a client-facing “what’s new” surface on Chemin A SPA shells.
- **Secondary:** End clients reading release notes in-app; operators recording optional share GIFs (Metalyde pattern).

## Constraints

- **No package** in L1 (`@gosilex/patchlog` forbidden until L2 unpark criteria).
- **Zero-edit:** release content lives app-owned under `apps/example-web` (dogfood) / `apps/<product>-web` (products) — never dual-edit `packages/*`.
- **Two catalogues:** kit dogfood vs product client notes; kit dev notes (optional root CHANGELOG / GH Releases) are **not** the client UI source.
- Reuse existing `NavUser` children slot for avatar menu entry.
- Static content (MD/JSON + import/glob) — **no D1**, no admin CRUD.
- GIF tooling optional, **local only**, not CI / validate:full.
- Align `docs/park-decisions-b8.md` (L1 shipping · L2 still park).
- Spark #100 public · GH #107.

## Out of Scope

- L2 package, D1 tables, admin CMS, draft/publish workflows.
- GitHub Releases scraper as kit default.
- Single shared CHANGELOG file kit↔product.
- Reusing `@gosilex/feedback` as changelog.
- GIF recording as merge gate / CI job.
- Product métier release content in this kit (demo only).

## Premise Validity

**Success in 6 months:** Product clones copy a documented recipe: avatar → Nouveautés page backed by app-owned `content/releases/*`, with zero merge conflicts on upstream kit pulls; kit `example-web` dogfoods the same pattern.

**Failure in 6 months:** Teams still paste release notes in Slack/Notion only, **or** products dual-edit kit files / share one CHANGELOG and regularly conflict on `git merge upstream`.

**Simplest alternative:** Root `CHANGELOG.md` + link from README (or external Notion).
**Why not simplest:** Not discoverable in the product shell; not FR-first client UX; same-file append across kit and fork causes conflicts; no place for optional demo GIFs in-app.

## Complexity

**Tier: F-lite** — single domain (example-web + docs recipe), clear L1 scope from unpark, no new package/API; more than S-tier file count (route, content, nav, docs, optional scripts).

Signals:

- Clear scope / package decision already locked (issue + Spark unpark).
- One UI surface + static content model.
- Analyze skipped (F-lite).
