---
title: "Epic B6 — Patterns kit productifs (MasterData, API client, jobs, presign)"
issue: 18
spark: 119
status: approved
tier: F-full
date: 2026-08-03
related:
  - artifacts/analyses/18-epic-b6-kit-patterns-analysis.md
  - artifacts/specs/18-epic-b6-kit-patterns-spec.md
  - docs/architecture/adr/0001-primary-axis-packages-compose-apps.md
  - artifacts/reviews/2026-07-12-goal-arbitration-freeze.md
---

## Problem

Product apps on Chemin A **re-copy** the same four productive bricks on day one: master-data CRUD, browser API client + error mapping, CF Queues/cron glue, and R2 presigned upload. The kit already has **embryos** (notes CRUD, app-local `apiFetch`, `@gosilex/storage` put/get, no queues). Without **documented + green example** patterns, each product invents a private variant → axial N×M drift (ADR-0001) and open debt (TD-A-012 storage without presign).

**JTBD:** From this kit, a GOSILEX dev clones four productive patterns (MasterData, API client, jobs, presign) with example green, zero product-domain strings, and no empty packages (A8).

## Who

- **Primary:** GOSILEX kit / product engineers bootstrapping `go-silex/<product>` from this upstream
- **Secondary:** Reviewers of product PRs who need a single SSoT pattern instead of ad-hoc forks; future share (and other CF SaaS) consumers of the kit

## Constraints

- Kit-only repo — **no** product-domain strings (share / metalyde / …) in `packages/*` or `apps/example-*`
- **A8** — package only if `example-*` consumes it; **X6** — 2 call sites or ADR; no empty package theater
- **A20** — D1 / entity schemas live in apps; packages = glue
- **A25** — presign = optional **light** helper; **no** video product / 500 MiB multipart in kit
- Axial ADR-0001 — MasterData is **demo domain pattern**, not a generic ORM package
- DoD machine bar: `bun run validate:full` green + README package map current
- Child GH issues #89–#92 cited by Spark **do not exist** — recreate or renumber under #18 at plan time
- 124+ commits landed since issue open (B5 consumer, MCP, hygiene) — re-baseline code at implement

## Out of Scope

- Import CSV bulk
- Métier workflow / orchestrateur engine
- Video ≤ 500 MiB multipart product path (share M2+)
- Product-domain packages or routes
- Mega single PR shipping all four patterns at once (review/secu)

## Premise Validity

**Success in 6 months:** Every new `go-silex/<product>` starts from four copyable kit patterns (shared FE API client, MasterData demo CRUD + page, storage light presign + demo upload, Queues/cron demo ± thin jobs helpers) with docs, example apps green, and `validate:full` green; product teams no longer fork private `apiFetch` / R2 upload hacks as the default.

**Failure in 6 months:** Epic still open or half-shipped while products each ship divergent HTTP clients and upload paths; empty `@gosilex/jobs` (or similar) lands without example consumer; domain strings or hard-coded product routes leak into packages; TD-A-012 remains and B7/B8 quality work cannot rely on stable kit patterns.

**Simplest alternative:** Docs-only playbook pointing at notes + app-local `api.ts` (no package promote, no presign, no queues).

**Why not simplest:** Product fork of `api.ts` is certain; storage debt (no presign) stays; A8 requires live example consumers for anything promoted; four surfaces need reviewable tickets, not a README alone.

## Complexity

**Tier: F-full** — four surfaces (FE package, demo domain CRUD, R2 signing security, CF Queues/cron ops), ordered child tickets, open pins (package name, entity vs notes upgrade, presign mock mode, CI queues), multi-domain security review.

Signals:

- Multi-domain (web client · D1 demo · storage · Workers queues)
- New package and/or storage surface growth
- Security-sensitive (presign secrets, auth on upload routes)
- Spec/analysis already draft with unresolved pins → needs Shape + Build gates
- Epic L with 4 S–M children (Shape A)
