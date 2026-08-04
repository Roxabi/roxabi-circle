# Playbook — start project foundations (Auth / RBAC / MasterData / UI / tokens)

**Audience:** eng (or agent) finishing day-0 **compose** and wiring kit **foundations** for a new product.  
**Parent context:** Spark silex **#84** (Plugins umbrella) · kit ticket **#88** / GH **#112**.

> **Not** a rewrite of zero-edit remotes or product-validate. Those live in [`start-product.md`](./start-product.md).  
> **Not** the full métier runbook — that is [`fork-to-first-issue.md`](./fork-to-first-issue.md).

## Goal

Decide which kit foundations you need, wire them by composing `@gosilex/*` + example patterns, and leave with a DoD « projet starté » where **must** rows close only with evidence and **opt-in** rows close only with live wire **or** an explicit skip-if — without AGENTS archaeology or inventing packages.

## Three playbooks (do not confuse)

| Playbook | Job | When |
|---|---|---|
| [`start-product.md`](./start-product.md) | Zero-edit compose: remotes, deny-push, product apps dirs, kit bar vs product bar | **First** (day 0 remotes) |
| **This file** (`start-project.md`) | Foundations: Auth, RBAC, MasterData, endpoints, UI, tokens, epic split, DoD | **After** compose is green |
| [`fork-to-first-issue.md`](./fork-to-first-issue.md) | Intention → Spark → GH issue → `/dev` → first ship | After foundations (or in parallel once Phase B green) |

**Reading order:** `start-product` → **this playbook** → `fork-to-first-issue` (Phase C+ métier).

Contract SSoT: [`docs/product-consumer-contract.md`](../product-consumer-contract.md) · axis: [ADR-0001](../architecture/adr/0001-primary-axis-packages-compose-apps.md).

---

## Decision tree — what is required?

Not every Worker is multi-tenant SaaS. Mark sections **required | opt-in | pointer-only** below; skip opt-in with an explicit “skip if…” note in your product brief.

| Question | If yes | Section |
|---|---|---|
| Building any Hono API on the kit? | **Required** spine | §4 Endpoints · compose axis |
| Machine / MCP clients? | Dual-path **Bearer `sk_`** | §1 Auth (machine half) |
| Browser users? | Better Auth sessions + cookies | §1 Auth (browser half) |
| Multi-tenant orgs / staff back-office? | Platform + org RBAC | §2 RBAC |
| Referential catalogue / admin CRUD? | MasterData pattern | §3 MasterData |
| SPA product shell? | `@gosilex/ui` + app tokens | §5 UI · §6 Tokens |
| Shipping with agents / Spark? | Epic template always useful | §7 Epics · §8 DoD |

**Always (spine for Chemin A products):** compose `@gosilex/*` (not a dual stack) · error envelope + layers · zero-edit contract (link-out only).

**Study vs wire:** checklist items that open `apps/example-*` or `packages/*` are **read-only study**. Implement only under `apps/<product>-*`. Commits that touch kit zones without a time-boxed exception = fail.

**Pre-wire gate:** product app dirs exist (`apps/<product>-api` and/or web/mcp) **and** `git status` / `git diff` clean on `packages/*` + `apps/example-*` (or documented exception) before closing must DoD.

---

## 1. Auth — Better Auth + dual credential

**Mark:** **opt-in** browser sessions · **required** dual-path if any machine clients · never HMAC-as-live.

**SSoT:** [ADR-0002](../architecture/adr/0002-session-hmac-interim-vs-better-auth.md) · package `@gosilex/auth` · dogfood `apps/example-api/src/middleware/require-auth.ts` · BA handler under `/api/auth/*`.

