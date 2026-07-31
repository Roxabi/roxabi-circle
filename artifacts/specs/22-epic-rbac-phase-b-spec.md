---
title: "Spec — RBAC Phase B custom roles + module grants"
issue: 22
spark: 127
status: draft
tier: L
date: 2026-07-30
analysis: artifacts/analyses/22-epic-rbac-phase-b-analysis.md
adr: docs/architecture/adr/0003-multi-tenant-rbac-modules.md
---

# Spec — Epic · RBAC Phase B

## Goal

Ship ADR-0003 **Phase B**: per-organization custom roles and per-module grants (`write` \| `read` \| `disabled`), resolved server-side, demoable on example-api (+ minimal admin UI if in scope).

## Data model

```text
organization_roles (
  id, organization_id, key, name, is_system, created_at
)
organization_role_module_grants (
  role_id, module_id, access  -- write | read | disabled
  PRIMARY KEY (role_id, module_id)
)
```

- System roles: `owner|admin|member|reader` with `is_system=true` (immutable key).
- Custom roles: `is_system=false`; keys unique per org.
- Membership still points at a role key (BA `member.role` or kit join — document chosen convention in implement PR).

## Expected behavior

1. Org owner/admin creates custom role + grant matrix for available modules.
2. Effective access = org active ∧ membership ∧ platform.available ∧ org_module.enabled ∧ **grant access**.
3. `disabled` grant denies even if module enabled.
4. System role grants seeded; custom starts from copy-of-member template optional.
5. IDOR: cannot read/write other org roles/grants.
6. No platform-wide live shared role rows.

## Non-goals

| Out |
|---|
| Empty `@gosilex/rbac` package |
| Product LEAD/CONSULTANT keys in kit packages |
| Cross-org role templates live |
| Replacing BA organization plugin |

## Package placement (ADR-0001 / ADR-0003 D13)

| Concern | Owner |
|---|---|
| Pure `can()` / grant types / ceiling helpers | **`@gosilex/auth`** (when non-trivial — A8) |
| D1 migrations + Drizzle schema wire | **`apps/example-api`** (compose package SQL if shipped) |
| Routes, seed, MODULE_IDS, invite assign | **`apps/example-api`** |
| Admin matrix UI | **`apps/example-web`** (optional for Goal 002 exit) |

**Runtime:** one resolver only after Phase B — Phase A code capability map becomes **seed**, not a second path.

## Security annex (normative)

- Default-deny missing grants  
- `is_system` roles immutable (key, delete, grant overwrite)  
- Invite/assign: **capability ceiling** (cannot grant what actor lacks); custom roles not ≅ owner by accident  
- `member.role` ∈ system keys ∪ `organization_roles.key` for that org  
- CP-IDOR ≥ 8 cases (cross-org role CRUD, grant IDOR, ceiling, reader 403, super write default off)  
- Kit invites only; BA native invite paths stay DENY  

## DoD

- [ ] ADR-0003 D4/phasing reflect unpark (docs)
- [ ] Migrations applied in example-api
- [ ] Pure resolver imported from `@gosilex/auth` if non-trivial; used by all module guards
- [ ] Seed + IDOR tests (matrix ≥8)
- [ ] Admin surface: **API required**; UI optional for Goal 002 exit
- [ ] `validate:full` green

## Slices

| S | Content |
|---|---|
| S1 | SQL + Drizzle schema + seed system roles/grants |
| S2 | Pure resolver in `@gosilex/auth` + wire requireModule / services (delete dual code-path) |
| S3 | CRUD routes roles/grants (authz + ceiling) |
| S4 | Tests IDOR + optional example-web matrix |
