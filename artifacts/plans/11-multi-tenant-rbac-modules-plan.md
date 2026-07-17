---
title: "Plan: Multi-tenant org + platform RBAC + dual-level modules (Phase A)"
issue: 11
spec: artifacts/specs/11-multi-tenant-rbac-modules-spec.md
complexity: 8/10
tier: F-full
generated: 2026-07-17
status: approved
---

# Plan #11 — Multi-tenant RBAC modules (Phase A)

## Summary

Implement ADR-0003 Phase A on the kit: Better Auth **organization** plugin as tenant spine; kit tables for platform roles + dual-level modules; guards; multi-persona seed; org-bound API keys; IDOR tests. Three vertical slices **S1→S2→S3**. No invite API. Org routes require `AUTH_SESSION_ADAPTER=better-auth`.

## Architecture sketch (F-full gate)

### (a) Component boundaries

| Component | Responsibility |
|---|---|
| Better Auth + org plugin | Identity, session, organization/member/invitation rows |
| `@gosilex/auth` | Role constants, hierarchy, pure dual-auth + org guard factories (ports), SQL compose |
| `example-api` services/repos | Platform/org modules, membership resolve, key org scope |
| `example-api` middleware/routes | HTTP surface, fail-closed adapter gate |
| `example-api` seed/tests | Personas + IDOR matrix |
| `example-web` | Minimal fix if modules UI breaks |

### (b) Data flow

```text
Request
  → requireAuth (session | org-bound sk_)
  → requirePlatformRole? (user_platform_roles)
  → requireOrgContext (path orgId > X-Org-Id > activeOrg; re-check member)
  → requireOrgRole? / requireModule?
  → service → repo (WHERE organization_id = ?)
  → JSON envelope + requestId
```

### (c) State ownership

| State | Owner |
|---|---|
| Session cookie | Better Auth |
| Org membership / role_key | BA `member` |
| platform_role | kit `user_platform_roles` |
| Module available/enabled | kit platform/org module tables |
| API key org binding | kit `api_keys.organization_id` |

### (d) Integration points

- D1 migrations (package ship, app apply)
- BA drizzle adapter schema extension
- Existing feedback integration config → `platform_modules.config_json`
- Lefthook `validate:full`

## Bootstrap Context

- Worktree: `.claude/worktrees/11-multi-tenant-rbac-modules` · branch `feat/11-multi-tenant-rbac-modules`
- Baseline: PR #10 BA dual-path on main (`c511964`)
- Refs: ADR-0003, consensus 002, analysis/spec #11
- Patterns: `createRequireAuth`, `kit_modules` services, `seed/demo-data.ts`, `app.test.ts` IDOR notes

## Agents

| Agent | Tasks | Files focus |
|---|---|---|
| backend-dev-A | T1–T4 | BA org plugin, migrations, schema |
| backend-dev-B | T5–T8 | platform/org modules migrate, routes |
| backend-dev-C | T9–T11 | guards, keys org-bound, HMAC fail-closed |
| tester-A | T12–T13 | seed + IDOR matrix |
| frontend-dev-A | T14 | example-web modules smoke if needed |
| doc-writer-A | T15 | ADR commit on branch, AGENTS pointer optional |

## Wave Structure

3 waves, max 2 parallel agents.

| Wave | Trigger | Agents | Tasks |
|---|---|---|---|
| 1 | start | backend-dev-A | T1→T2→T3→T4 (S1 org spine) |
| 2 | Wave 1 done | backend-dev-B ∥ backend-dev-C | T5–T8 modules · T9–T11 guards/keys |
| 3 | Wave 2 done | tester-A → frontend-dev-A → doc-writer-A | T12–T15 seed/tests/UI/docs |

### Budget — per task

| Task | Class | Est. ops |
|---|---|---|
| T1 Generate/pin BA org SQL | exploratory | 12 |
| T2 Wire organization plugin + AC roles | judgmental | 6 |
| T3 Org CRUD services/routes | judgmental | 6 |
| T4 Member list + role allowlist | bounded | 3 |
| T5 user_platform_roles + migrate kit_modules | judgmental | 6 |
| T6 organization_modules + defaults on org create | judgmental | 5 |
| T7 Platform/org module routes | judgmental | 5 |
| T8 Feedback config → platform | bounded | 4 |
| T9 Guards G2–G6 | judgmental | 6 |
| T10 API keys organization_id | judgmental | 5 |
| T11 HMAC org routes fail-closed | bounded | 3 |
| T12 Multi-persona seed | judgmental | 5 |
| T13 IDOR test matrix | exploratory | 12 |
| T14 example-web smoke | bounded | 3 |
| T15 Docs/ADR on branch | trivial | 2 |

