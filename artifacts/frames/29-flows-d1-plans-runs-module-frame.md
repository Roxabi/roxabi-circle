---
title: "feat(flows): D1 flow_plans/flow_runs + module catalogue flows"
issue: 29
status: approved
normative: false
tier: F-lite
date: 2026-08-07
---

## Problem

`@kit/flows` pure core shipped (Roxabi/roxabi-boilerplate-cf#28 / PR Roxabi/roxabi-boilerplate-cf#37) with a **sketch-only** SQL file under `packages/flows/migrations/` that is explicitly **not** applied by wrangler. Without real D1 tables and without registering `flows` in the platform module catalogue (ADR-0003), admin API (Roxabi/roxabi-boilerplate-cf#31) and Workflows (Roxabi/roxabi-boilerplate-cf#30) have nowhere durable and multi-tenant-safe to store plans/runs, and RBAC/module enablement cannot gate the surface.

Why now: Roxabi/roxabi-boilerplate-cf#28 unblocked this slice; issue sequence marks Roxabi/roxabi-boilerplate-cf#29 as **NEXT** (with Roxabi/roxabi-boilerplate-cf#30). Shipping persistence + catalogue registration is the minimal platform bridge before HTTP/admin.

Observable impact today: `KIT_MODULE_IDS = ['demo']` only; no `flow_plans` / `flow_runs` in `apps/example-api/migrations`; no Drizzle tables for flows.

## Who

- **Primary:** kit maintainers / product consumers who enable the flows platform module and later expose admin APIs.
- **Secondary:** operators of example-api dogfood (migrations, module bootstrap, org-scoped data).

## Constraints

- **`org_id` NOT NULL** on every `flow_plans` / `flow_runs` row — IDOR-ready shape (no global unscoped rows).
- Align with sketch in `packages/flows/migrations/0001_flows_plans_runs.sql` (copy + adapt into `apps/example-api/migrations`).
- Register **`flows`** in `KIT_MODULE_IDS` + platform_modules seed path (ADR-0003 dual-level modules).
- Drizzle/schema wiring when example-api uses typed tables.
- Prefer land before Roxabi/roxabi-boilerplate-cf#23 (Zod 4) to avoid concurrent schema/table churn.
- Child of Roxabi/roxabi-boilerplate-cf#16; blocks Roxabi/roxabi-boilerplate-cf#31; parallel OK with Roxabi/roxabi-boilerplate-cf#30 (Workflows).

## Out of Scope

- Admin HTTP routes for plans/runs/enable (Roxabi/roxabi-boilerplate-cf#31).
- CF Workflows adapter / `step.do` (Roxabi/roxabi-boilerplate-cf#30).
- Pure core YAML/check/grant/snapshot logic (already Roxabi/roxabi-boilerplate-cf#28).
- Product-domain flow plans (kit remains 0 métier strings).
- Org-level enable UX polish beyond catalogue seed / module id registration.

## Premise Validity

**Success in 6 months:** example-api applies a versioned migration creating `flow_plans` + `flow_runs` with required `org_id` (+ indexes); `flows` is a first-class kit module id seeded into `platform_modules`; Drizzle schema mirrors tables so Roxabi/roxabi-boilerplate-cf#31 can query org-scoped without raw SQL sprawl.

**Failure in 6 months:** tables exist without `org_id` or with nullable org → cross-tenant leak class; or module never registered → Roxabi/roxabi-boilerplate-cf#31 cannot gate on `flows` / platform catalogue; or sketch and applied migration diverge silently.

**Simplest alternative:** apply the sketch SQL only, skip `KIT_MODULE_IDS` / platform seed.
**Why not simplest:** ADR-0003 makes module catalogue + org enablement the control plane for optional surfaces; without `flows` in the registry, enable/RBAC paths stay demo-only and Roxabi/roxabi-boilerplate-cf#31 has no module id to gate.

## Complexity

**Tier: F-lite** — clear acceptance, single domain (D1 + module catalogue in example-api / kit modules), known patterns from ADR-0003 modules and existing migrations; no new architecture beyond wiring known sketch.

Signals: multi-file but bounded (migration + kit-modules + schema + tests); deps (Roxabi/roxabi-boilerplate-cf#28) closed; parent epic Roxabi/roxabi-boilerplate-cf#16 open; no multi-domain redesign.
