# Architecture — P5+P6 (flows / tasks / comments / mcp + example-api)

**Repo:** `roxabi-boilerplate-cf`  
**Date:** 2026-08-12  
**Scope:** `packages/flows`, `packages/tasks`, `packages/comments`, `packages/mcp`, `apps/example-api`  
**Refs:** ADR-0001 (layers), ADR-0005 (flows pure + wire), ADR-0007 (tasks/comments pure)

## Summary

Incubating kernels **`@kit/flows`**, **`@kit/tasks`**, and **`@kit/comments`** stay **pure engines** (Zod + pure helpers; no Hono/D1/Workers deps) as ADRs require. **`apps/example-api`** composes them correctly for **tasks/comments** on the secondary axis `routes → services → repos`, with pure package rules applied in services (visibility, links, stages). **Flows** is intentionally earlier: pure freeze dogfood + D1 schema/migration, **no** repos/services/HTTP/Workflows yet — aligned with platform-proof D3 “not met,” but leaves a **half-wired surface** (tables without consumers). **`@kit/mcp`** is conventions + wire helpers (catalogue, budget, whoami client) without a FastMCP dependency; **`apps/mcp-example`** follows the documented sole-registration path. No P0/P1 architecture breakers; main risks are **layering leak on `/api/me`**, **flows schema-without-lifecycle**, and **sketch migration drift**.

## Findings

