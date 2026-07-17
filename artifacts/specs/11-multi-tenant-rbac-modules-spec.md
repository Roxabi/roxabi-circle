---
title: "Spec — Multi-tenant org + platform RBAC + dual-level modules (Phase A)"
issue: 11
status: approved
tier: F-full
date: 2026-07-17
frame: artifacts/frames/11-multi-tenant-rbac-modules-frame.md
analysis: artifacts/analyses/11-multi-tenant-rbac-modules-analysis.md
adr: docs/architecture/adr/0003-multi-tenant-rbac-modules.md
---

# Spec #11 — Multi-tenant RBAC modules (Phase A)

## Context

- **Issue:** [#11](https://github.com/go-silex/silex-boilerplate/issues/11)
- **ADR:** [0003](../../docs/architecture/adr/0003-multi-tenant-rbac-modules.md) (accepted)
- **Consensus:** `artifacts/analyses/002-multi-tenant-rbac-modules-consensus.md`
- **Analysis:** `artifacts/analyses/11-multi-tenant-rbac-modules-analysis.md` (Shape 1 / ω1)

## Goal

Ship kit Phase A: Better Auth organizations as tenant spine, platform roles + dual-level modules in kit tables, fail-closed guards, multi-persona seed, IDOR tests, org-bound API keys — all demonstrable on `example-api` with `AUTH_SESSION_ADAPTER=better-auth`.

## Users

| Persona | Need |
|---|---|
| Kit consumer / product app | Compose org + guards without forking tables |
| Super admin | Catalogue modules platform-wide |
| Staff (BO) | Act only on membership-granted orgs |
| Client owner/admin/member/reader | Org-scoped data + effective modules |
| MCP/machine | Org-bound `sk_` |

## Expected Behavior

1. With BA adapter, super_admin (or seed bootstrap) creates organizations (`kind=client`, `status=active`).
2. Solo client: one org + one `owner` membership (UI may hide org later).
3. Team client: multiple members with allowlisted roles `owner|admin|member|reader`.
4. Staff has `user_platform_roles.role=staff` **and** memberships; cannot access orgs without membership.
5. Super_admin manages `platform_modules.available` / global config; cannot silently write tenant business data unless route opts into `allowSuperAdminWrite`.
6. Org admin enables modules only if platform `available`; effective access also requires role grant (code map Phase A).
7. Existing `kit_modules` data migrates to `platform_modules`; services stop writing `kit_modules`.
8. API keys store `organization_id`; use re-checks membership + org active.
9. No public invite/accept API — memberships via seed (and optional internal super_admin seed helpers in tests only).

## Data Model & Consumers

### Core entities

```text
BA:  user, session, account, verification
BA:  organization (+ kind, status), member (role_key), invitation (unused API)
Kit: user_platform_roles (user_id, role super_admin|staff)
Kit: platform_modules (module_id, available, config_json)
Kit: organization_modules (org_id, module_id, enabled, locked, config_json?)
Kit: api_keys (+ organization_id NOT NULL for new keys / migrated multi-tenant)
```

### Effective module access

```text
can(user, org, module, op) =
  org.status = active
  AND (active membership OR super_admin read flag on route)
  AND platform.available
  AND org_module.enabled
  AND role_grant(role_key, op)   -- code: owner/admin/member write; reader read
```

### Consumers

| Consumer | Fields / behavior | This issue |
|---|---|---|
| `requireOrgContext` | org id path/header, membership, status | yes |
| Platform module routes | platform_modules | yes |
| Org module routes | organization_modules | yes |
| Feedback integration | config on platform_modules; enable per org | yes (migrate) |
| example-web modules UI | effective flags (minimal smoke) | yes if broken by cutover |
| Invite UI | — | no |
| Custom roles UI | — | no (Phase B) |

## Breadboard

### API affordances

| ID | Affordance | Handler | Data |
|---|---|---|---|
| N1 | `GET /api/orgs` | list orgs for subject (memberships; super_admin all) | member + organization |
| N2 | `POST /api/orgs` | create org + owner membership + default org_modules rows | organization, member, organization_modules |
| N3 | `GET /api/orgs/:orgId` | get org if context ok | organization |
| N4 | `GET /api/orgs/:orgId/members` | list members (admin+) | member |
| N5 | `GET /api/platform/modules` | list platform module state | platform_modules |
| N6 | `PATCH /api/platform/modules/:id` | set available (super_admin, session) | platform_modules |
| N7 | `GET /api/orgs/:orgId/modules` | org module rows + effective | organization_modules ∩ platform |
| N8 | `PATCH /api/orgs/:orgId/modules/:id` | set enabled if available (manage_modules role) | organization_modules |
| N9 | Existing `/api/integrations/feedback` | super_admin platform config; gate on available | platform config_json |
| N10 | API key mint/list | require org context; store organization_id | api_keys |
| N11 | Dual auth | session or org-bound key | SessionPort + keys |

### Guards

| ID | Guard | Rule |
|---|---|---|
| G1 | `requireSession` / dual auth | ADR-0002 |
| G2 | `requirePlatformRole` | kit `user_platform_roles` |
| G3 | `requireOrgContext` | path orgId preferred; header fallback; activeOrg last; mismatch 403 |
| G4 | `requireOrgRole(min)` | owner>admin>member>reader |
| G5 | `requireModule(id, op)` | effective access formula |
| G6 | Super_admin | read: `allowSuperAdmin`; write: `allowSuperAdminWrite` default false |

### Wiring

```text
Request → identity (G1) → optional G2 → G3 → G4/G5 → service → repo (always org_id predicate)
```

## Slices

| Slice | Demo-able increment | Depends |
|---|---|---|
| **S1 — A1 Org spine** | BA org plugin, migrations, create/list org + members seed roles, org routes G3/G4 | — |
| **S2 — A2 Platform + modules** | user_platform_roles, platform/org modules, migrate kit_modules, N5–N8, feedback config move | S1 |
| **S3 — A3 Hardening** | Multi-persona seed, IDOR test matrix, org-bound keys N10, adapter fail-closed on HMAC for org routes | S1, S2 |

A4 shells (`/admin`, `/app`) = **out of this spec** unless S1–S3 land small; track follow-up.

## Success Criteria

- [ ] BA organization plugin enabled when `AUTH_SESSION_ADAPTER=better-auth` (migrations applied; schema matches BA 1.6 plugin)
- [ ] Org `kind` ∈ {client,internal} and `status` ∈ {active,suspended,archived} stored and enforced (non-active → deny data plane)
- [ ] `member.role` allowlist: owner|admin|member|reader only
- [ ] `user_platform_roles` supports super_admin|staff; org admin cannot mutate platform_role
- [ ] `platform_modules` + `organization_modules` live; `kit_modules` no longer written (migrated)
- [ ] Effective module formula implemented and tested (available∧enabled∧role)
- [ ] `locked` column exists DEFAULT 0; no required API for locked in Phase A
- [ ] Guards G1–G6 exist; org context resolution order path > header > activeOrg; mismatch 403
- [ ] Super_admin tenant write requires `allowSuperAdminWrite`; default routes deny
- [ ] Staff without membership cannot read/write foreign org (404/403)
- [ ] Seed personas: super_admin, staff (acme admin + beta member), solo owner, team owner, team reader
- [ ] IDOR matrix: ≥10 automated cases covering cross-org + cross-role (reader write deny, staff solo deny, key wrong org deny)
- [ ] New API keys require `organization_id`; verify rejects other org
- [ ] No public invite/accept routes
- [ ] Org/RBAC routes fail closed when adapter is hmac (501/404 documented)
- [ ] `bun run validate:full` green on feature branch
- [ ] ADR-0003 committed on branch with implementation

## Edge Cases

| Case | Handling |
|---|---|
| Last owner demote/remove | 403 |
| Suspended org | 403 `ORG_SUSPENDED` (or FORBIDDEN) |
| Disabled member | 403 |
| Enable unavailable module | 404/403 |
| Missing org on tenant route | 400/403 |
| HMAC adapter + org route | fail closed |
| Platform config secrets | mask on read; super_admin write only |
| Multi-membership wrong activeOrg | 403 if conflicts with path org |

## Ambiguity

None blocking. Implement-time pin: exact BA 1.6 SQL for organization plugin (generate from BA docs/schema, do not invent).

## Out of Scope (restate)

Phase B custom roles · invite API · A4 shells (optional follow-up) · share private_acl · billing · GitHub OAuth providers (separate) · HMAC default cutover (A0 parallel)

## Implementation notes

| Package | Owns |
|---|---|
| `@gosilex/auth` | SQL 0002 org; role keys; hierarchy helpers; pure guard factories with ports |
| `example-api` | wire BA plugin, drizzle, routes, seed, tests |
| `example-web` | fix any broken modules/admin UI from cutover |

Default system role capability map (code):

| | owner | admin | member | reader |
|---|---|---|---|---|
| read | ✓ | ✓ | ✓ | ✓ |
| write | ✓ | ✓ | ✓ | ✗ |
| manage_members | ✓ | ✓ | ✗ | ✗ |
| manage_modules | ✓ | ✓ | ✗ | ✗ |
| delete_org | ✓ | ✗ | ✗ | ✗ |
