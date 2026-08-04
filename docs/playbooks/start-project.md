# Playbook — start project foundations (Auth / RBAC / MasterData / UI / tokens)

**Audience:** eng (or agent) finishing day-0 **compose** and wiring kit **foundations** for a new product.  
**Parent context:** Spark silex **#84** (Plugins umbrella) · kit ticket **#88** / GH **#112**.

> **Not** a rewrite of zero-edit remotes or product-validate. Those live in [`start-product.md`](./start-product.md).  
> **Not** the full métier runbook — that is [`fork-to-first-issue.md`](./fork-to-first-issue.md).

## Goal

Decide which kit foundations you need, wire them by composing `@gosilex/*` + example patterns, and leave with a binary DoD « projet starté » — without AGENTS archaeology or inventing packages.

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
| Env | Product-owned `.dev.vars` / CF secrets — copy **shape** from `apps/example-api/.dev.vars.example`, never commit secrets |

### Checklist

- [ ] Read ADR-0002 one-pager (BA-only + dual credential).
- [ ] Wire or **explicitly skip** BA browser sessions (`SESSION_SECRET` / BA secrets via CF secrets, not git).
- [ ] If machine clients: mint path for `sk_` + guard with `requireAuth` (or product equivalent using `@gosilex/auth`).
- [ ] Confirm example dual-path middleware: `apps/example-api/src/middleware/require-auth.ts`.
- [ ] FE api client uses `credentials: 'include'` when cookies matter (see `apps/example-web/src/lib/api.ts` pattern).
- [ ] Skip if: API-only Worker with no browser and no `sk_` yet — document deferral in product brief.

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
- [ ] Read ADR-0003 dual-level modules + membership model (tenant always = organization).
- [ ] Map mini matrix: who can invite, manage members, enable modules (product table in `docs/product/`).
- [ ] Guards live on routes/services — mirror example invitation / module routes, do not invent a second RBAC package.
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

**SSoT:** product-consumer-contract **design_overrides** · [`docs/ui-kit.md`](../ui-kit.md) zero-edit brand rules.

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
| E1 Auth dual-path | BA and/or `sk_` live | #… | #… | E0 |
| E2 Domain slice 1 | first métier vertical | #… | #… | E1 |
| … | | | | |

**Tooling:** Spark project linked to product repo (`githubEnabled`) · `spark-tickets` CLI · `/dev #N` on GH issues.

### Checklist

- [ ] Product has a Spark project (or explicit “GH-only” exception).
- [ ] At least one epic row with Spark + GH linkage.
- [ ] First shippable issue is **vertical** (not “setup docs forever”).
- [ ] Agent path: ticket → `github-create` / link → `/dev` or `/implement`.

---

## 8. DoD — « projet starté »

Split **must** vs **opt-in**. **Must** rows cannot be closed with a blank “deferred”.

### Must (always)

- [ ] Product apps **compose** `@gosilex/*` (ADR-0001) — no dual runtime stack.
- [ ] Zero-edit remotes + kit bar understood — complete consumer DoD in [`start-product.md`](./start-product.md) § Checklist DoD consumer.
- [ ] Error envelope + routes→services→repos for any Hono API (§4).
- [ ] Decision tree above completed in product brief (`docs/product/`): which opt-ins apply.
- [ ] Dual-path plan: if machine clients exist, Bearer `sk_` path is real or ticketed with owner — not silent.
- [ ] Banlist / no kit dual-edit for métier (product paths only).

### Opt-in (skip only with explicit “skip if…” in brief)

- [ ] **Browser Auth:** BA cookies + login flows live **or** “no browser users” written in brief.
- [ ] **RBAC:** ADR-0003 matrix wired **or** “single-tenant / no org” written in brief.
- [ ] **MasterData:** product catalogue patterned on `demo_items` **or** “no referential CRUD” written in brief.
- [ ] **SPA shell + tokens:** product web composes `@gosilex/ui` + app tokens **or** “API-only” written in brief.
- [ ] **First epic** linked Spark ↔ GH and ready for `/dev`.

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
