---
status: superseded
superseded_by: artifacts/specs/14-epic-b2-hmac-cut-ba-only-spec.md
superseded_date: 2026-07-30
---

> **SUPERSEDED 2026-07-30** — see `14-epic-b2-hmac-cut-ba-only-spec.md`.

---
title: "Spec — B2 Auth BA default + dogfood multi-tenant"
issue: 14
spark: 115
status: draft
tier: S-M
date: 2026-07-30
analysis: artifacts/analyses/14-epic-b2-auth-ba-default-analysis.md
adr:
  - docs/architecture/adr/0002-session-hmac-interim-vs-better-auth.md
  - docs/architecture/adr/0003-multi-tenant-rbac-modules.md
shape: 1
---

# Spec #14 — Epic B2 · Auth BA default + dogfood multi-tenant

## Context

- **Issue:** [#14](https://github.com/go-silex/silex-boilerplate/issues/14) · Spark **#115**
- **Analysis:** [`artifacts/analyses/14-epic-b2-auth-ba-default-analysis.md`](../analyses/14-epic-b2-auth-ba-default-analysis.md) — **Shape 1 recommended**
- **Depends:** B1 SSoT (#13) sequential · multi-tenant Phase A (#11) **shipped** · Better Auth SessionPort (#5) **shipped**
- **ADR track:** ADR-0003 **A0** (session BA cutover) + ADR-0002 amend (dogfood default)

## Goal

Make **Better Auth the kit dogfood default** so a new clone demonstrates multi-tenant org / RBAC / modules in **&lt;15 minutes**, without removing the **HMAC compat path** (still tested). Products that copy `.dev.vars.example` + Quick Start no longer inherit a dead-end HMAC-only demo.

## Non-goals (out of scope)

| Out | Owner |
|---|---|
| GitHub OAuth / social providers | Product / later M3 depth |
| Invite / accept membership UI + public invite APIs | **B3** (#15) |
| A4 shells `/admin` + `/app` | **B3** |
| Phase B custom roles | Park / B8 |
| Removing HMAC code or `SessionPort` dual export | Future sunset (not this epic) |
| Re-implementing multi-tenant schema / guards | Already #11 |
| Product app (`silex-share`) migration PR | Consumer after kit lands |

## Users

| Persona | Need |
|---|---|
| New kit clone / GOSILEX dev | BA path by default; clear secrets; multi-tenant smoke |
| Product consumer (zero-edit) | Copy example env → BA; opt-in `hmac` if mid-migrate |
| Maintainer | Both adapters green in tests; fail-closed secrets |

## Decision summary (from analysis)

| Decision | Value |
|---|---|
| Shape | **1 — BA dogfood default + HMAC explicit compat** |
| Unset `AUTH_SESSION_ADAPTER` | **Option A:** keep `unset → hmac` (product back-compat); **example + docs always set `better-auth`** |
| Mount exclusivity | Unchanged (ADR-0002 D6) |
| Org on HMAC | Remain **404** via `requireBaAdapter` |
| Public signup | Stay **off** by default (`ALLOW_PUBLIC_SIGNUP` unset/false) |
| Dual-path `sk_` | Unchanged |

## Env contract

### Dogfood (local example) — SSoT: `apps/example-api/.dev.vars.example`

```bash
ENVIRONMENT=development
# Required for dual-path / any residual HMAC helpers; min 32; kit placeholder OK only in development|test
SESSION_SECRET=dev-session-secret-change-me-32chars!!

# Dogfood default (this epic)
AUTH_SESSION_ADAPTER=better-auth
BETTER_AUTH_SECRET=dev-better-auth-secret-change-me-32c!!
BETTER_AUTH_URL=http://localhost:8787
# ALLOW_PUBLIC_SIGNUP=true   # keep off unless intentional open registration

CORS_ORIGINS=http://localhost:5173,http://127.0.0.1:5173
# SESSION_COOKIE_NAME=gosilex_session   # optional override
```

### Compat (HMAC path)

```bash
ENVIRONMENT=development
SESSION_SECRET=dev-session-secret-change-me-32chars!!
AUTH_SESSION_ADAPTER=hmac
# BETTER_AUTH_* unused
```

### Fail-closed rules (normative — already implemented; must stay tested)

| Condition | Behavior |
|---|---|
| `AUTH_SESSION_ADAPTER=better-auth` + prod/staging + missing/short `BETTER_AUTH_SECRET` | Fail closed (500 / internal on request path that asserts config) |
| Kit placeholder secret outside `development`\|`test` | Fail closed |
| Missing `BETTER_AUTH_URL` outside `development`\|`test` | Fail closed |
| Adapter inferred from secret presence | **Forbidden** |
| Invalid adapter string | Fail closed |
| Org routes + adapter `hmac` | **404** (not 501) — current `requireBaAdapter` |

### Schema / inventory

- Keys remain in `apps/example-api/src/env.schema.ts` (`workerStringEnvSchema`).
- Update comments: dogfood default = `better-auth` (example); unset code default = `hmac` (Option A).
- `env:check` / `.dev.vars.example` stay in sync (existing gate).

## Quick Start (dogfood) — target &lt;15 min

Document in `README.md` (and B1 SSoT if it owns kit playbook):

```bash
# 0. clone + deps
bun install

# 1. env (copy ships BA)
cp apps/example-api/.dev.vars.example apps/example-api/.dev.vars

# 2. D1
bun run db:migrate

# 3. seed (HMAC demo tables + BA tenancy personas/orgs)
bun run db:seed

# 4. API
cd apps/example-api && bun run dev
# → http://127.0.0.1:8787/health
# expect: "authAdapter":"better-auth"

# 5. Web (other terminal)
cd apps/example-web && bun run dev
# → http://127.0.0.1:5173 — login with tenancy persona

# 6. Smoke (manual or scripted)
# - POST BA sign-in → cookie
# - GET /api/orgs (or SPA org list)
# - GET/PATCH org modules (acme has feedback enabled)
# - mint sk_ with org context (org-bound)
```

**Time budget:** install may dominate cold machine; steps 1–6 after install should fit remaining budget for a warm bun cache. Acceptance = path is **linear, no hidden adapter flag**.

### HMAC escape hatch (documented, not default)

```bash
# In .dev.vars
AUTH_SESSION_ADAPTER=hmac
# Login: POST /api/auth/login with demo@gosilex.local
# Org APIs: expected 404
```

## Seed personas (BA dogfood SSoT)

Source: `apps/example-api/src/seed/tenancy-data.ts`  
Password (all): `demo-password-change-me` (`TENANCY_PASSWORD`)

| Email | Platform role | Memberships (role) |
|---|---|---|
| `super@gosilex.local` | `super_admin` | optional |
| `staff@gosilex.local` | `staff` | `org_acme` admin · `org_beta` member |
| `solo@gosilex.local` | — | `org_solo` owner (sole) |
| `team-owner@gosilex.local` | — | `org_team` owner · `org_acme` member |
| `team-reader@gosilex.local` | — | `org_team` reader |

| Org id | Slug | Notes |
|---|---|---|
| `org_acme` | `acme` | `feedback` **enabled** (if platform available) |
| `org_beta` | `beta` | feedback disabled |
| `org_solo` | `solo` | solo client |
| `org_team` | `team` | owner + reader |

### Legacy HMAC demo users (compat only)

| Email | Password | Role (kit) |
|---|---|---|
| `demo@gosilex.local` | `demo-password-change-me` | admin |
| `demo-b@gosilex.local` | `demo-password-b-change-me` | user |

**Spec choice (recommended):** README primary table = **tenancy personas** when documenting BA default. HMAC table under “Compat”.  

**Optional slice (S2):** also insert BA credential accounts for `demo@` / `demo-b@` so design-system admin path works unchanged on BA default without teaching two emails — if not done, document that design-system admin on BA uses `super@` (or map platform super_admin).

## Health contract

`GET /health` (already returns `authAdapter`):

| Field | Dogfood local |
|---|---|
| `authAdapter` | `"better-auth"` when example env used |
| `demoLogin` (dev\|test only) | Prefer BA lead persona: e.g. `super@gosilex.local` + password + note role; **or** extend to `demoLogins[]` for multi-persona — implementer pick one; do not leak in staging/prod |

## Login / logout surfaces (unchanged wiring)

| Adapter | Login | Logout |
|---|---|---|
| `better-auth` | `POST /api/auth/sign-in/email` | `POST /api/auth/sign-out` |
| `hmac` | `POST /api/auth/login` | `POST /api/auth/logout` |

SPA already branches on `health.authAdapter` (`login.tsx`, `app-shell.tsx`). No FE rewrite required unless copy/banners need tenancy emails.

## Dogfood smoke checklist (manual / future script)

1. Health → `authAdapter=better-auth`.  
2. Sign-in as `staff@gosilex.local`.  
3. List orgs → includes acme + beta; not solo (no membership).  
4. Open `org_acme` modules → feedback effective enabled.  
5. Open `org_beta` modules → feedback not enabled.  
6. Sign-in as `team-reader@` → write denied on team data (existing IDOR tests cover automated analog).  
7. Mint API key under org context → key bound to that org; wrong org 403/404.  
8. Switch env to `hmac` → login demo@ works; `/api/orgs` → 404.

## Definition of Done

- [ ] `.dev.vars.example` defaults to `AUTH_SESSION_ADAPTER=better-auth` with BA secrets documented (placeholders OK for development only).  
- [ ] README Quick Start is BA-first, &lt;15 min linear path, tenancy credentials table.  
- [ ] HMAC documented as **compat** (`AUTH_SESSION_ADAPTER=hmac`), not deleted.  
- [ ] Fresh copy of example env → `GET /health` exposes `authAdapter: "better-auth"` under local `ENVIRONMENT=development`.  
- [ ] `bun run db:seed` creates multi-tenant personas/orgs on dogfood path (no silent skip when migrations applied).  
- [ ] Fail-closed secret tests remain green (BA without secret in production).  
- [ ] HMAC login test remains green; org routes remain 404 on hmac.  
- [ ] Org RBAC / IDOR matrix (`org-rbac.test.ts`) remains green on BA.  
- [ ] Dual-path `sk_` tests remain green on BA path.  
- [ ] ADR-0002 amended (dogfood default + A0 / HMAC compat wording).  
- [ ] ADR-0003 A0 marked done / notes cutover.  
- [ ] `bun run validate:full` green on implementation branch.  
- [ ] No invite UI, no GitHub OAuth, no A4 shells in the PR.

## Tests to keep green (both adapters)

| Suite / case | Adapter |
|---|---|
| `app.test.ts` — HMAC `POST /api/auth/login` cookie flags | hmac |
| `app.test.ts` — BA health `authAdapter` + HMAC login rejected | better-auth |
| `app.test.ts` — BA missing secret production fail-closed | better-auth |
| `app.test.ts` — signup disabled default; dual-path when allowed | better-auth |
| `org-rbac.test.ts` — full IDOR matrix | better-auth |
| `org-rbac.test.ts` — HMAC org 404 | hmac |
| `@gosilex/auth` SessionPort / keys unit tests | both (ports) |
| Existing notes IDOR / rate-limit / origin guard | both as currently wired |

**New (minimal):**

| Case | Intent |
|---|---|
| Example-env contract test or doc gate | `.dev.vars.example` contains `AUTH_SESSION_ADAPTER=better-auth` (script or snapshot) |
| Optional: health `demoLogin` email matches tenancy when BA | DX |

**Not required in this epic:** full GitHub Actions matrix job for both adapters (nice-to-have → B4); unit coverage already dual.

## Slices

| Slice | Demo-able increment | Depends |
|---|---|---|
| **S1 — Env + docs default** | `.dev.vars.example` + README Quick Start BA; ADR notes draft | — |
| **S2 — Dogfood DX** | Health demo credentials; seed fail-loud if BA tables missing; optional BA accounts for `demo@` | S1 |
| **S3 — Gates** | Example-env check; confirm test matrix still green; ADR-0002/0003 commit | S1 |

Implementation may fold S1–S3 in one PR if small.

## Expected behavior (normative)

1. New clone following Quick Start runs with **BA** without editing adapter line.  
2. Multi-tenant smoke works with seed personas (no public signup required).  
3. HMAC still works when explicitly selected; multi-tenant APIs stay unavailable.  
4. Secrets never accept kit placeholders outside development\|test.  
5. Products set `AUTH_SESSION_ADAPTER=hmac` only if they intentionally stay on interim sessions; kit no longer *recommends* that for new work.

## Edge cases

| Case | Handling |
|---|---|
| Product forgot adapter after kit upgrade | Option A: still hmac if unset — document “set better-auth to use org features” |
| Dev sets BA but skips migrate | Seed/migrate docs; optional seed error if BA tables absent |
| Dev uses BA + old `demo@` only | Document tenancy emails; optional S2 dual-seed |
| `ALLOW_PUBLIC_SIGNUP=true` local | Allowed; not required for dogfood |
| Staging deploy with example placeholders | Fail closed (existing) |

## Ambiguity (resolved for implementer)

| Topic | Spec call |
|---|---|
| Unset default | **Option A** (unset → hmac) |
| Primary demo email on BA | **`super@gosilex.local`** (or staff for multi-org demo) in health/README |
| BA accounts for legacy demo@ | **Optional S2** — not blocking DoD |
| CI dual matrix | **Out** (unit tests suffice) |

## Implementation notes

| Area | Owns |
|---|---|
| example-api env / health / seed | Dogfood flip + DX |
| README / ADRs | Narrative cutover |
| `@gosilex/auth` | Prefer **no** API change |
| example-web | Prefer **no** code change |
| validate:full | Must stay green |

### ADR amend sketch (0002)

- Table header: “Kit **dogfood** default = better-auth (example env)” vs “Code unset fallback = hmac (back-compat)”.  
- Consequences: products for greenfield set `better-auth`; HMAC = explicit compat until sunset.  
- Related: issue #14 / A0.

### ADR note sketch (0003)

- Phase A0: **done** via B2 dogfood default (link issue #14).  
- HMAC still “legacy demo without org FKs”.

## Status

**draft** — analysis Shape 1 accepted for implementation planning; open only for product confirmation of Option A vs B if a consumer is known to rely on unset→hmac without pinning (unlikely for zero-edit env copies).
