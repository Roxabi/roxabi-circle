---
title: 'ADR-0003 — Multi-tenant organization, platform RBAC, dual-level modules'
status: accepted
date: 2026-07-17
amended: 2026-07-30
axial: false
consensus: artifacts/analyses/002-multi-tenant-rbac-modules-consensus.md
supersedes_notes: >
  2026-07-30: A0 = HMAC session retired (see ADR-0002 amend).
  Phase B custom roles unparked as planned ship (after A4/invites UX);
  no longer « path only / park forever ».
---

# ADR-0003 — Multi-tenant organization, platform RBAC, dual-level modules

## Context

Chemin A kit must support multi-actor SaaS on Cloudflare (Workers · Hono · D1 · Better Auth):

1. **Client space** — users only see data for their client organization(s).
2. **Back-office** — staff operate across granted clients.
3. **Platform ops** — super admin configures what exists on the platform.
4. **Modules** — features can be available platform-wide, then enabled per client.
5. **Solo vs team client** — one person *or* many people under the same client; one data model only.

Spark / Metalyde / Ether are **inspiration only**. This kit is the **schema SSoT**; product apps converge here.

Session identity is covered by [ADR-0002](./0002-session-hmac-interim-vs-better-auth.md) (`SessionPort`, **Better Auth only**, dual credential cookie \| `sk_`). This ADR covers **tenancy + authorization + modules** on top of identity. Org/RBAC surfaces assume BA session (HMAC retired).

Human + multi-agent consensus (architect, security-auditor, backend-dev):  
[`artifacts/analyses/002-multi-tenant-rbac-modules-consensus.md`](../../../artifacts/analyses/002-multi-tenant-rbac-modules-consensus.md).

## Options considered

### ω1 — Better Auth organization plugin + kit authz/modules (chosen)

- **Pros:** Aligns with BA session path; org/member/invitation APIs; less custom invite/membership code.
- **Cons:** Schema coupled to BA plugin versions; module matrix stays kit-side (dual mental model).

### ω2 — Kit-only organization / member / invitation tables

- **Pros:** Full control of every column and Phase B custom roles.
- **Cons:** Reimplements invites, active-org, edge cases while already on BA for sessions.

### ω3 — Kit tables now, migrate to BA organization later

- **Pros:** Ships org FKs before BA plugin wiring.
- **Cons:** Double migration; long IDOR window; rejected by panel.

## Decision

### D1 — Tenant is always `organization`

- There is **no** separate “solo client without org” model.
- Solo client = create organization + one membership `owner` (UI may hide the org concept).
- Multi-user client org = same tables, N memberships.
- Organization fields (BA plugin + `additionalFields`):

| Field | Values / notes |
|---|---|
| `id`, `name`, `slug` | BA standard |
| `kind` | `client` \| `internal` |
| `status` | `active` \| `suspended` \| `archived` |

### D2 — Identity spine vs kit authz plane

| Concern | Owner |
|---|---|
| User, session, account, OAuth providers | **Better Auth core** (+ social/OIDC plugins as needed) |
| Organization, member, invitation tables | **Better Auth `organization` plugin** |
| System org role on membership | **`member.role` = role_key string** |
| Platform role (`super_admin` \| `staff`) | **Kit table `user_platform_roles`** |
| Module catalogue + per-org enablement | **Kit tables** (not BA access-control statements) |
| Phase B custom roles + per-module grants | **Kit tables** (future) |

**Better Auth organization plugin** is still Better Auth — optional module that adds tenant tables/APIs. It is **not** a second auth product.

Org/RBAC features require a **Better Auth session** (ADR-0002 BA-only). Machine clients use org-bound **`sk_`** where allowed; there is no HMAC session path.

### D3 — System org roles (Phase A)

Allowlisted on `member.role`:

```text
owner > admin > member > reader
```

| role_key | Intent |
|---|---|
| `owner` | Full org control (incl. delete org / transfer ownership rules) |
| `admin` | Members + org modules + write business data |
| `member` | Standard write |
| `reader` | Read-only |

Default capability matrix is **code seed** in Phase A (not DB). Server rejects any other role string.

### D4 — Phase B custom roles (planned ship — unparked 2026-07-30)

Without rewriting the tenant spine, Phase B adds fine-grained grants:

```text
organization_roles (per org, is_system flag)
organization_role_module_grants (role_id, module_id, access: write | read | disabled)
```

