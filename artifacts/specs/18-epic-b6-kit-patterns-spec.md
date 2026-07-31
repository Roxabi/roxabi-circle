---
title: "Spec — Epic B6 · Patterns kit productifs (MasterData, API client, jobs, presign)"
issue: 18
spark: 119
status: draft
tier: F-full
date: 2026-07-30
analysis: artifacts/analyses/18-epic-b6-kit-patterns-analysis.md
related:
  - docs/architecture/adr/0001-primary-axis-packages-compose-apps.md
  - artifacts/reviews/2026-07-12-goal-arbitration-freeze.md
  - artifacts/goals/001-chemin-a-boilerplate-goal.md
---

# Spec #18 — B6 · Patterns kit productifs (draft)

## Context

- **Issue:** [#18](https://github.com/go-silex/silex-boilerplate/issues/18) · Spark #119
- **Analysis:** [`artifacts/analyses/18-epic-b6-kit-patterns-analysis.md`](../analyses/18-epic-b6-kit-patterns-analysis.md) (Shape A)
- **Doctrine:** A8 package-only-if-example-consumes · A10/A11 demo domain · A20 schemas-in-apps · A25 light presign no video · ADR-0001 axial
- **Status:** **draft** — open pins § Unresolved before `/plan`

## Goal

Ship **four copyable productive patterns** on the Chemin A kit so product apps do not re-invent HTTP client, master-data CRUD, R2 presign, or CF Queues/cron glue:

| Pattern | Outcome for kit consumer |
|---|---|
| **P1 API client** | Shared browser `apiFetch` + `ApiError` matching kit envelope |
| **P2 MasterData** | Full demo CRUD entity + admin-style page (list/create/update/delete) |
| **P3 Presign** | `@gosilex/storage` light presign + example upload without Worker body |
| **P4 Jobs** | Minimal Queues + Cron demo + optional thin `@gosilex/jobs` |

**Epic DoD (from #18):**

- [ ] 4 patterns documentés + example verts  
- [ ] `bun run validate:full` vert  
- [ ] README package map à jour  

## Users

| Persona | Need |
|---|---|
| Kit consumer / product dev | Copy 4 patterns without forking error/client/storage stacks |
| Example-web user | Notes/catalog UI + large-file upload demo + stable error toasts |
| Example-api operator | Local queue/cron tick + presign with `.dev.vars` |
| Reviewer (axial) | Zero product domain in `packages/*` |

## Expected Behavior (epic-level)

1. Product clones kit → finds **documented** pattern for each of the four (README + short `docs/` or package README).
2. `example-web` imports API client from **package** (not only app-local).
3. MasterData demo is **end-to-end** (D1 + routes + FE page + i18n FR/EN + auth).
4. Presign demo: authenticated user obtains PUT URL for key under `demo/`, client PUTs bytes, commit/head proves object exists — Worker never carries large body.
5. Jobs demo: enqueue from a route (or service) → consumer logs/handles `demo.*` message ; optional cron writes structured log tick.
6. Banlist + extract-dry-run still green (no share compounds).

---

## Order of implementation

| Step | Pattern | Ticket (epic body) | Depends | Rough PR size |
|---|---|---|---|---|
| **1** | FE API client | #92 (créer si absent) | — | S |
| **2** | MasterData | #90 | ideally #92 for FE; BE can start parallel | M |
| **3** | Presign | #91 | storage package; FE optional via client | M |
| **4** | Jobs | #89 | example-api only first | S–M |

**Parallelism:** after step 1, steps 3 ∥ 4 OK; step 2 FE waits on step 1 if package cutover is mandatory in same epic.

---

## Pattern P1 — FE API client (+ error mapping)

### Goal

Promote the proven `example-web` client into a **kit package** consumed by `example-web`, so product SPAs import one isomorphic fetch + `ApiError` aligned with `@gosilex/types` / BE `toApiErrorBody`.

### API surface (proposed)

```ts
// @gosilex/api-client  (name pin: see Unresolved)
export class ApiError extends Error {
  readonly status: number
  readonly code: string
  readonly requestId: string
  readonly details?: unknown
  constructor(status: number, body: ApiErrorBody)
}

export type ApiClientOptions = {
  baseUrl?: string
  credentials?: RequestCredentials // default 'include'
  fetch?: typeof fetch
  defaultHeaders?: HeadersInit
  /** Called on 401 before throw — app clears session / redirects */
  onUnauthorized?: (err: ApiError) => void
}

export function createApiClient(opts?: ApiClientOptions): {
  apiFetch: <T>(path: string, init?: RequestInit) => Promise<T>
}

// Convenience default (baseUrl from env is APP concern — inject baseUrl)
export function apiFetch<T>(path: string, init?: RequestInit, opts?: ApiClientOptions): Promise<T>

/** Pure map: ErrorCode → message via caller-supplied catalog; no FR/EN hardcode in package */
export function apiErrorToMessage(
  err: unknown,
  opts: { fallback: string; messages?: Partial<Record<ErrorCodeName, string>> },
): string
```

**Non-goals package:** React Query hooks, toast UI, route constants, Zod entity schemas, cookie parsing.

### Files

| Path | Action |
|---|---|
| `packages/api-client/package.json` | **create** workspace package |
| `packages/api-client/src/index.ts` | ApiError, createApiClient, apiFetch, apiErrorToMessage |
| `packages/api-client/src/index.test.ts` | envelope, credentials, 401 hook, non-JSON |
| `packages/api-client/tsconfig.json` · `vitest.config.ts` | kit presets |
| `apps/example-web/src/lib/api.ts` | **re-export or thin wrapper** (baseUrl `VITE_API_URL`, i18n bridge) |
| `apps/example-web/src/lib/api.test.ts` | keep contract tests; import package |
| `apps/example-web/package.json` | dep `@gosilex/api-client` |
| root `package.json` / turbo | workspace + test pipeline |
| `README.md` package map | row `@gosilex/api-client` |
| `AGENTS.md` §H (optional same PR or follow-up) | map entry |

**Alt pin:** if team prefers zero new package name, export from `@gosilex/core/client` with dual export map — still **must** be imported by example-web (A8).

### Acceptance criteria

- [ ] Package has unit tests green under `bun run test` / coverage floors policy
- [ ] `example-web` uses package for all `apiFetch` call sites (or single re-export module)
- [ ] Default `credentials: 'include'`
- [ ] Parses kit envelope → `ApiError`; non-JSON error → generic HTTP error
- [ ] `apiErrorToMessage` accepts app catalog keys — **no** hardcoded French strings in package
- [ ] Zero product paths in package (`/api/notes` etc. only in apps)
- [ ] banlist clean

### DoD (P1)

- [ ] A8: example-web imports package  
- [ ] `validate:full` green  
- [ ] README package map updated  
- [ ] Short package README (1 screen)

---

## Pattern P2 — MasterData (entité demo CRUD + page)

### Goal

Provide a **copyable MasterData pattern**: referential-style entity with list + create + **update** + delete, ownership/auth, Zod boundaries, TanStack table UI, FR/EN — **entirely in apps**, no `@gosilex/masterdata` package.

### Recommended shape (pin at plan)

**Preferred:** new entity `demo_items` (or `demo_catalog`) — clear « référentiel » semantics, does not overload notes attachments.

| Field | Type | Notes |
|---|---|---|
| `id` | text PK | uuid |
| `subject` | text | owner (session/sk subject) — IDOR tests |
| `code` | text | stable slug/code per subject unique |
| `label` | text | display name |
| `description` | text optional | |
| `active` | boolean | soft disable (not hard product workflow) |
| `created_at` / `updated_at` | integer ms | |

**Alt:** upgrade `demo_notes` with PATCH + search — less clear MasterData teaching; only if PR budget forces reuse.

### API surface (example-api)

| Method | Path | Guard | Body / behavior |
|---|---|---|---|
| `GET` | `/api/items` | `requireAuth` | list for subject; optional `?q=` filter code/label |
| `POST` | `/api/items` | `requireAuth` | create; **409** on code conflict (`CONFLICT`) |
| `GET` | `/api/items/:id` | `requireAuth` | get one; **404** other subject |
| `PATCH` | `/api/items/:id` | `requireAuth` | update label/description/active |
| `DELETE` | `/api/items/:id` | `requireAuth` | hard delete (kit demo) |

Layers: `routes/items` → `services/items` → `repos/items` · Zod at route · `AppError` only.

### FE surface (example-web)

| | |
|---|---|
| Route | `/items` (or `/master-data`) in router + shell nav |
| UI | Table list · Dialog create · Dialog/sheet edit · delete confirm · empty/loading/error |
| Data | TanStack Query + Form + Zod schema in `lib/schemas.ts` |
| i18n | FR default + EN keys in `messages/*` + contract test |
| Errors | package `apiErrorToMessage` + toast |

### Files

| Path | Action |
|---|---|
| `apps/example-api/migrations/000N_demo_items.sql` | create table + unique(subject, code) |
| `apps/example-api/src/db/schema.ts` | drizzle table |
| `apps/example-api/src/repos/items.ts` | CRUD queries always `subject` predicate |
| `apps/example-api/src/services/items.ts` | conflict / notFound |
| `apps/example-api/src/routes/items.ts` | mount in `app.ts` |
| `apps/example-api/src/**/*.test.ts` | list ownership IDOR, 409 code, patch |
| `apps/example-api/src/seed/*` | seed 2–3 items for demo users |
| `apps/example-web/src/routes/items.tsx` | page |
| `apps/example-web/src/routeTree.tsx` · shell nav | link |
| `apps/example-web/src/messages/{fr,en}.ts` | strings |
| `docs/` or `apps/example-api` comment | **Pattern doc** « how to copy MasterData » (short) |

### Acceptance criteria

- [ ] Full CRUD + list filter smoke (API tests)
- [ ] IDOR: user B cannot read/patch/delete user A item
- [ ] Code unique per subject → 409 `CONFLICT`
- [ ] FE page green typecheck; create/edit/delete happy path unit or component-level where cheap
- [ ] i18n FR/EN for page chrome
- [ ] **No** new package; **no** share/product strings
- [ ] Documented as kit pattern (README pointer or `docs/patterns/master-data.md` **only if** useful — prefer README section to avoid doc sprawl)

### DoD (P2)

- [ ] example-api + example-web consume pattern  
- [ ] seed shows data after `db:seed`  
- [ ] `validate:full` green  

---

## Pattern P3 — R2 presign demo

### Goal

Close AGENTS/storage map gap: **light presigned PUT** helper + demo flow for small direct-to-R2 upload under `demo/` — **not** share M2 video multipart.

### API surface (`@gosilex/storage`)

```ts
export type PresignMethod = 'PUT' | 'GET' // kit: implement PUT required; GET optional

export type PresignInput = {
  /** Full object key — caller builds via joinObjectKey / StorageClient.key */
  key: string
  method: PresignMethod
  /** seconds, clamp e.g. 60..3600 */
  expiresIn: number
  contentType?: string
}

export type PresignResult = {
  url: string
  method: PresignMethod
  headers?: Record<string, string> // e.g. Content-Type if signed
  expiresAt: number // epoch ms
}

export type PresignSigner = {
  sign(input: PresignInput): Promise<PresignResult>
}

/** Validate key safety then delegate to signer (S3/aws4fetch adapter lives in app or storage/s3) */
export async function createPresignedUrl(
  signer: PresignSigner,
  input: PresignInput,
): Promise<PresignResult>

// StorageClient method optional:
// client.presign(parts, { method, expiresIn, contentType }, signer)
```

**App adapter (example-api):**

```ts
// builds AwsClient from env R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET / endpoint
// PRESIGN_MODE=mock → returns fake URL + records intent for tests
```

### Demo HTTP API

| Method | Path | Behavior |
|---|---|---|
| `POST` | `/api/uploads/presign` | auth · Zod `{ filename, contentType, size }` · reject size > kit cap (e.g. **5_000_000**) · key = `demo/{subject}/{uploadId}/{safeName}` · return `{ uploadId, url, headers, expiresAt, key }` |
| `POST` | `/api/uploads/:uploadId/complete` | auth · `head` object under prefix · return metadata or 404 if missing |
| `GET` | `/api/uploads/:uploadId` | optional status |

**Client flow:**

```text
POST presign → PUT url (browser fetch to R2/mock) → POST complete → UI shows OK
```

Local/CI without real R2 S3 API:

- `PRESIGN_MODE=mock`: complete accepts mock or uses Worker `bucket.put` fallback documented in tests.

### Files

| Path | Action |
|---|---|
| `packages/storage/src/index.ts` | key assert + `createPresignedUrl` / types |
| `packages/storage/src/presign.test.ts` | traversal reject, expires clamp, mock signer |
| `apps/example-api/src/lib/presign.ts` | S3/mock signer adapter |
| `apps/example-api/src/routes/uploads.ts` · services | demo routes |
| `apps/example-api/src/env.schema.ts` · `.dev.vars.example` | optional R2 S3 creds + PRESIGN_MODE |
| `apps/example-api` tests | auth required, size limit, key prefix `demo/` |
| `apps/example-web` optional page or notes attachment alt | minimal UI **or** API-only demo + curl in README (prefer **minimal UI** if cheap) |
| `README.md` | document env + curl flow |

### Acceptance criteria

- [ ] Package rejects unsafe keys before sign  
- [ ] Example route requires auth  
- [ ] Keys only under `demo/` via `StorageClient` / `joinObjectKey`  
- [ ] Size/contentType validated server-side  
- [ ] Secrets never returned to client  
- [ ] Tests pass without real Cloudflare account (`mock` mode)  
- [ ] No video/multipart product frame (A25)  
- [ ] banlist: no `share/` prefixes in kit code  

### DoD (P3)

- [ ] `@gosilex/storage` surface documents presign  
- [ ] example-api demo green  
- [ ] `validate:full` green  
- [ ] README package map notes presign  

---

## Pattern P4 — Jobs (CF Queues + Cron) minimal

### Goal

Ship a **minimal, copyable** async pattern: producer binding + consumer handler + optional cron scheduled export — so products do not invent queue wiring alone. Orchestrators / CSV bulk **out**.

### API surface

#### App-first (required)

```ts
// apps/example-api/src/index.ts (worker entry)
export default {
  fetch: app.fetch,
  async queue(batch, env, ctx) { ... },      // consumer
  async scheduled(controller, env, ctx) { ... }, // cron tick
}
```

```toml
# wrangler.toml (local names)
[[queues.producers]]
binding = "DEMO_QUEUE"
queue = "example-api-demo"

[[queues.consumers]]
queue = "example-api-demo"
max_batch_size = 10
max_batch_timeout = 5

[triggers]
crons = ["0 * * * *"]  # or doc-only if CI fragile — pin at implement
```

#### Demo message contract (app)

```ts
type DemoJob =
  | { type: 'demo.ping'; at: number; subject?: string }
  | { type: 'demo.log'; message: string }
```

| Method | Path | Behavior |
|---|---|---|
| `POST` | `/api/jobs/ping` | auth · `env.DEMO_QUEUE.send({ type: 'demo.ping', ... })` · `{ ok, requestId }` |
| Consumer | `queue` | switch on `type` · structured log · `msg.ack()` |
| Cron | `scheduled` | log `{ msg: 'demo_cron_tick', cron, scheduledTime }` only |

#### Optional package `@gosilex/jobs` (only if helpers non-trivial **and** imported by example)

```ts
// Allowed thin surface
export function parseJobBody<T>(raw: unknown, schema: ZodType<T>): T  // or leave Zod in app
export async function processBatch(
  batch: MessageBatch,
  handler: (body: unknown, msg: Message) => Promise<void>,
): Promise<void>  // ack/retry policy helper
```

**Do not create package** if it only re-exports `queue.send`. Prefer **app-local** + README pattern until second app needs helpers (X6).

### Files

| Path | Action |
|---|---|
| `apps/example-api/wrangler.toml` | producers/consumers (+ cron if pinned) |
| `apps/example-api/src/index.ts` | export queue/scheduled |
| `apps/example-api/src/jobs/demo-handler.ts` | handler pure-ish |
| `apps/example-api/src/routes/jobs.ts` | enqueue route |
| `apps/example-api/src/types.ts` · env | Queue binding types |
| `apps/example-api` tests | handler unit tests with fake batch; route 401 |
| `packages/jobs/*` | **optional** — only with import from example-api |
| `README.md` | how to run queue locally |

### Acceptance criteria

- [ ] Producer route auth-protected  
- [ ] Consumer handles `demo.ping` without throw; unknown type logged + ack (or retry policy documented)  
- [ ] No product job type names in kit  
- [ ] Unit tests for handler **without** live Cloudflare  
- [ ] If package created: example-api imports it (A8)  
- [ ] Document limitation: local queue quirks  

### DoD (P4)

- [ ] Pattern documented + example verts (handler tests minimum)  
- [ ] `validate:full` green  
- [ ] README package map: `@gosilex/jobs` **or** explicit « app pattern only (no package yet) » honesty  

---

## Epic-level files / docs

| Path | Action |
|---|---|
| `artifacts/analyses/18-epic-b6-kit-patterns-analysis.md` | done (analysis) |
| `artifacts/specs/18-epic-b6-kit-patterns-spec.md` | this file (draft) |
| `README.md` | package map + patterns section after implement |
| GH children issues | create/link #89–#92 or replacements |
| `AGENTS.md` §H | update storage/jobs/api-client rows when shipped (implement PR, not this draft-only task) |

## Out of scope (epic + children)

| Out | Why |
|---|---|
| Import CSV bulk | epic hors scope |
| Orchestrateur métier / workflow engine | epic hors scope |
| Video ≤500 MiB multipart share M2 | A25 · product frame |
| `@gosilex/masterdata` package | axial domain leak |
| Better Auth changes | other epics |
| Playwright full matrix / login e2e CI | freeze P8 optional later |
| Billing, PostHog, Datadog | A17/A19 |
| Product `apps/share-*` | kit only |
| Real prod CF deploy required | O5 optional |

## Cross-cutting AC / DoD

| ID | Criterion |
|---|---|
| C1 | `bun run validate:full` green after each child merge (and epic close) |
| C2 | banlist + extract-dry-run + zero-edit (kit) green |
| C3 | No secrets in git; `.dev.vars.example` placeholders only |
| C4 | Layers routes → services → repos respected on new API code |
| C5 | Error envelope unchanged (`ApiErrorBody`) |
| C6 | README package map reflects reality (no overclaim empty packages) |
| C7 | Four patterns each have a **demo path** (route, page, or documented curl + test) |
| C8 | Axial review: packages free of product compounds |

## Breadboard (wiring)

```text
Browser
  └─ @gosilex/api-client ──credentials──► example-api (Hono)
         │                                    │
         │                                    ├─ items MasterData (D1)
         │                                    ├─ uploads presign → R2 S3/mock
         │                                    └─ jobs.ping → DEMO_QUEUE
         │                                                    │
         │                                                    ▼
         │                                              queue consumer (demo.*)
         │                                              scheduled cron tick
         └─ (optional) PUT presigned URL ──────────────► R2

packages/storage ── createPresignedUrl(signer) used by uploads service
packages/api-client ── used by example-web only at first (A8)
packages/jobs ── optional
```

## Unresolved (block plan, not draft)

1. Package name: `@gosilex/api-client` vs `@gosilex/core/client`  
2. MasterData entity: new `demo_items` vs notes upgrade  
3. Presign GET support in kit v1? (default **PUT-only**)  
4. Cron in wrangler CI vs scheduled export unit-tested only  
5. GH child issue IDs (recreate #89–#92)  
6. Minimal upload UI in example-web vs API-only + README curl  

## Status

**draft** — analysis Shape A accepted as recommendation; implementation not started; no ADR required unless api-client placement or jobs package policy is disputed.

## Next

1. Human pin § Unresolved  
2. Create GH child issues under #18  
3. `/plan` per child starting with **P1 API client**  
4. Implement · `validate:full` · comment epic on close with evidence  