| Truth | Detail |
|---|---|
| Session UI | **Better Auth only** (HMAC retired) |
| Machine | Bearer `sk_…` — **no cookies** (MCP / skill) |
| Dual-path guard | Cookie session **or** Bearer `sk_` → same subject |
| Cookie flags | HttpOnly · Secure (prod) · SameSite=Lax · `credentials: 'include'` on FE |
| Env | Product-owned `.dev.vars` / CF secrets — copy **shape** from `apps/example-api/.dev.vars.example`, never commit secrets. Primary BA: **`BETTER_AUTH_SECRET`** (+ URL outside dev/test). `SESSION_SECRET` is residual helper only if present in the example inventory — **not** session SoT. |

### Checklist

- [ ] Read ADR-0002 one-pager (BA-only + dual credential) — **study**.
- [ ] Wire or **explicitly skip** BA browser sessions (`BETTER_AUTH_SECRET` via CF secrets / product `.dev.vars`, not git).
- [ ] Machine clients in **V1**: mint path for `sk_` + `requireAuth` (or `@gosilex/auth` equivalent) is **live** before must DoD closes — a roadmap ticket alone does **not** green the must row. No machine clients → brief skip-if.
- [ ] Confirm example dual-path middleware (**study only**): `apps/example-api/src/middleware/require-auth.ts`.
- [ ] FE api client uses `credentials: 'include'` when cookies matter (pattern: `apps/example-web/src/lib/api.ts` — copy into product app, do not dual-edit example).
- [ ] Skip browser half if: no browser users — write “no browser users” in product brief.

---

## 2. RBAC — multi-tenant matrix (opt-in)

**Mark:** **opt-in** multi-tenant SaaS.

**SSoT:** [ADR-0003](../architecture/adr/0003-multi-tenant-rbac-modules.md) · org helpers in `@gosilex/auth` · example routes under invitations / modules / me.

| Level | Role of checks |
|---|---|
| **Platform** | Staff / super-admin across clients |
| **Organization** | Membership + org roles inside one tenant |
| **Modules** | Platform catalog → enabled per org |

**Where to check:** **API first** (Hono middleware / service guards). UI hides affordances only — never the sole authz boundary.

### Checklist

- [ ] Confirm product needs multi-tenant orgs (else **skip** and note “single-tenant / no org”).
- [ ] Read ADR-0003 dual-level modules + membership model (tenant always = organization) — **study**.
- [ ] Map mini matrix: who can invite, manage members, enable modules (product table in `docs/product/`).
- [ ] Guards live on routes/services — **study** example `apps/example-api/src/routes/invitations.ts` · modules · `me.ts`; implement under product apps only.
- [ ] Skip if: single-user or no org product.

---

## 3. MasterData — referential CRUD pattern

**Mark:** **opt-in** when you need catalogue / lookup admin CRUD.

**Live pattern (shipped, app-only — no package):**

| Surface | Path |
|---|---|
| Table | `demo_items` · migration [`apps/example-api/migrations/0011_demo_items.sql`](../../apps/example-api/migrations/0011_demo_items.sql) |
| API | `/api/items` · `apps/example-api/src/routes/items.ts` → `services/items.ts` → `repos/items.ts` |
| Web | `/app/items` · `apps/example-web/src/routes/items.tsx` |
| README | MasterData row → `demo_items` · app-only (no package) |

**Honest truth:** the **pattern is live** in examples. There is **no** `@gosilex/masterdata` package (A8: no empty packages). Copy the pattern into `apps/<product>-*` — do not invent `packages/masterdata` without ADR + two call sites.

Older **layer/ownership** demo: `demo_notes` (notes CRUD) — useful for routes→services→repos, **not** the referential MasterData catalogue pattern.

### Checklist

- [ ] Decide: product needs referential CRUD? If no → **skip** with note.
- [ ] Read `demo_items` migration + `items` route/service/repo layering.
- [ ] Open `/app/items` dogfood (after seed) to see table/form UX.
- [ ] In product: own tables + routes under `apps/<product>-*` composing `@gosilex/db` — **no** dual-edit of example items.
- [ ] Do **not** create `@gosilex/masterdata` on day 0.