**Total estimated ops: ~83** (split across waves/agents)

### Budget — per agent instance

| Instance | Tasks | Σ ops | Subjects |
|---|---|---|---|
| backend-dev-A | T1–T4 | 27 | schema, org-api |
| backend-dev-B | T5–T8 | 20 | modules |
| backend-dev-C | T9–T11 | 14 | guards, keys |
| tester-A | T12–T13 | 17 | seed, idor |
| frontend-dev-A | T14 | 3 | web |
| doc-writer-A | T15 | 2 | docs |

## Micro-Tasks

### Slice S1 — Org spine (Wave 1)

#### T1 — BA organization migrations
- **Files:** `packages/auth/migrations/0002_better_auth_organization.sql`, `apps/example-api/migrations/0006_better_auth_organization.sql`
- **Do:** Generate schema for BA 1.6 org plugin (organization, member, invitation, session active org column if required). App copies package SQL.
- **Verify:** `ls packages/auth/migrations/0002_better_auth_organization.sql`
- **Agent:** backend-dev-A · **Subject:** schema · **Spec:** SC org plugin
- **Phase:** GREEN · **[P]:** N

#### T2 — Wire BA organization plugin
- **Files:** `apps/example-api/src/lib/better-auth.ts`, `apps/example-api/src/db/better-auth-schema.ts`
- **Do:** `organization({ ac, roles: owner/admin/member/reader, schema additionalFields kind/status })`.
- **Verify:** typecheck package/api
- **Agent:** backend-dev-A · **Subject:** ba-plugin · **Spec:** SC roles allowlist
- **Phase:** GREEN · **deps:** T1

#### T3 — Org create/list/get
- **Files:** `apps/example-api/src/routes/orgs.ts`, services/repos as needed, `app.ts` mount
- **Do:** N1–N3; create seeds owner membership + later org_modules hooks (stub defaults empty until T6).
- **Agent:** backend-dev-A · **Subject:** org-api · **deps:** T2

#### T4 — Members list + role allowlist
- **Files:** org members route; `@gosilex/auth` `ORG_ROLE_KEYS`, `roleAtLeast`
- **Do:** N4; reject non-allowlisted roles server-side.
- **Agent:** backend-dev-A · **Subject:** roles · **deps:** T3
- **RED-GATE S1:** org create + member list works under BA adapter in test

### Slice S2 — Platform + modules (Wave 2)

#### T5 — user_platform_roles + platform_modules migration
- **Files:** `apps/example-api/migrations/0007_rbac_modules.sql`, schema, repos
- **Do:** tables + `INSERT SELECT` kit_modules → platform_modules (enabled→available).
- **Agent:** backend-dev-B · **Subject:** modules · **deps:** T4

#### T6 — organization_modules + org create defaults
- **Files:** services org create, modules repos
- **Do:** PK (org, module); locked DEFAULT 0; on org create insert rows for available modules (enabled=false default or product policy: false).
- **Agent:** backend-dev-B · **deps:** T5

#### T7 — Platform + org module routes
- **Files:** routes platform/modules, orgs/:id/modules
- **Do:** N5–N8 with super_admin / manage_modules.
- **Agent:** backend-dev-B · **deps:** T6

#### T8 — Feedback integration → platform config
- **Files:** `services/modules.ts`, integrations routes
- **Do:** stop kit_modules writes; config on platform_modules; enable checks dual-level.
- **Agent:** backend-dev-B · **deps:** T7
- **RED-GATE S2:** migrate row visible; patch available + org enable works

### Slice S3 — Hardening (Wave 2–3)

#### T9 — Guards G2–G6
- **Files:** `packages/auth/src/*`, `apps/example-api/src/middleware/*`
- **Do:** requirePlatformRole, requireOrgContext (order path>header>activeOrg), requireOrgRole, requireModule; super_admin write flag default off.
- **Agent:** backend-dev-C · **Subject:** guards · **deps:** T4 (parallel with B after S1)

