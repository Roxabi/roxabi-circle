# Type Safety — example-api (P6)

## Summary

`apps/example-api` is in solid type-safety shape for a Hono Worker dogfood: **no production `any` / `as any`**, shared `AppEnv` (`Bindings: Env` + `Variables: AppVariables`), and mutation bodies generally go through Zod (`safeParse` / `parseOrThrow`) at the route or service boundary. Weak spots cluster around **Env completeness vs wrangler** (`DEMO_QUEUE` missing from `Env` / `WORKER_BINDINGS`, forced casts at the jobs route and untyped queue/scheduled entry), **Hono context non-null assertions** after middleware (`c.get('db')!`, `c.get('subject')!` × ~90), and a few **`as object` / `as Record` spreads** before Zod that paper over `null` JSON. JSON.parse is rare and guarded. Tests rely heavily on `as unknown as D1Database` for the memory D1 shim — acceptable test harness debt, not product-path risk.

## Findings

| ID | Severity | File | Finding | Evidence | Recommendation |
|----|----------|------|---------|----------|----------------|
| F1 | P1 | `src/env.ts`, `src/env.schema.ts`, `wrangler.toml`, `src/routes/jobs.ts` | **Env type incomplete: `DEMO_QUEUE` binding absent** | `wrangler.toml` declares `[[queues.producers]] binding = "DEMO_QUEUE"` (root + production). `WORKER_BINDINGS = ['DB','BUCKET','EMAIL']` and `Env` only add `DB` / `BUCKET` / optional `EMAIL`. Jobs route must cast: `(c.env as { DEMO_QUEUE?: QueueLike }).DEMO_QUEUE` | Add optional `DEMO_QUEUE?: Queue` (or typed `{ send(body: unknown): Promise<void> }`) to `Env`; include `'DEMO_QUEUE'` in `WORKER_BINDINGS` so env:check / inventory stay SSoT. Drop the cast in `jobs.ts`. |
| F2 | P1 | `src/index.ts` | **Worker queue/scheduled handlers use `unknown` env/ctx** | `queue(batch, _env: unknown, _ctx: unknown)` and `scheduled(controller, _env: unknown, _ctx: unknown)` — not `Env` / `ExecutionContext`. Batch body typed loosely as ad-hoc structural type, not `MessageBatch` | Type default export as `ExportedHandler<Env>` (or explicit `queue`/`scheduled` signatures with `Env`). Parse queue body with existing `parseDemoJob` (already returns typed `DemoJob \| null`). |
| F3 | P2 | `src/routes/tasks.ts`, `src/services/tasks.ts`, `src/services/comments.ts`, `src/services/tasks-links.ts` | **Unsafe object cast before Zod merge** | Route: `(await c.req.json().catch(() => null)) as Record<string, unknown> \| null` then spread. Services: `{ ...(raw as object), orgId, … }` + `parseOrThrow`. Cast assumes object shape; `null`/array still reach spread (runtime OK for null, odd for primitives) | Prefer `const body = z.record(z.unknown()).nullable().parse(...)` or `typeof raw === 'object' && raw !== null && !Array.isArray(raw) ? raw : {}` before merge; keep server fields (`orgId`, `createdBy`) only after parse of client schema. |
| F4 | P2 | `src/middleware/require-auth.ts`, `src/middleware/better-auth.ts` | **Middleware typing papered with casts** | `createRequireAuth(...) as MiddlewareHandler<AppEnv>`; `c.set('betterAuth', auth as KitBetterAuth)`. `KitBetterAuth` is intentional structural type (TS2742), but `requireAuth` double-cast weakens AppEnv propagation | Align `createRequireAuth` generic with `AppEnv` in `@kit/auth` so app cast is unnecessary; keep structural BA type but assert once at factory return (`createBetterAuth` already returns `KitBetterAuth`). |
| F5 | P2 | `src/routes/**` (most handlers) | **Non-null assertions on Hono Variables after middleware** | ~90× `c.get('db')!` / `c.get('subject')!` / `c.get('orgId')!` on routes that stack `requireAuth` / `requireOrgContext`. Types mark fields optional (`subject?`, `db?`) so TS cannot prove post-middleware presence | Small helpers `dbOf(c)` / `subjectOf(c)` (already in `org-context` / `require-auth` privately) exported and used in routes; or Hono route-level generics / typed middleware chain that narrows Variables. Prefer throw `AppError.internal` over `!`. Pattern already used well in `admin-audit.ts` (`if (!db) throw …`). |
| F6 | P2 | `src/routes/items.ts`, `src/routes/tasks.ts`, path params generally | **Query/path params often unvalidated at boundary** | `items` list: raw `c.req.query('q')` unbounded; `tasks` `boardKey` query unvalidated; path `:id` / `:roleId` / `:moduleId` passed as bare `string` (services may check existence, not length/charset) | Zod for query where it matters (length-capped `q`, `boardKey` max length). Path ids: shared `z.string().min(1).max(64)` (or UUID) helper. Not a type-system hole alone, but boundary contract incomplete. |
| F7 | P3 | `src/app.ts`, `src/middleware/error-handler.ts` | **`status as ContentfulStatusCode`** | `toApiErrorBody` returns numeric status; Hono wants branded `ContentfulStatusCode` | Map known AppError statuses via a small allowlist cast helper, or type `toApiErrorBody` status as Hono’s status union in `@kit/core`. |
| F8 | P3 | `src/services/audit.ts` | **JSON.parse of stored meta without schema** | `meta = JSON.parse(r.metaJson) as Record<string, unknown>` inside try/catch | Fine for opaque audit meta; optional `z.record(z.unknown()).safeParse` if you want parse failures typed without cast. |
| F9 | P3 | `src/lib/presign.ts`, `src/routes/uploads.ts` | **Presign env cast + dummy R2 cast** | `c.env as { PRESIGN_MODE?: string }`; `new StorageClient({} as KitR2Bucket, 'demo')` for key path only | `Env` already has `PRESIGN_MODE?` via `WorkerStringEnv` — pass `c.env` without cast. Keep dummy bucket only if `StorageClient.key` is pure path builder; document or extract pure `buildKey(...)`. |
| F10 | P3 | `src/middleware/org-context.ts` | **Odd `requirePlatformRole` rest typing** | `roles.length === 1 && Array.isArray(roles[0]) ? (roles[0] as PlatformRole[]) : roles` — supports both varargs and single array; cast is residual of overloaded call style | Normalize to `...roles: PlatformRole[]` only; callers already use varargs (`requirePlatformRole('super_admin', 'staff')`). |
| F11 | P3 | `src/**/*.test.ts`, `src/test/memory-env.ts` | **Test harness D1 cast noise** | Widespread `env.DB as unknown as D1Database`; `createMemoryEnv` EnvLike ≠ full `Env` (no EMAIL, no DEMO_QUEUE) | Acceptable. Optionally type memory D1 as `D1Database` at factory, and extend EnvLike toward `Env` for fewer casts when testing queues/email. |