---

## 4. Endpoints — envelope, Zod, layers

**Mark:** **required** for any Hono API on the kit.

**SSoT:** `@gosilex/core` (`AppError`, requestId) · `@gosilex/types` error codes · AGENTS layer table · example routes under `apps/example-api/src/routes/`.

| Layer | May | Must not |
|---|---|---|
| **routes** | Zod parse, guards, call services | touch D1/R2 directly / call repos |
| **services** | business rules, call repos + packages | raw binding spaghetti outside db/storage |
| **repos** | `@gosilex/db` / Drizzle | import services or HTTP |

**Public error JSON:** `{ error: { code, message }, requestId }` — never stacks/SQL/paths.

### Checklist

- [ ] App uses Hono + `AppError` / `onError` pattern (compose core — do not reimplement).
- [ ] Every mutation/input boundary has Zod schemas.
- [ ] New features land as routes → services → repos (grep example `items` or `notes`).
- [ ] FE maps `ApiError` / `requestId` (example `apps/example-web/src/lib/api.ts`).
- [ ] Forbid: repos imported from routes; second ad-hoc error envelope.

---

## 5. UI — shadcn / `@gosilex/ui` shell

**Mark:** **opt-in** SPA.

**SSoT:** [`docs/ui-kit.md`](../ui-kit.md) · package `@gosilex/ui` · living catalog `/admin/design-system` (platform session) · shells in `apps/example-web` (`/admin`, `/app`).

### Checklist

- [ ] Product web app imports `@gosilex/ui` + kit styles (`@import "@gosilex/ui/styles.css"`).
- [ ] Compose shells in `apps/<product>-web` — **do not** dual-edit `packages/ui` or rebrand `example-web` in place.
- [ ] Prefer kit primitives (Button, Dialog, Sheet, Sidebar, Table shell, Form patterns) over one-off CSS.
- [ ] Forms: TanStack Form + Zod (example `lib/schemas` pattern).
- [ ] Skip if: API/MCP-only product with no SPA.

---

## 6. Design tokens / DESIGN.md

**Mark:** **opt-in** SPA (with §5).

**SSoT:** [product-consumer-contract](../product-consumer-contract.md) (design_overrides) · [`config/zero-edit-zones.json`](../../config/zero-edit-zones.json) · [`docs/ui-kit.md`](../ui-kit.md).

| Do | Do not |
|---|---|
| App-owned CSS variables wrapping kit tokens | Patch `packages/ui` colors for product brand |
| Optional product `DESIGN.md` / brand notes under `docs/product/` | Commit permanent dual-edit of kit UI without exception ticket |

### Checklist

- [ ] Override tokens in **app-owned** CSS (not `packages/ui`).
- [ ] Document brand decisions in product docs (`docs/product/` or app `DESIGN.md`) — kit has no mandatory root `DESIGN.md`.
- [ ] Light/dark: follow kit CSS var convention unless product explicitly single-theme.
- [ ] Skip if: no SPA.

---

## 7. Epic split → Spark → GitHub

**Mark:** **required** process (even for thin products — keep the table small).

Template (copy into product vault / Spark project):

| Epic | Outcome | Spark ticket | GH issue | Depends on |
|---|---|---|---|---|
| E0 Compose kit | remotes + zero-edit green | #… | #… | — |
| E1 Auth (per decision tree) | BA and/or `sk_` as scoped — delete row if both skipped | #… | #… | E0 |
| E2 Domain slice 1 | first métier vertical | #… | #… | E1 |
| … | | | | |

Delete template rows the decision tree skipped. **Tooling:** Spark project linked to product repo (`githubEnabled`) · `spark-tickets` CLI · `/dev #N` on GH issues.

### Checklist

- [ ] Product has a Spark project (or explicit “GH-only” exception in brief).
- [ ] ≥1 epic row with Spark ↔ GH linkage **or** GH-only exception with issue # (required for must DoD).
- [ ] First shippable issue is **vertical** (not “setup docs forever”).
- [ ] Agent path: ticket → `github-create` / link → `/dev` or `/implement`.

