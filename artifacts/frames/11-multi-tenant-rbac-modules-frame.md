---
title: Multi-tenant org + platform RBAC + dual-level modules (Phase A)
issue: 11
status: approved
tier: F-full
date: 2026-07-17
---

# Frame — Multi-tenant RBAC modules (Phase A)

## Problem

The Chemin A kit has identity (session cookie / `sk_`) and a global `kit_modules` switch, but **no first-class multi-tenant model**. Product SaaS needs:

1. **Client space** — users only access their client’s data (solo person or multi-user client org).
2. **Back-office** — staff operate across *granted* clients only.
3. **Platform ops** — super admin controls which modules exist on the platform; BO/admin enables them per client.

Without this spine, every product re-forks org/RBAC (Metalyde, Spark, Ether patterns diverge). ADR-0003 is accepted; this issue implements **Phase A** on the kit.

## Who

- **Primary:** GOSILEX kit consumers (product apps on Chemin A) and example-api/example-web demos that prove the pattern.
- **Secondary:** Platform super admins and back-office staff in future products; end clients in org-scoped shells (A4).

## Constraints

- Stack: Workers · Hono · D1 · Better Auth (`AUTH_SESSION_ADAPTER=better-auth` for org features).
- [ADR-0003](../../docs/architecture/adr/0003-multi-tenant-rbac-modules.md) decisions are **normative** (not reopened in implement without supersede).
- [ADR-0001](../../docs/architecture/adr/0001-primary-axis-packages-compose-apps.md): no empty `@gosilex/rbac`; promote only with call sites; `MODULE_IDS` app-owned.
- [ADR-0002](../../docs/architecture/adr/0002-session-hmac-interim-vs-better-auth.md): dual credential session \| `sk_`; org features on BA adapter only.
- Security: fail-closed org scope; super_admin cross-org **write default off**; API keys **org-bound**; invites **seed-only**.
- Quality: IDOR multi-org tests + `validate:full` green; human review on auth PR.

## Out of Scope

- Phase B custom roles + per-module write/read/disabled matrix UI/tables (path only documented).
- Product invite/accept HTTP APIs.
- Share-frame specifics (GitHub org recheck, `private_acl`, artifact visibility).
- Full HMAC deprecation as sole track (A0 may parallel; not blocking if org routes require BA adapter).
- Billing multi-tenant; Metalyde role names (`LEAD`/`CONSULTANT`).
- Demo shell polish A4 if A1–A3 already large — may follow-up issue.

## Premise Validity

**Success in 6 months:** Every new Chemin A product starts from kit org + membership + dual-level modules without forking authz tables; example seed demos solo + team + staff multi-org; zero known cross-org IDOR in kit gates.

**Failure in 6 months:** After Phase A merge, a second product still copies local `org`/`role` tables or ships subject-global API keys; or cross-org IDOR tests are absent/red and tenant routes still land without `organization_id` filters.

**Simplest alternative:** Keep `admin|user` seed roles + global `kit_modules` only; document “add orgs in product apps.”

**Why not simplest:** Four production patterns (Metalyde/Spark/Ether/share) already need tenant isolation + dual-level modules; delaying to products guarantees N×M forks and contradicts kit SSoT goal post-ADR-0003.

## Complexity

**Tier: F-full** — multi-domain (auth plugin, D1 schema, guards, modules migration, seed, security tests); new architectural surface locked by ADR-0003.

Signals:

- Multiple packages/apps (`@gosilex/auth`, example-api, example-web)
- New persistence + guard contract
- Security-critical (IDOR, privilege escalation)
- Consensus already run; analyze largely done (reuse consensus as analysis input)

## Slices (this issue)

| Slice | Deliverable |
|---|---|
| **A1** | BA organization plugin + `kind`/`status` + roles owner/admin/member/reader |
| **A2** | `user_platform_roles` + `platform_modules` + `organization_modules` + migrate `kit_modules` |
| **A3** | Guards + multi-persona seed + IDOR matrix; org-bound API keys |

## Refs

- Issue: https://github.com/go-silex/silex-boilerplate/issues/11
- ADR-0003, consensus `artifacts/analyses/002-multi-tenant-rbac-modules-consensus.md`
- Analysis draft `002-multi-tenant-rbac-modules-draft.md`
- Cross-app `001-cross-app-features-metalyde-ether-enzo-spark.md`
