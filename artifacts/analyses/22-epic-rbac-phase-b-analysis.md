---
title: "RBAC Phase B — custom org roles + module grants — analysis"
issue: 22
spark: 127
status: draft
date: 2026-07-30
adr: docs/architecture/adr/0003-multi-tenant-rbac-modules.md
---

# Analysis — Epic · RBAC Phase B

## Context

ADR-0003 D4 defined Phase B tables; previously park (B8). **Unparked 2026-07-30** after BA-only decision and no upstream consumers. Phase A system roles remain; products need custom roles + per-module access matrix.

## Outcome

- Migrations: `organization_roles`, `organization_role_module_grants`
- Seed system roles as `is_system` rows (or keep code matrix + DB for custom only — **prefer DB system rows for one resolver**)
- Resolver: `can(user, org, module, op)` includes grant table
- Admin API minimal: list/create custom role, set grants (org admin / owner only)
- example-web `/admin` or settings: matrix UI minimal **or** API+seed first if UI slips
- IDOR tests expanded

## Depends

1. **B2** HMAC cut / BA-only  
2. **B3** A4 shells + invites (exercise memberships) — hard dependency for UX; API can start after B2  

## Shape

**ω1 (ADR):** kit tables + kit-side grant resolution. No empty `@gosilex/rbac`. No platform-shared live templates (`organization_id NULL`).

## Risks

| Risk | Mitigation |
|---|---|
| Grant bypass vs BA AC | Single server resolver; FE never authoritative |
| Super_admin write creep | Keep allowSuperAdminWrite opt-in |
| N×M product roles in package | Product-specific role names stay in app seed, not `@gosilex/*` strings |