- Custom roles are **per-organization first** (no live shared platform templates with `organization_id NULL`).
- Templates later = copy-on-create blueprints, not live shared grant rows.
- System roles `owner|admin|member|reader` remain `is_system=true` with seed capability matrix as defaults.
- Custom role keys map via `member.role` / membership role field per BA + kit convention; **fine grants resolve kit-side** (not BA static AC alone).
- **Empty `@gosilex/rbac` package forbidden** — helpers live in `@gosilex/auth` (pure) and/or app services until ≥2 call sites (A8).
- **Ship order:** after BA-only (ADR-0002 A0) + A4 shells/invites (UX to exercise grants). Implementation epic: GitHub (RBAC Phase B).

### D5 — Platform roles

| platform_role | Meaning |
|---|---|
| `super_admin` | Platform catalogue, global config, optional cross-org support flags |
| `staff` | Back-office shell; **data access only via org memberships** |
| *(absent)* | Pure client (or no platform privileges) |

Storage: kit table (not BA user `additionalFields` client-writable):

```text
user_platform_roles (
  user_id TEXT PRIMARY KEY,  -- BA user.id
  role TEXT NOT NULL,        -- super_admin | staff
  updated_at INTEGER NOT NULL
)
```

- Org admins **cannot** set `platform_role` or `platform_modules.available`.
- Staff **never** bypasses membership for tenant data.

### D6 — Staff access = membership only

No parallel `org_grants` table. Staff who work client Acme have a normal `member` row on Acme.  
`platform_role=staff` opens BO UI / listing of **their** memberships, not all orgs.

### D7 — Modules: two levels

**Code registry** (app-owned): `MODULE_IDS` + metadata (labels, requiresConfig). Not product domain strings in packages.

**Level 1 — platform (super_admin):**

```text
platform_modules (
  module_id TEXT PRIMARY KEY,
  available INTEGER NOT NULL,   -- exposed on the platform?
  config_json TEXT,            -- global secrets/config (masked on read)
  updated_at INTEGER NOT NULL
)
```

**Level 2 — per organization (org admin / BO with manage_modules):**

```text
organization_modules (
  organization_id TEXT NOT NULL,
  module_id TEXT NOT NULL,
  enabled INTEGER NOT NULL,
  locked INTEGER NOT NULL DEFAULT 0,  -- column Phase A; API/UX later, server-enforced when exposed
  config_json TEXT,
  PRIMARY KEY (organization_id, module_id)
)
```

| Actor | Can |
|---|---|
| Super admin | Set `available`, global `config_json` |
| Org admin / BO admin | Set `enabled` (and later `locked`) **only if** `available` |
| End user | Consume **effective** modules per role grants |

**Effective access (normative):**

```text
can(user, org, module, op) =
  org.status = active
  AND membership active (or route-level super_admin flag)
  AND platform_modules.available
  AND organization_modules.enabled
  AND role_grant(role_key, module, op)   -- Phase A: code map
  AND (op ≠ write OR grant allows write)
```

Migrate existing `kit_modules` → `platform_modules` (`enabled` → `available`); stop dual-write; drop `kit_modules` after cutover.

### D8 — Org context on requests

| Layer | Rule |
|---|---|
| SPA UX | BA active organization allowed as default |
| Authorization | **Explicit org id** preferred (path `/orgs/:orgId/...`); else validated header (e.g. `X-Org-Id`) |
| Resolution order | path → header → active org |
| Mismatch | **403** (never silent wrong-tenant write) |
| Every data query | `WHERE organization_id = ?` fail-closed |

### D9 — Super_admin support semantics

| Operation | Default |
|---|---|
| Platform routes (catalogue, global config, list orgs) | `requirePlatformRole('super_admin')` |
| Cross-org **read** tenant data | Opt-in per guard: `allowSuperAdmin: true` + **audit** (actor, org, action, requestId) |
| Cross-org **write** tenant data | **Default off**; break-glass only via `allowSuperAdminWrite` on named routes + audit |
| Staff | Never cross-org without membership |

Support may diagnose with read; write is rare and explicit.

### D10 — Invitations (Phase A)

- **Seed-only memberships** for demos and early kit.
- Do **not** expose invite/accept product APIs until threat model is closed (role ceiling, email bind, TTL, single-use, no platform fields, rate limits).
- BA `invitation` table may exist via the plugin; unused by public kit routes in Phase A.

### D11 — API keys (machine / MCP)

- Dual credential **session \| Bearer `sk_`** remains (ADR-0002).
- Multi-tenant keys are **org-bound**: store `organization_id` (+ optional scopes); re-check membership + org active on every use.
- **Subject-global multi-org keys are forbidden.**
- Mint: **session only** (not from another key without explicit policy).

