---
title: "Spec — Epic B6 · Patterns kit productifs (MasterData, API client, jobs, presign)"
issue: 18
spark: 119
status: approved
tier: F-full
date: 2026-07-30
updated: 2026-08-03
analysis: artifacts/analyses/18-epic-b6-kit-patterns-analysis.md
frame: artifacts/frames/18-epic-b6-kit-patterns-frame.md
related:
  - docs/architecture/adr/0001-primary-axis-packages-compose-apps.md
  - artifacts/reviews/2026-07-12-goal-arbitration-freeze.md
  - artifacts/goals/001-chemin-a-boilerplate-goal.md
pins:
  api_client_package: "@gosilex/api-client"
  masterdata_entity: demo_items
  presign_v1: put-only
  jobs_ci: unit-mock
  children: fresh-under-18
  upload_ui: api-required-fe-optional
  child_issues: { P1: 81, P2: 82, P3: 83, P4: 84 }
  pr_model: one-pr-per-child
  epic_stays_open: true
---

# Spec #18 — B6 · Patterns kit productifs

## Context

- **Issue:** [#18](https://github.com/go-silex/silex-boilerplate/issues/18) · Spark #119
- **Analysis:** [`artifacts/analyses/18-epic-b6-kit-patterns-analysis.md`](../analyses/18-epic-b6-kit-patterns-analysis.md) — **Shape A approved**
- **Frame:** [`artifacts/frames/18-epic-b6-kit-patterns-frame.md`](../frames/18-epic-b6-kit-patterns-frame.md)
- **Doctrine:** A8 package-only-if-example-consumes · A10/A11 demo domain · A20 schemas-in-apps · A25 light presign no video · ADR-0001 axial
- **Delivery shape:** Epic #18 coordinates **4 ordered child tickets** (not mega-PR)

## Intent

Product apps re-copy four day-one bricks (HTTP client + error mapping, master-data CRUD, R2 presign, Queues/cron). The kit only has notes CRUD, app-local `apiFetch`, and storage put/get — no shareable patterns. That causes axial N×M drift and open debt (TD-A-012). Epic B6 closes the gap with **documented + green example** patterns, without product-domain strings.

## Goal

Four copyable productive patterns ship on the kit: package API client, MasterData demo CRUD + page, light R2 presign + demo upload, minimal Queues/cron demo — with docs, `validate:full` green, and an honest README package map.

| Pattern | Outcome for kit consumer |
|---|---|
| **P1 API client** | Shared browser `apiFetch` + `ApiError` matching kit envelope |
| **P2 MasterData** | Full demo CRUD entity + admin-style page (list/create/update/delete) |
| **P3 Presign** | `@gosilex/storage` light presign + example upload without Worker body |
| **P4 Jobs** | Minimal Queues + Cron demo; thin `@gosilex/jobs` only if helpers + A8 |

## Users

| Persona | Need |
|---|---|
| Kit consumer / product dev | Copy 4 patterns without forking error/client/storage stacks |
| Example-web user | Catalog UI + optional upload demo + stable error toasts |
| Example-api operator | Local queue/cron tick + presign with `.dev.vars` |
| Reviewer (axial) | Zero product domain in `packages/*` |

## Expected Behavior (epic-level)

1. Product clones kit → finds **documented** pattern for each of the four (README section + package README where package exists).
2. `example-web` imports API client from **`@gosilex/api-client`** (app re-export OK for baseUrl/i18n).
3. MasterData demo is **end-to-end** (D1 `demo_items` + routes + FE page + i18n FR/EN + auth).
4. Presign demo: authenticated user obtains **PUT** URL under `demo/`, client PUTs bytes, complete/head proves object — Worker never carries large body.
5. Jobs demo: enqueue from route → consumer handles `demo.*` ; scheduled export logs a tick (unit-tested; wrangler bindings present for local).
6. Banlist + extract-dry-run + zero-edit still green.

## Pins (resolved 2026-08-03)

| # | Decision | Pin |
|---|---|---|
| 1 | FE package name | **`@gosilex/api-client`** (new workspace package; not core/client dual export) |
| 2 | MasterData entity | **New `demo_items`** (notes stay attachment/ownership demo — do not overload) |
| 3 | Presign kit v1 | **PUT-only** (GET optional later; no multipart / video) |
| 4 | Jobs in CI | **Unit + mock** handler tests without live CF queue; wrangler producer/consumer declared; `validate:full` must not require CF account |
| 5 | Child issues | **Created** #81 P1 · #82 P2 · #83 P3 · #84 P4 under #18 |
| 6 | Upload UI | **API + tests + README curl required**; minimal example-web UI is optional follow-up if cheap in P3 PR |
| 7 | PR model | **1 PR = 1 child** — `Closes #81|82|83|84` on the child; **never** `Closes #18` on a pattern PR |
| 8 | Epic lifecycle | **#18 stays open** until V2–V5 / epic DoD; close epic manually with evidence after all children |

## Order of implementation

| Step | Pattern | Child (create) | Depends | Rough PR size |
|---|---|---|---|---|
| **1** | FE API client | P1 under #18 | — | S |
| **2** | MasterData | P2 under #18 | FE ideally on P1; BE parallel OK | M |
| **3** | Presign | P3 under #18 | storage package | M |
| **4** | Jobs | P4 under #18 | example-api only first | S–M |

**Parallelism:** after P1, P3 ∥ P4 OK. P2 FE waits on P1 if package cutover is in-scope same epic (preferred).

---

## Pattern P1 — FE API client (+ error mapping)

### Goal

Promote proven `example-web` client into **`@gosilex/api-client`**, consumed by `example-web`.

### API surface

```ts
// @gosilex/api-client
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
  onUnauthorized?: (err: ApiError) => void
}

export function createApiClient(opts?: ApiClientOptions): {
  apiFetch: <T>(path: string, init?: RequestInit) => Promise<T>
}

export function apiFetch<T>(path: string, init?: RequestInit, opts?: ApiClientOptions): Promise<T>

export function apiErrorToMessage(
  err: unknown,
  opts: { fallback: string; messages?: Partial<Record<ErrorCodeName, string>> },
): string
```

**Non-goals package:** React Query hooks, toast UI, route constants, Zod entity schemas, cookie parsing, FR/EN hardcode.

### Files

| Path | Action |
|---|---|
| `packages/api-client/*` | **create** (src, tests, package.json, vitest, tsconfig) |
| `apps/example-web/src/lib/api.ts` | thin wrapper / re-export (`VITE_API_URL`, i18n bridge) |
| `apps/example-web/package.json` | dep `@gosilex/api-client` |
| root workspace + turbo | register package |
| `README.md` package map | row `@gosilex/api-client` |

### Acceptance criteria (P1)

- [ ] Package unit tests green under monorepo test pipeline
- [ ] `example-web` uses package for all `apiFetch` call sites (or single re-export module)
- [ ] Default `credentials: 'include'`
- [ ] Parses kit envelope → `ApiError`; non-JSON → generic HTTP error
- [ ] `apiErrorToMessage` uses caller-supplied catalog — **no** hardcoded French in package
- [ ] Zero product paths in package
- [ ] banlist clean; A8: example-web imports package; README map updated; short package README

---

## Pattern P2 — MasterData (`demo_items`)

### Goal

Copyable referential MasterData **in apps only** — no `@gosilex/masterdata` package.

### Data model

| Field | Type | Notes |
|---|---|---|
| `id` | text PK | uuid |
| `subject` | text | owner (session/sk) — IDOR tests |
| `code` | text | unique per subject |
| `label` | text | display |
| `description` | text optional | |
| `active` | integer/boolean | soft disable |
| `created_at` / `updated_at` | integer ms | |

### API surface

| Method | Path | Guard | Behavior |
|---|---|---|---|
| `GET` | `/api/items` | `requireAuth` | list for subject; optional `?q=` |
| `POST` | `/api/items` | `requireAuth` | create; **409** `CONFLICT` on code |
| `GET` | `/api/items/:id` | `requireAuth` | 404 other subject |
| `PATCH` | `/api/items/:id` | `requireAuth` | update label/description/active |
| `DELETE` | `/api/items/:id` | `requireAuth` | hard delete (kit demo) |

Layers: `routes/items` → `services/items` → `repos/items` · Zod at route · `AppError` only.

### FE surface

| | |
|---|---|
| Route | `/items` + shell nav |
| UI | Table · create dialog · edit · delete confirm · empty/loading/error |
| Data | TanStack Query + Form + Zod in app |
| i18n | FR default + EN |

### Acceptance criteria (P2)

- [ ] Full CRUD + list filter covered by API tests
- [ ] IDOR: B cannot read/patch/delete A’s item
- [ ] Code unique per subject → 409 `CONFLICT`
- [ ] FE page typechecks; happy path covered where cheap
- [ ] i18n FR/EN for page chrome
- [ ] No new package; no share/product strings; seed shows rows after `db:seed`
- [ ] README pointer to MasterData pattern (section preferred over new doc sprawl)

---

## Pattern P3 — R2 presign (PUT-only light)

### Goal

Light presigned **PUT** + demo flow under `demo/` — A25, no video multipart.

### Package surface (`@gosilex/storage`)

```ts
export type PresignMethod = 'PUT' // kit v1
export type PresignInput = {
  key: string
  method: PresignMethod
  expiresIn: number // clamp e.g. 60..3600
  contentType?: string
}
export type PresignResult = {
  url: string
  method: PresignMethod
  headers?: Record<string, string>
  expiresAt: number
}
export type PresignSigner = { sign(input: PresignInput): Promise<PresignResult> }
export async function createPresignedUrl(
  signer: PresignSigner,
  input: PresignInput,
): Promise<PresignResult>
```

App adapter: S3/aws4fetch from env **or** `PRESIGN_MODE=mock` for tests/CI.

### Demo HTTP API

| Method | Path | Behavior |
|---|---|---|
| `POST` | `/api/uploads/presign` | auth · Zod · size ≤ **5_000_000** · key `demo/{subject}/{uploadId}/{safeName}` · return url + headers + expiresAt |
| `POST` | `/api/uploads/:uploadId/complete` | auth · head under prefix · metadata or 404 |

**Client flow:** `POST presign → PUT url → POST complete`

### Acceptance criteria (P3)

- [ ] Package rejects unsafe keys before sign
- [ ] Routes require auth; keys only under `demo/`
- [ ] Size/contentType validated server-side; secrets never returned
- [ ] Tests green without real CF account (`mock` mode)
- [ ] No video/multipart; banlist no `share/` in kit
- [ ] README documents env + curl; storage package docs mention presign

---

## Pattern P4 — Jobs (Queues + Cron minimal)

### Goal

Minimal async pattern: producer + consumer + scheduled tick. No orchestrator. **Prefer app-local**; `@gosilex/jobs` only if non-trivial helpers **and** example-api imports (A8).

### Demo contract

```ts
type DemoJob =
  | { type: 'demo.ping'; at: number; subject?: string }
  | { type: 'demo.log'; message: string }
```

| Surface | Behavior |
|---|---|
| `POST /api/jobs/ping` | auth · `DEMO_QUEUE.send({ type: 'demo.ping', ... })` |
| `queue` export | switch `type` · structured log · ack; unknown type logged + ack (or documented retry) |
| `scheduled` export | log `{ msg: 'demo_cron_tick', ... }` only |

Wrangler: declare producer/consumer bindings; cron optional in triggers if local-friendly — **CI must stay green without live queue**.

### Acceptance criteria (P4)

- [ ] Producer route auth-protected
- [ ] Consumer handles `demo.ping` without throw; unknown type safe
- [ ] No product job type names; unit tests without live CF
- [ ] If package created: example-api imports it (A8)
- [ ] README: local queue notes + honest map (package **or** app-pattern-only)

---

## Data Model & Consumers

| Entity / type | Owner | Consumers | Status |
|---|---|---|---|
| `ApiError` / envelope | `@gosilex/types` + `@gosilex/api-client` | example-web (all fetches) | this epic P1 |
| `demo_items` | example-api schema/migration | items routes + FE `/items` | this epic P2 |
| Presign key `demo/…` | storage + uploads service | browser PUT · complete route | this epic P3 |
| `DemoJob` messages | example-api jobs | queue consumer | this epic P4 |
| `demo_notes` | existing | **unchanged** (not MasterData pattern) | keep |

## Breadboard

### UI affordances

| ID | Affordance | Handler | Data |
|---|---|---|---|
| U1 | Shell nav → Items | router | — |
| U2 | Items table list / search | Query `GET /api/items` | `demo_items` |
| U3 | Create item dialog | Form → `POST /api/items` | code/label/… |
| U4 | Edit item | Form → `PATCH /api/items/:id` | — |
| U5 | Delete confirm | `DELETE /api/items/:id` | — |
| U6 | (optional) Upload demo control | presign → PUT → complete | R2 `demo/` |
| U7 | Error toast / field errors | `apiErrorToMessage` | `ApiError` |

### API / service affordances

| ID | Affordance | Handler | Data |
|---|---|---|---|
| N1 | `apiFetch` / credentials | `@gosilex/api-client` | envelope |
| N2 | Items CRUD routes | routes→services→repos | D1 |
| N3 | Presign + complete | uploads service + signer | R2 / mock |
| N4 | Jobs ping | jobs route + queue | `DemoJob` |
| N5 | Queue consumer | `queue` export | batch |
| N6 | Cron tick | `scheduled` export | logs only |

### System

| ID | Surface | Role |
|---|---|---|
| S1 | `@gosilex/api-client` | package P1 |
| S2 | `@gosilex/storage` presign | package grow P3 |
| S3 | D1 `demo_items` | persistence P2 |
| S4 | R2 / mock | object store P3 |
| S5 | CF Queue / fake batch | async P4 |

```text
Browser
  └─ @gosilex/api-client ──credentials──► example-api (Hono)
         │                                    ├─ items (D1 demo_items)
         │                                    ├─ uploads presign → R2/mock
         │                                    └─ jobs.ping → DEMO_QUEUE → consumer
         └─ (optional) PUT presigned URL ──► R2
```

## Slices

| # | Slice | Demo | Affordance IDs |
|---|---|---|---|
| **V1** | P1 API client package + example-web migration | `bun test` package + web still loads notes/keys | N1, S1, U7 |
| **V2** | P2 MasterData BE+FE | Auth user creates/lists/edits item at `/items` | U1–U5, N2, S3 |
| **V3** | P3 Presign | Curl/tests: presign → mock PUT/complete; optional U6 | N3, S2, S4, (U6) |
| **V4** | P4 Jobs | POST ping + unit consumer/cron; README local notes | N4–N6, S5 |
| **V5** | Epic close | README package map + 4 pattern pointers + `validate:full` | C1–C8 |

Each V1–V4 = one child issue + one PR preferred.

## Success Criteria (epic)

- [ ] V1–V4 merged (or equivalent commits) with pattern docs
- [ ] `bun run validate:full` green after each child and at epic close
- [ ] README package map honest (api-client + storage presign; jobs package only if real)
- [ ] Four demo paths exist (package tests / `/items` / uploads tests+curl / jobs tests)
- [ ] banlist + extract-dry-run + zero-edit green
- [ ] No secrets in git; `.dev.vars.example` placeholders for R2 S3 + PRESIGN_MODE
- [ ] Layers routes → services → repos on new API code
- [ ] Error envelope `ApiErrorBody` unchanged
- [ ] Packages free of product compounds (axial)
- [ ] GH children linked to #18 and closed when their slice DoD met
- [ ] Epic #18 closed with evidence comment (4 patterns + validate)

## Cross-cutting AC

| ID | Criterion |
|---|---|
| C1 | `validate:full` green per child + epic close |
| C2 | banlist + extract + zero-edit green |
| C3 | No secrets in git |
| C4 | Layer discipline on new API |
| C5 | Envelope unchanged |
| C6 | README map no empty-package overclaim |
| C7 | Four patterns each have a demo path |
| C8 | Axial: packages free of product compounds |

## Out of scope

| Out | Why |
|---|---|
| Import CSV bulk | epic |
| Orchestrateur métier | epic |
| Video ≤500 MiB multipart | A25 / product |
| `@gosilex/masterdata` | axial |
| Better Auth changes | other epics |
| Playwright full e2e CI | later quality epic |
| Real prod CF deploy required for green CI | O5 optional |
| Product `apps/share-*` | kit only |

## Pre-check

| Check | Result |
|---|---|
| Testable criteria | pass — binary checkboxes |
| Breadboard IDs in slices | pass — U*/N*/S* mapped V1–V4 |
| Ambiguity budget | pass — χ = **none** (pins table) |
| Slice coverage | pass |
| Edge handling | IDOR, 409, mock presign, unknown job type, size limit documented |

## Expert review notes (inline 2026-08-03)

| ρ | Verdict | Notes |
|---|---|---|
| architect | good | Slice order + A8 matrix sound; PUT-only + mock jobs CI keep gates honest |
| product-lead | good | Shape A children match Spark epic DoD; MasterData separate from notes teaches référentiel |
| adversarial | concerns folded | Vacuous “documented” → require README pointer **and** green demo path (C7); empty jobs package banned by pin + A8 |
| devops | good | Jobs pin unit-mock; no live queue in validate:full |
| axial | good | No masterdata package; keys under `demo/`; no share compounds |

**Unresolved experts:** none blocking approve.

## χ

**none** — all former Unresolved pinned in § Pins.

## Next (after approve)

1. `/plan` — micro-tasks for V1–V5 + child issue creation
2. Implement starting **V1 / P1 API client**
3. Close children then epic with evidence