#### T10 — API keys org-bound
- **Files:** migrations alter api_keys, mint/list services, dual-auth lookup
- **Do:** organization_id required; re-check membership; mint session-only.
- **Agent:** backend-dev-C · **Subject:** keys · **deps:** T9

#### T11 — HMAC fail-closed for org routes
- **Files:** middleware or route mount
- **Do:** when adapter≠better-auth, org/platform RBAC routes 501/404.
- **Agent:** backend-dev-C · **deps:** T9

#### T12 — Multi-persona seed
- **Files:** `seed/*`, scripts seed-local
- **Do:** super_admin, staff acme+beta, solo owner, team owner/reader; feedback available; acme enabled beta disabled.
- **Agent:** tester-A · **deps:** T8, T10

#### T13 — IDOR test matrix
- **Files:** `apps/example-api/src/**/*.test.ts`
- **Do:** ≥10 cases (cross-org, reader write deny, staff solo deny, key wrong org, super_admin write default deny, hmac org route deny).
- **Agent:** tester-A · **deps:** T12
- **RED-GATE S3:** tests green

#### T14 — example-web smoke
- **Files:** modules/admin UI if broken
- **Do:** minimal adapt to new modules API.
- **Agent:** frontend-dev-A · **deps:** T13

#### T15 — Artifacts on branch
- **Files:** ADR-0003, analyses, frame, spec, plan
- **Do:** ensure all design artifacts committed on feature branch (not only main working copy).
- **Agent:** doc-writer-A · **deps:** T13

## Consistency Report

| Spec SC / breadboard | Tasks |
|---|---|
| BA org plugin | T1–T2 |
| kind/status | T1–T2 |
| role allowlist | T2, T4 |
| platform_roles | T5, T9 |
| dual modules + migrate | T5–T8 |
| guards G1–G6 | T9 |
| super_admin write off | T9, T13 |
| seed personas | T12 |
| IDOR ≥10 | T13 |
| org-bound keys | T10, T13 |
| no invite API | — (non-goal; verify absent) |
| hmac fail-closed | T11, T13 |
| validate:full | post T13 orchestrator |

Uncovered: A4 shells — explicit out of plan.

## Task Seeding Blueprint

### Wave 1

| Task | Agent instance | blockedBy | Subject |
|---|---|---|---|
| T1 | backend-dev-A | — | schema |
| T2 | backend-dev-A | T1 | ba-plugin |
| T3 | backend-dev-A | T2 | org-api |
| T4 | backend-dev-A | T3 | roles |

### Wave 2

| Task | Agent instance | blockedBy | Subject |
|---|---|---|---|
| T5 | backend-dev-B | T4 | modules |
| T6 | backend-dev-B | T5 | modules |
| T7 | backend-dev-B | T6 | modules |
| T8 | backend-dev-B | T7 | modules |
| T9 | backend-dev-C | T4 | guards |
| T10 | backend-dev-C | T9 | keys |
| T11 | backend-dev-C | T9 | guards |

### Wave 3

| Task | Agent instance | blockedBy | Subject |
|---|---|---|---|
| T12 | tester-A | T8,T10 | seed |
| T13 | tester-A | T12 | idor |
| T14 | frontend-dev-A | T13 | web |
| T15 | doc-writer-A | T13 | docs |

## Task IDs

<!-- Populated after plan approval with session task ids if available -->
- T1: pending — schema
- T2: pending — ba-plugin
- T3: pending — org-api
- T4: pending — roles
- T5: pending — modules-platform
- T6: pending — modules-org
- T7: pending — modules-routes
- T8: pending — feedback-migrate
- T9: pending — guards
- T10: pending — keys
- T11: pending — hmac-gate
- T12: pending — seed
- T13: pending — idor
- T14: pending — web
- T15: pending — docs

## Implement notes

- Prefer working in worktree path above.
- Pin BA org SQL from better-auth 1.6.x docs/schema — do not invent columns.
- Human security review before merge (auth/tenant).
- Commit only on user request (AGENTS); plan approval ≠ auto-commit unless user says so.