### D12 — Guards (compose, fail-closed)

```text
requireSession | requireApiKey   -- identity
requirePlatformRole(min?)        -- platform plane
requireOrgContext(orgRef)        -- membership or flagged super_admin
requireOrgRole(minRole?)         -- owner > admin > member > reader
requireModule(moduleId, op?)     -- effective module access
```

Protected by default; public routes explicit. Prefer **404** on cross-tenant resource IDOR; **403** on authenticated “not allowed” management actions (stable codes in `@gosilex/core` / types).

### D13 — Package placement (ADR-0001)

| Location | Owns |
|---|---|
| `@gosilex/auth` | SQL compose artifacts for BA org (+ kit RBAC SQL if shared); role constants; pure hierarchy helpers; thin guard factories with injected ports (**no** product `MODULE_IDS`) |
| `apps/example-*` | Drizzle wire-up, routes, seed multi-persona, module registry, integration tests |
| New `@gosilex/rbac` / `@gosilex/tenancy` | **No** empty package in Phase A (promote only at two call sites or superseding ADR) |

### D14 — Seed acceptance (kit demo)

| Persona | platform_role | Memberships |
|---|---|---|
| Super admin | super_admin | optional |
| Staff A | staff | org_acme `admin`, org_beta `member` |
| Solo client | — | org_solo `owner` (sole member) |
| Team owner | — | org_team `owner` |
| Team reader | — | org_team `reader` |

Modules: e.g. `feedback` available on platform; enabled on acme; disabled on beta.

IDOR / cross-role tests are a **quality gate** for tenant routes (see consensus matrix / `docs/testing.md` CP-IDOR extensions).

## Phasing

| Phase | Scope | Status (2026-07-30) |
|---|---|---|
| **A0** | Session BA-only — **HMAC retired** (ADR-0002 amend) | **In progress** (epic B2 / GH #14) |
| **A1** | BA `organization` plugin + four roles + org `kind`/`status` | **Shipped** (#11) |
| **A2** | `user_platform_roles` + `platform_modules` + `organization_modules` + migrate `kit_modules` | **Shipped** (#11) |
| **A3** | Guards + multi-persona seed + IDOR matrix CI; org-bound API keys | **Shipped** (#11) |
| **A4** | Demo shells `/admin` (BO) + `/app` (client-scoped) + invites UX | **Planned** (epic B3 / GH #15) |
| **B** | Custom org roles + per-module write/read/disabled matrix | **Unparked — planned ship** after A0+A4 |

## Consequences

### Positive

- One tenant model for solo and multi-user clients.
- Clear split: BA identity/tenancy spine vs kit platform/modules.
- Dual-level modules match real SaaS (platform catalogue → per-client activation).
- Super_admin and API keys constrained against silent cross-tenant blast radius.
- Phase B custom roles do not require a second tenant system.

### Negative / accepted debt

- Coupling to Better Auth organization schema/migrations.
- Two stores to reason about (`member.role` vs kit module grants / Phase B custom grants).
- Invite UX was seed-only in Phase A — productized in A4 epic.
- Phase B increases authz complexity (IDOR matrix must grow with custom roles).

### Neutral

- Spark/Metalyde/Ether remain reference products; they do not define kit vocabulary (`LEAD`/`CONSULTANT` stay product-specific).

## Anti-patterns

- Separate “solo user client” table that bypasses organization.
- `platform_role` settable via invite, signup body, or org-admin APIs.
- Staff listing/acting on all orgs without membership.
- Super_admin write-all default inside `requireOrgContext`.
- Subject-global API keys across multiple orgs.
- Authorizing mutations from BA active-org cookie alone (no path/header re-check).
- Module enablement only in BA static AC statements (no D1 available/enabled).
- Empty `@gosilex/rbac` package “for later”.
- Copying share-frame `private_acl` / GitHub org recheck as kit multi-tenant spine.

## Related

- [ADR-0001](./0001-primary-axis-packages-compose-apps.md) — packages compose apps  
- [ADR-0002](./0002-session-hmac-interim-vs-better-auth.md) — BA-only session + `sk_` dual-path  
- Consensus: `artifacts/analyses/002-multi-tenant-rbac-modules-consensus.md`  
- Cross-app features: `artifacts/analyses/001-cross-app-features-metalyde-ether-enzo-spark.md`  
- Phase A modules: `platform_modules` / `organization_modules` (legacy `kit_modules` migrated in #11)