### Clean / positive notes (not findings)

| Area | Status |
|------|--------|
| Explicit `any` / `as any` in production `src/` | **None** (comment-only “any” in `services/auth.ts` JSDoc) |
| `@ts-expect-error` / `@ts-ignore` / `@ts-nocheck` | **None** in `src/` |
| AppEnv wiring | `types.ts` → `Hono<AppEnv>`; middleware typed with `MiddlewareHandler<AppEnv>` |
| AppVariables | Covers requestId, subject, authMethod, db, betterAuth, org*, keyOrganizationId |
| String env SSoT | `env.schema.ts` Zod + re-export from `env.ts`; secrets fail-closed in `session-env` (not soft-parse at runtime — intentional) |
| Mutation Zod coverage | Strong on orgs, admin-users, me keys, modules, items, notes, uploads; tasks/comments validate in services via `@kit/*` schemas |
| Auth body | BA handler owns validation for `/api/auth/*` |
| JSON.parse production | Single site (audit meta), try/catch |

## Metrics

- Files reviewed: ~70 production modules under `apps/example-api/src` (routes, middleware, env, services, jobs, index) + wrangler + tsconfig; tests scanned for cast density
- Issues: P0=0 · P1=2 · P2=4 · P3=5
- Notable hotspots:
  - **Env / bindings SSoT drift** (`DEMO_QUEUE` vs `WORKER_BINDINGS`)
  - **Jobs entry + route** (casts + unknown handler env)
  - **Routes non-null `c.get` surface**
  - **Tasks/comments/links** service-side Zod after `as object`
- Production `any` count: **0**
- Production `as unknown as` (non-test): **0** (tests only for D1)
- `JSON.parse` production sites: **1**

## Recommendations

1. **Close Env ↔ wrangler gap (F1, F2):** type `DEMO_QUEUE` on `Env`, export `ExportedHandler<Env>` from `index.ts`, remove jobs route cast. Highest leverage for Workers type completeness.
2. **Replace `!` with guarded accessors (F5):** promote `dbOf` / subject helpers to shared lib; prefer `admin-audit` style fail-closed over non-null asserts.
3. **Normalize client JSON intake (F3):** one `readJsonObject(c)` helper → `Record<string, unknown> | null` without cast; merge server fields only after Zod.
4. **Tighten query/path Zod (F6)** on high-traffic list filters (`q`, `boardKey`) and id params when touched next.
5. **Do not chase test `as unknown as D1Database`** unless refactoring memory D1 to satisfy the real interface — keep as harness debt (F11).
6. **Optional:** generate / sync `worker-configuration.d.ts` via `wrangler types` and intersect with hand-written `Env` so new bindings fail typecheck when missing (aligns with AGENTS “Types CF: wrangler types”).
