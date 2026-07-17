---
title: "Multi-tenant org + RBAC + dual-level modules — technical analysis"
issue: 11
status: approved
date: 2026-07-17
promoted-from: artifacts/analyses/002-multi-tenant-rbac-modules-consensus.md
adr: docs/architecture/adr/0003-multi-tenant-rbac-modules.md
---

# Analysis #11 — Multi-tenant RBAC modules

## Source

Issue [#11](https://github.com/go-silex/silex-boilerplate/issues/11) · Frame approved · ADR-0003 accepted · multi-agent consensus `002-*-consensus.md`.

## Problem

Kit identity exists (HMAC/BA session + `sk_`) and a **global** `kit_modules` row. There is **no** organization tenant, no platform vs org role planes, no per-client module enablement, no org-scoped keys. Products will fork authz unless the kit ships the spine.

## Outcome

Phase A: demo-able multi-tenant kit on BA adapter — create/list orgs, memberships with 4 system roles, platform super_admin/staff, dual-level modules, guards fail-closed, multi-persona seed, IDOR tests green. Products compose without inventing parallel org tables.

## Appetite

One focused implementation cycle (A1→A3). A4 shells can follow if PR size forces split.

## Shapes

### Shape 1: BA organization plugin + kit modules/platform (ω1) — **recommended / ADR-0003**

BA owns `organization` / `member` / `invitation`. Kit owns `user_platform_roles`, `platform_modules`, `organization_modules`. Guards kit-side.

**Trade-offs:** Pro — invites/active-org ecosystem, aligns BA-only. Con — BA schema coupling; dual mental model member.role vs module grants.

**Rough scope:** L

### Shape 2: Kit-only org tables (ω2)

Full custom org/member/invite.

**Trade-offs:** Pro — total control. Con — reimplement BA; rejected by consensus.

**Rough scope:** XL

### Shape 3: Kit now, BA later (ω3)

**Rejected** — double migration + IDOR window.

## Fit Check

**Chosen:** Shape 1 (ADR-0003). Constraints eliminate ω2/ω3. Session dual-path stays ADR-0002; org features require `AUTH_SESSION_ADAPTER=better-auth`.

### Baseline code (worktree @ c511964)

| Area | Today |
|---|---|
| BA factory | `apps/example-api/src/lib/better-auth.ts` — email/password only, no org plugin |
| BA schema | user/session/account/verification |
| Roles | `KitRole = admin\|user` seed map |
| Modules | `kit_modules` global enabled + config_json |
| Authz | `requireAuth` dual-path; no org context |

### Files impacted (Phase A, ≥3)

| Path | Change |
|---|---|
| `packages/auth/migrations/0002_*.sql` | BA org tables |
| `packages/auth/src/*` | role constants, hierarchy, guard ports |
| `apps/example-api/migrations/0006–0007` | org SQL + kit RBAC/modules |
| `apps/example-api/src/lib/better-auth.ts` | organization plugin + AC roles |
| `apps/example-api/src/db/*` | drizzle schema |
| `apps/example-api/src/middleware/*` | org/platform guards |
| `apps/example-api/src/services|repos|routes/*` | modules split, orgs |
| `apps/example-api/src/seed/*` | multi-persona |
| API keys migration | `organization_id` on keys |
| `apps/example-web` | minimal: org context / modules state if needed for smoke |

## Risks

1. BA 1.6 org SQL/session `activeOrganizationId` must be **generated** from plugin, not invented.
2. HMAC default still on — org routes fail-closed unless BA adapter.
3. Module cutover breaks feedback admin until platform+org aware.
4. Super_admin write default off needs explicit flags in code review.

## Unresolved (for spec, not blockers)

- Exact BA 1.6 column names for org plugin (pin at implement).
- A4 shells in this issue vs follow-up (prefer A1–A3 first if PR huge).

## Recommendation

Implement Shape 1 per ADR-0003 Phase A1→A3. Seed-only memberships. No invite API. Org-bound keys. Proceed to `/spec`.