| ID | Severity | File | Finding | Evidence | Recommendation |
|----|----------|------|---------|----------|----------------|
| F1 | P2 | `apps/example-api/src/routes/me.ts` | **Route → repo direct** (secondary axis breach) | Only route module importing repos: `platformRolesRepo`, `usersRepo` (lines 6–7, 26, 35). Other routes go via services. `app.ts` comments “routes → services → repos”. | Move me aggregation into `services/user-shell.ts` (or `services/me.ts`); keep route thin (auth + JSON). |
| F2 | P2 | `apps/example-api/src/db/schema.ts` + `migrations/0012_*` vs `src/lib/flows-dogfood.ts` | **Flows D1 present, lifecycle wire absent** | `flowPlans`/`flowRuns` in schema (~131–177) + applied migration 0012; **no** `repos/flows*`, **no** `services/flows*`, **no** `routes/flows*`. Dogfood is pure: `loadPlanFromYaml` + `createRunSnapshot` only (`flows-dogfood.ts`). ADR-0005 D1/D5: later #29–#31 for D1 apply + API + Workflows. | Keep intentional until #30–#31, but track as structural gap: either add thin admin create-run path (persist `runnerView` only via `parseRunnerView` rehydrate) or document “schema-only preview” in dogfood comments so products do not invent parallel run tables. |
| F3 | P2 | `packages/flows/migrations/0001_flows_plans_runs.sql` | **Sketch migration outdated vs applied SSoT** | Package sketch: `created_at`/`updated_at` **text**; applied `0012_flows_plans_runs.sql`: **integer ms** + composite plan↔run FK. Header warns “OUT OF DATE for types.” Product consumers may copy sketch. | Prefer generating sketches from applied migration, or fail CI if sketch ≠ applied (except intentional marker). At minimum keep single SSoT pointer and delete conflicting column types. |
| F4 | P2 | `packages/mcp/src/index.ts` vs flows grant model | **MCP has no grant∩ / registry parity path yet** | MCP catalogue: `effect`/`auth` **descriptive only** (`catalogue.ts` SC12); real auth = handler + API `sk_`. ADR-0005 / AGENTS: tools under grants when wired; parity MCP↔flows when both present. Flows has `checkPlan` + `executionTools`; MCP does not compose that. | Accept until flows runner + product tools exist. When wiring effectful MCP tools, reuse registry version + grant mint pattern (never plan/client allowlist). Do not invent a second authority model. |
| F5 | P3 | `apps/example-api/src/middleware/require-auth.ts`, `org-context.ts` | Middleware talks to repos (and some services) | `require-auth` → `keysRepo` (+ dynamic `orgs`); `org-context` → `orgsRepo` / `platformRolesRepo` + `orgRolesService` / `platformModulesService`. Not “routes→repos,” but bypasses service façade for tenancy bootstrap. | Treat as **allowed exception** (auth/tenancy middleware). Avoid growing more repo imports into routes; keep pattern confined to middleware. |
| F6 | P3 | `packages/comments/src/audience.ts` | **Audience type dual SSoT** | Comments: “Mirror of @kit/tasks Audience — kept local to avoid package cycles.” Same `'staff' \| 'external'` literals; no shared import. | Acceptable for purity. If third package needs Audience, extract tiny `@kit/types` or shared enum — avoid cycles via tasks→comments. |
| F7 | P3 | `apps/example-api/src/lib/tasks-dogfood.ts` | Stale dogfood header vs live HTTP | Comment: “Full D1 + HTTP dogfood is a later tranche.” Reality: `routes/tasks.ts` + `services/tasks.ts` + `repos/tasks.ts` + migration 0013 + schema tables live. | Refresh comment to distinguish pure smoke helpers vs request-path dogfood (or fold pure helpers into tests only). |
| F8 | P3 | `packages/tasks/src/hooks.ts` + `services/tasks.ts` | **TaskMutationHooks unused in example-api** | ADR-0007 D8 optional hooks; `runTaskMutationHook` exported; zero call sites in app services (create/update/delete/link). | Optional for V0. Wire afterMutation once for audit/notif dogfood so product compose has a pattern. |
| F9 | P3 | `packages/mcp/src/index.ts` (`handleWhoami`) | MCP package does **network I/O** (not pure engine) | `handleWhoami` → `fetch` GET `/api/me` with SSRF host allowlist. Contrasts with pure flows/tasks/comments. Still no FastMCP/Workers binding. | Keep as “conventions + client helpers.” Document purity boundary: catalogue/budget pure; whoami is transport. Avoid adding D1/auth verify inside package. |
| F10 | P3 | `apps/example-api/src/routes/orgs.ts`, `services/admin-users.ts`, `db/schema.ts` | **Largest modules under P6** (not yet god-file threshold) | `routes/orgs.ts` ~321 LOC (RBAC + modules + roles); `services/admin-users.ts` ~294; `db/schema.ts` ~267 (all tables incl. incubating). Quality gate context ~400 LOC. | Split orgs route when flows admin routes land (flows should not expand orgs further). Schema: consider domain splits only if LOC≫400 or multi-app reuse. |
| F11 | — (positive) | `packages/{flows,tasks,comments}/package.json` | **Purity deps OK** | flows: `yaml`+`zod` only; tasks/comments: `zod` only. Grep: no `hono`/`drizzle`/`@cloudflare` imports. Index headers state “no Worker bindings.” | Maintain ban: no CF bindings in incubating pure packages until ADR promotes a wire subpath. |
| F12 | — (positive) | `apps/example-api/src/services/tasks.ts`, `comments.ts`, `tasks-links.ts` | **Correct kit compose** | Services use `@kit/tasks` parse/visibility/stage/link helpers + org-scoped repos; routes only call services + module middleware (`TASKS_MODULE_ID` / `COMMENTS_MODULE_ID`). Audience resolved in service from orgRole (`reader`→`external`). | Keep object ACL after module ACL; do not reimplement filter in routes. |
| F13 | — (positive) | `apps/mcp-example/src/index.ts` + `packages/mcp` | **MCP conventions match example wiring** | App: `createToolCatalogue` → `registerAll(server)` sole path; tools `ping`/`whoami` only; smoke uses `catalogue.names`. Package duck-types `ToolServer` (no fastmcp dep); `assertToolsMatchAllowlist`; dual channels domain whoami status vs `PublicToolError`. | Preserve sole registration path; product tools stay in app catalogues. |
| F14 | — (positive) | `packages/flows/src/index.ts`, `authority.ts`, `snapshot.ts` | **Authority / snapshot contracts exported correctly** | `resolveEffectiveAuthority` **not** exported (unsafe without pin). `createRunSnapshot` returns separate `grantAudit`; comments require persist `runnerView` only + `parseRunnerView`. Dogfood grant fixed server-side (`dogfoodFixedGrant`), not client allowlist. | Keep non-export of raw resolve; #31 mint must stay app-owned. |

