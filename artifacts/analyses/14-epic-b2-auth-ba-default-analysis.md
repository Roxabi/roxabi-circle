---
status: superseded
superseded_by: artifacts/analyses/14-epic-b2-hmac-cut-ba-only-analysis.md
superseded_date: 2026-07-30
---

> **SUPERSEDED 2026-07-30** — HMAC cut / BA-only. See `14-epic-b2-hmac-cut-ba-only-analysis.md`.

---
title: "B2 — Auth BA default + dogfood multi-tenant — technical analysis"
issue: 14
spark: 115
status: draft
date: 2026-07-30
adr:
  - docs/architecture/adr/0002-session-hmac-interim-vs-better-auth.md
  - docs/architecture/adr/0003-multi-tenant-rbac-modules.md
depends_on:
  - issue 11 (multi-tenant RBAC Phase A — shipped, PR #12)
  - issue 5 (Better Auth SessionPort — shipped)
  - epic B1 / Spark #114 (SSoT docs drift — sequential predecessor)
---

# Analysis #14 — Epic B2 · Auth BA default + dogfood multi-tenant

## Source

| | |
|---|---|
| **GitHub** | [#14](https://github.com/go-silex/silex-boilerplate/issues/14) — *\[Epic\] B2 · Auth BA default + dogfood multi-tenant* |
| **Spark** | #115 (Silex) · child theme BA default + dogfood (#123) |
| **Bloc** | B2 — séquentiel #2 · bloqué par B1 (docs SSoT) |
| **Priorité** | P1 |
| **ADRs** | [0002](../../docs/architecture/adr/0002-session-hmac-interim-vs-better-auth.md) SessionPort dual-path · [0003](../../docs/architecture/adr/0003-multi-tenant-rbac-modules.md) multi-tenant (phase **A0**) |

## Problem

Multi-tenant org / RBAC / modules (ADR-0003 Phase A) **are already in the kit** (`apps/example-api` org routes, BA organization plugin, multi-persona seed, IDOR matrix, org-bound keys). They are **not the path a new clone walks**:

1. **Default adapter is still HMAC.**  
   - `authSessionAdapter()`: unset / empty → `'hmac'` (`apps/example-api/src/lib/session-env.ts`).  
   - `apps/example-api/.dev.vars.example` ships `AUTH_SESSION_ADAPTER=hmac`.  
   - ADR-0002 still tables “kit default = hmac”.

2. **Org surfaces fail-closed on HMAC** (by design, ADR-0003):  
   - `requireBaAdapter` → 404 *“Organization APIs require AUTH_SESSION_ADAPTER=better-auth”*.  
   - So the default dogfood path **cannot** demonstrate orgs, platform roles, dual-level modules, or org-bound `sk_`.

3. **Products copy the wrong default.**  
   Consumer contract = zero-edit kit + configure via env. If products copy `.dev.vars.example` / Quick Start, they land on HMAC forever and re-implement tenancy outside the kit spine.

4. **Two demo identity systems coexist without a single “happy path” story:**  
   - HMAC: `demoUsers` / `SEED_USERS` (`demo@gosilex.local`, `admin|user`).  
   - BA tenancy: `TENANCY_PERSONAS` (`super@`, `staff@`, `solo@`, `team-owner@`, `team-reader@`) + orgs acme/beta/solo/team.  
   - Seed already runs *both* when tables exist, but README + health `demoLogin` still advertise HMAC admin only.

5. **ADR-0003 phase A0 is still open:**  
   > *A0 — Session BA cutover track (HMAC deprecation) — related ADR-0002 work.*  
   This epic **is** A0, not a re-litigation of dual-path or multi-tenant schema.

**Outcome if we do nothing:** kit multi-tenant remains a “set this secret flag” easter egg; Spark/Metalyde-style products never dogfood the intended spine.

## Outcome (success for B2)

A new clone, following Quick Start only:

1. Lands on **`AUTH_SESSION_ADAPTER=better-auth`** with secrets fail-closed rules clear.  
2. In **&lt;15 minutes**: migrate → seed → API+web up → BA email sign-in → see org context + modules + mint org-bound `sk_`.  
3. `GET /health` reports `authAdapter: "better-auth"` in local demo.  
4. **HMAC remains a first-class compat path**: explicit `AUTH_SESSION_ADAPTER=hmac`, still unit/integration tested; org routes stay 404.  
5. ADR-0002 amended (dogfood default + A0 cutover notes); ADR-0003 A0 marked advanced/closed in notes.

## Appetite

**S (docs + env + seed/health DX) → M if code default flip + dual CI matrix.**  
Not a greenfield auth rewrite. Implementation surface is mostly configuration, docs, seed/demo UX, ADR amendments, and test/CI hardening — **not** redoing SessionPort or org plugin.

## Shapes

### Shape 1 — BA dogfood default + HMAC explicit compat (**recommended**)

Make **Better Auth the path the kit teaches and ships in examples**:

| Lever | Change |
|---|---|
| `.dev.vars.example` | `AUTH_SESSION_ADAPTER=better-auth` + uncommented `BETTER_AUTH_SECRET` / `BETTER_AUTH_URL` (dev placeholders) |
| Quick Start (README + any kit playbook) | Steps assume BA; HMAC as “legacy / product mid-migrate” subsection |
| Seed / health DX | Health (dev only) surfaces tenancy persona(s) when adapter=BA; seed docs list multi-tenant credentials |
| Code unset default | **Option A (preferred for product safety):** leave `unset → hmac` in `authSessionAdapter` for silent back-compat; **example always sets explicit `better-auth`**. **Option B:** flip unset → `better-auth` (true A0; requires product migration note + CHANGELOG). Spec should pick A or B. |
| ADR-0002 | Amend table “kit default” → dogfood BA; HMAC = compat; keep dual-path + mount exclusivity + fail-closed secrets |
| ADR-0003 | Close A0 notes; HMAC legacy without org FKs restated |
| Tests | Keep existing BA + HMAC cases; add smoke that **default example env** resolves to BA; keep HMAC login + org 404 |

**Trade-offs**

| + | − |
|---|---|
| Fixes wrong-default copy problem for new products | Products already on HMAC need an explicit one-liner to stay hmac if Option B |
| Aligns dogfood with ADR-0003 reality | Two seed universes remain until optional consolidation |
| Small blast radius if Option A (explicit env only) | Option A still allows “forgot to set adapter” → silent hmac (document strongly) |
| HMAC escape hatch for products mid-migrate / unit tests | Dual maintenance until HMAC sunset (accepted debt) |

**Rough scope:** S–M

### Shape 2 — Dual-matrix CI only (no default flip)

Keep hmac as documented + example default. CI runs a matrix job (`hmac` \| `better-auth`). Docs say “set better-auth for multi-tenant.”

**Trade-offs**

| + | − |
|---|---|
| Zero product surprise | **Does not solve the epic problem** — products still copy hmac |
| Stronger regression net | Multi-tenant still invisible in &lt;15 min clone path |
| Cheap | Epic DoD “clone → BA” fails |

**Rough scope:** S — **insufficient alone**

### Shape 3 — Doc-only cutover

Update README / ADR prose only; leave `.dev.vars.example` on hmac.

**Trade-offs**

| + | − |
|---|---|
| Minimal PR | Health stays hmac; dogfood fails DoD |
| No secret wiring risk | Highest product fork risk |

**Rough scope:** XS — **reject for epic DoD**

### Shape fit summary

| Constraint | Shape 1 | Shape 2 | Shape 3 |
|---|---|---|---|
| Clone → BA &lt;15 min | yes | no | no |
| Health `authAdapter=better-auth` demo | yes | only if env forced | no |
| HMAC still tested | yes | yes | yes (status quo) |
| ADR-0002/0003 A0 | yes | partial | prose only |
| Product break risk | low (A) / med (B) | low | none |
| Epic DoD | meets | misses | misses |

**Recommendation: Shape 1**, with **Option A** (example + docs force BA; code unset stays hmac for back-compat) unless B1/product survey shows all consumers already pin the adapter explicitly — then Option B is cleaner A0.

Shape 2 is a **complement** (matrix smoke), not a substitute. Shape 3 rejected.

## Fit check (ADRs)

### ADR-0002 (SessionPort dual-path)

| Norm | B2 impact |
|---|---|
| `SessionPort` + dual cookie \| `sk_` | **Unchanged** — already green on both adapters |
| Mount exclusivity (BA handler vs HMAC login) | **Unchanged** |
| Fail-closed secrets for BA | **Must stay** — document + keep tests (`BETTER_AUTH_SECRET` missing in prod → 500) |
| `unset → hmac` | **Amended narrative:** dogfood default is BA via example env; unset policy = Option A or B (open Q) |
| Cookie SSoT `gosilex_session` | **Unchanged** — BA already maps session_token name |

Anti-patterns still forbidden: silent dual stacks, secret inference for adapter choice.

### ADR-0003 (multi-tenant)

| Norm | B2 impact |
|---|---|
| Org features require BA adapter | Already enforced — B2 makes that the **visible** path |
| Phase **A0** | This epic **implements** A0 cutover track |
| Seed personas D14 | Already in `tenancy-data.ts` — wire into Quick Start / health DX |
| Invites / GitHub OAuth | **Out of scope** (B3 / product) |
| HMAC cannot demo multi-tenant | Restated; not a bug |

No ADR supersede required for multi-tenant schema. ADR-0002 amendment note is enough for default flip.

## Baseline code (worktree @ `61b6404`, post #11 merge)

| Area | State today |
|---|---|
| Adapter resolve | `session-env.ts` → unset/`hmac` → hmac; `better-auth` validated |
| BA factory | `lib/better-auth.ts` — email/password, org plugin, four roles, `allowUserToCreateOrganization: false`, invite limit 0 |
| Mount | `routes/auth.ts` D6 exclusivity + BA org mutation deny |
| Guards | `requireBaAdapter`, org-context middleware, dual `requireAuth` |
| Health | `authAdapter` exposed; `demoLogin` = HMAC `SEED_USERS` admin only (dev) |
| Seed | `seed-db.ts` → demo users/notes **+** `seedTenancyDemo` (try/catch) |
| Personas | `tenancy-data.ts` — super/staff/solo/team-owner/team-reader; orgs acme/beta/solo/team; feedback enabled on acme |
| FE | `login.tsx` / logout adapter-aware via `/health` |
| Tests | `app.test.ts` BA fail-closed + hmac login; `org-rbac.test.ts` BA IDOR + hmac 404 |
| Example env | `.dev.vars.example` → **hmac**; BA secrets commented |
| README Quick Start | migrate/seed/dev; credentials table = HMAC `demo@` only |

**Conclusion:** feature code for multi-tenant dogfood **exists**. Gap is **defaults, docs, demo DX, ADR A0 closure**, not missing BA/org implementation.

## Files impacted (indicative, ≥3)

| Path | Role in B2 |
|---|---|
| `apps/example-api/.dev.vars.example` | Flip adapter + BA secrets for clone path |
| `apps/example-api/src/lib/session-env.ts` | Optional Option B unset default; comments / weak secret denylist already OK |
| `apps/example-api/src/env.schema.ts` | Docstring: dogfood default better-auth |
| `apps/example-api/src/routes/health.ts` | Dev `demoLogin` / personas when BA (tenancy SSoT) |
| `apps/example-api/src/seed/*` | Ensure tenancy seed always on BA dogfood path; docs parity |
| `README.md` | Quick Start &lt;15 min BA; HMAC subsection; tenancy credentials table |
| `docs/architecture/adr/0002-…` | Amend default / A0 cutover notes |
| `docs/architecture/adr/0003-…` | A0 status |
| `docs/testing.md` | CP notes both adapters; dogfood smoke |
| `apps/example-api/src/app.test.ts` | Assert example-default semantics if needed |
| `apps/example-web` | Prefer no change (already adapter-aware); optional banner copy |
| Optional CI | Matrix or second job for hmac if not already covered unit-side |

**Non-goals for file map:** OAuth providers, invite UI, A4 `/admin`+`/app` shells (B3 / #15), product apps.

## Risks

| Risk | Severity | Mitigation |
|---|---|---|
| **Product break on HMAC** — consumer assumed implicit hmac + old login URL | Med (Option B) / Low (Option A) | Prefer Option A; CHANGELOG + “compat” section; keep hmac tests green |
| **Secret fail-closed surprise** — BA without `BETTER_AUTH_SECRET` in prod/staging | High if misconfigured | Keep tests; document openssl generate; never reuse SESSION_SECRET silently in prod |
| **Weak placeholder in prod** | High | Existing denylist `WEAK_SESSION_SECRETS` for BA + session — keep |
| **Dual persona confusion** (`demo@` vs `super@`) | Med | Health + README: when BA, lead with tenancy table; note HMAC users are legacy demo tables |
| **Login path mismatch** | Low | FE already branches; document BA `POST /api/auth/sign-in/email` vs HMAC `/api/auth/login` |
| **Seed tenancy skipped** (try/catch on missing schema) | Med | Migrations already ship 0005–0008; fail loud in seed script if BA dogfood and tables missing |
| **Public signup** | Low | Keep `ALLOW_PUBLIC_SIGNUP` default off; seed creates users |
| **CI time** if full dual matrix wrangler | Low | Unit tests already cover both; matrix optional |

## Open questions (for /spec, not blockers)

1. **Unset default (Option A vs B):** leave `unset → hmac` for product safety, or flip to `better-auth` for true A0? **Analysis lean: A.**  
2. **Health demo credentials on BA:** return `super@` only, full persona list, or keep `demo@` if also seeded into BA? (Today `demo@` is HMAC `demo_users`, not necessarily BA `user` table.)  
3. **Should seed create BA accounts for legacy `demo@` / `demo-b@`** for design-system continuity on BA default?  
4. **HMAC sunset date** — document only vs calendar deprecation (B8 park?).  
5. **CI dual-matrix** in this epic or B4 ops CI (#16)?  
6. **B1 dependency** — how much README rewrite belongs to B1 vs B2 (avoid dual-edit docs drift).

## Recommendation

1. **Implement Shape 1 (BA dogfood default + HMAC explicit compat).**  
2. **Default policy:** Option A unless product survey says otherwise.  
3. **Do not** re-open dual-path, org schema, or invite scope.  
4. **Complement** with retained unit tests on both adapters (+ optional CI matrix later).  
5. Proceed to **draft spec** `artifacts/specs/14-epic-b2-auth-ba-default-spec.md` with env contract, Quick Start steps, persona table, DoD, and out-of-scope list.

## Related

| Artefact | Role |
|---|---|
| Issue #5 / `artifacts/*5-better-auth*` | SessionPort BA path landed |
| Issue #11 / ADR-0003 / PR #12 | Multi-tenant Phase A landed |
| Issue #13 / Spark #114 | B1 SSoT docs (predecessor) |
| Issue #15 / Spark #116 | B3 product UX (invites, A4 shells) — **next** |
| ADR-0002 / ADR-0003 | Normative |