---

## 8. DoD — « projet starté »

Split **must** vs **opt-in**. **Must** rows cannot be closed with a blank “deferred”.

### Must (always)

- [ ] Product app dirs exist under `apps/<product>-*` and **compose** `@gosilex/*` (ADR-0001) — no dual runtime stack.
- [ ] Consumer DoD complete: [`start-product.md`](./start-product.md) § Checklist DoD consumer — including **`bun run zero-edit` green** (and kit bar as required there).
- [ ] Kit zones clean: no intentional dual-edit of `packages/*` / `apps/example-*` (or time-boxed exception file).
- [ ] Error envelope + routes→services→repos for any Hono API (§4).
- [ ] Decision tree completed in product brief (`docs/product/`): which opt-ins apply.
- [ ] Machine clients: if any in V1 → Bearer `sk_` path is **live** (mint + guard). If none → brief “no machine clients”. A roadmap ticket alone does **not** close this row.
- [ ] ≥1 epic / first issue linked Spark ↔ GH (or GH-only exception with #) — process not empty.

### Opt-in (skip only with explicit “skip if…” in brief)

- [ ] **Browser Auth:** BA cookies + login flows **live** **or** “no browser users” written in brief.
- [ ] **RBAC:** ADR-0003 matrix **wired** **or** “single-tenant / no org” written in brief.
- [ ] **MasterData:** product catalogue patterned on `demo_items` **or** “no referential CRUD” written in brief. (Kit MasterData ≠ métier `docs/product/MASTER-DATA.md` domain model.)
- [ ] **SPA shell + tokens:** product web composes `@gosilex/ui` + app tokens **or** “API-only” written in brief.

---

## Anti-patterns

| Do not | Why |
|---|---|
| Invent `@gosilex/masterdata` / empty packages on day 0 | A8 — package needs 2 call sites or ADR |
| Dual-edit `packages/ui` or `apps/example-*` for brand/métier | Zero-edit · compose only |
| Treat HMAC as live session path | ADR-0002 — BA only |
| Call MasterData “B6 residual pattern” | Pattern **shipped** (`demo_items`); package absent |
| Force full multi-tenant SaaS clone for every Worker | Opt-in modules — see decision tree |
| Put métier in kit `packages/*` | Products own `apps/<product>-*` |
| Skip must DoD with “all deferred” | Vacuous green — residual stays forever |

---

## Not this doc

| Need | Go to |
|---|---|
| Remotes, deny-push, CI App, product-validate, kit baseline | [`start-product.md`](./start-product.md) |
| Intention → Spark → first issue ship | [`fork-to-first-issue.md`](./fork-to-first-issue.md) |
| Full zero-edit zones / foreign org | [`product-consumer-contract.md`](../product-consumer-contract.md) |
| Email transport prod | [ADR-0004](../architecture/adr/0004-email-transport-cf-default.md) |
| Testing floors / CP-\* | [`docs/testing.md`](../testing.md) |

---

## Refs

| Doc | Role |
|---|---|
| [ADR-0001](../architecture/adr/0001-primary-axis-packages-compose-apps.md) | Packages → compose apps |
| [ADR-0002](../architecture/adr/0002-session-hmac-interim-vs-better-auth.md) | BA-only session + dual credential |
| [ADR-0003](../architecture/adr/0003-multi-tenant-rbac-modules.md) | Multi-tenant RBAC + modules |
| [`docs/ui-kit.md`](../ui-kit.md) | `@gosilex/ui` surface |
| [`start-product.md`](./start-product.md) | Zero-edit compose |
| [`fork-to-first-issue.md`](./fork-to-first-issue.md) | First ship runbook |
| README MasterData row | `demo_items` · `/api/items` · `/app/items` |