## Metrics

| Metric | Value |
|--------|--------|
| Files reviewed (approx.) | ~55 TS/SQL in P5 packages + example-api layering paths |
| Package purity | flows/tasks/comments: **clean**; mcp: **conventions + HTTP client** |
| example-api routes with repo imports | **1** (`routes/me.ts`) |
| example-api routes with service imports only | 12 of 13 business route modules |
| Flows request-path surface | **0** routes / **0** repos |
| Tasks/comments request-path surface | **yes** (`/api/tasks*`, nested comments) |
| MCP package → FastMCP dep | **no** (duck-type) |
| mcp-example tools | `ping`, `whoami` |
| Issues | P0=0 · P1=0 · P2=4 · P3=6 · positives=4 |
| Notable hotspots | `routes/me.ts` (layering); flows schema without lifecycle; `routes/orgs.ts` growth; sketch SQL drift |

### Package surface (P5)

| Package | Role (as shipped) | Runtime deps | App wire state |
|---------|-------------------|--------------|----------------|
| `@kit/flows` | check, grant∩, snapshot, YAML, access | zod, yaml | Pure dogfood + D1 schema only |
| `@kit/tasks` | stages, visibility, links, scope, hooks | zod | Full R→S→repo dogfood |
| `@kit/comments` | multi-target comments + visibility | zod | Nested under tasks routes |
| `@kit/mcp` | catalogue, budget, whoami client, public errors | zod, `@kit/auth` (parseBearer) | `mcp-example` only in kit |

### example-api compose of `@kit/*` (P6)

| Concern | Package | App locus |
|---------|---------|-----------|
| Auth dual-path | `@kit/auth` | middleware + services/auth |
| Errors | `@kit/core` | middleware/error-handler, services |
| D1 factory | `@kit/db` | middleware/db |
| Email | `@kit/email` | lib/email-port, services |
| R2 | `@kit/storage` | services/uploads, notes |
| Flows pure | `@kit/flows` | lib/flows-dogfood, module ids |
| Tasks pure | `@kit/tasks` | services/tasks*, routes/tasks |
| Comments pure | `@kit/comments` | services/comments, routes/tasks |
| MCP | `@kit/mcp` | **not** in example-api (separate app) |

## Recommendations

1. **Fix F1 (P2):** extract `getMeProfile` service; remove all `repos/*` imports from `routes/me.ts` so layering is machine-grepable (zero route→repo hits).
2. **Close or label F2 (P2):** when landing #31, add `repos/flows` + service that (a) mints grant from session/org policy, (b) `createRunSnapshot`, (c) persists **only** `JSON.stringify(runnerView)`, (d) never rehydrates without `parseRunnerView`. Do not put Workflows engine logic in `@kit/flows` pure core.
3. **F3 (P2):** align package sketch SQL with applied migration or replace sketch body with “see apps/example-api/migrations/0012…” only — reduce copy-paste footgun for product forks.
4. **F4:** keep MCP effect metadata non-authorizing; plan grant∩ for MCP only after flows runner evidence (same registryVersion story).
5. **Hygiene (P3):** refresh `tasks-dogfood` comments; optionally wire `runTaskMutationHook` once; document MCP purity boundary in package README (already strong on catalogue — add whoami note).
6. **Do not** promote `@kit/flows` / `@kit/tasks` / `@kit/comments` until D6 gates (second call site / first product compose) — architecture already respects incubating posture.
7. **God-file watch:** split `routes/orgs.ts` before adding flows admin routes into the same module; keep new flows routes in `routes/flows.ts`.

## Clean / non-issues (for synthesizer)

- No packages importing apps.
- No Worker bindings inside pure incubating packages.
- Tasks IDOR-oriented filters live in services (package helpers), not routes.
- MCP example does not ad-hoc `server.addTool` outside `registerAll`.
- `resolveEffectiveAuthority` correctly unexported.
- Middleware repo access is scoped and does not negate overall layering health.
