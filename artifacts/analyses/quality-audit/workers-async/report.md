# Workers / Async — example-api · CF packages · mcp-example

**Date:** 2026-08-12  
**Scope:** `apps/example-api/**`, `packages/{storage,email,db,auth,mcp}/**` (CF-touching), `apps/mcp-example/**`  
**Method:** entrypoint + binding inventory · floating-promise / `waitUntil` hunt · module globals · rate-limit races · queue/cron · DO · package I/O surfaces

## Summary

Workers/async posture for the kit dogfood is **healthy for current surface area**. The Hono `fetch` path awaits transactional side effects (email, queue produce, D1 rate limits); dual-auth and BA email hooks do not fire-and-forget. Rate limiting was correctly moved off isolate memory to **D1 fixed windows** with concurrent coverage and fail-closed errors — the classic in-memory Map race is **not** present. There are **no Durable Objects**, no Workflows runtime, and **no `waitUntil` usage** (acceptable today because nothing is backgrounded after the response).

Residual risk is almost entirely **scaffold / product-copy footguns**: queue consumer **always acks** (and the demo handler never throws), `DEMO_QUEUE` is **outside** `Env` / `WORKER_BINDINGS` (cast at produce path), and queue/scheduled handlers take **`unknown` env/ctx** with no typed pattern for real D1/cron work. Per-request `createBetterAuth` is the correct CF bindings pattern but is the main request-path CPU cost. `mcp-example` is **stdio FastMCP**, not a Worker — low Workers risk.

## Findings

| ID | Severity | File | Finding | Evidence | Recommendation |
|----|----------|------|---------|----------|----------------|
| F1 | P2 | `apps/example-api/src/index.ts` · `jobs/demo-handler.ts` | **Queue consumer always acks; no retry path** | `queue` loop: `handleDemoJob` → `msg.ack()`; on catch logs then **still** `msg.ack()` with comment “product may retry”. `handleDemoJob` documents “never throw” and always returns `{ ok: true }`. Unknown types are ignored + acked. | Keep always-ack for log-only demo **or** return retryable vs permanent from handler and call `msg.retry()` for transient failures. Product job templates must not copy “ack everything”. |
| F2 | P2 | `env.ts` · `env.schema.ts` · `routes/jobs.ts` · `wrangler.toml` | **`DEMO_QUEUE` binding outside Env SSoT** | Wrangler declares `[[queues.producers]] binding = "DEMO_QUEUE"` (root + production). `WORKER_BINDINGS = ['DB','BUCKET','EMAIL']`; `Env` has no queue type. Produce path: `(c.env as { DEMO_QUEUE?: QueueLike }).DEMO_QUEUE` with soft no-op when absent. | Add `DEMO_QUEUE?: { send(body: unknown): Promise<void> }` to `Env`; append `'DEMO_QUEUE'` to `WORKER_BINDINGS`; drop cast in `jobs.ts`. Align env:check inventory. |
| F3 | P2 | `apps/example-api/src/index.ts` | **queue/scheduled use `unknown` env/ctx; ignore ExecutionContext** | `queue(batch, _env: unknown, _ctx: unknown)` · `scheduled(controller, _env: unknown, _ctx: unknown)`. Cron only logs via `handleScheduledTick`. No `ExportedHandler<Env>`, no path to D1/R2/email on async entry. | Type default export as `ExportedHandler<Env>` (or explicit signatures). When real cron/queue work lands, inject `createDb(env.DB, schema)` and use `ctx.waitUntil` only for **non-critical** post-ack work — never for authority/grant decisions. |
| F4 | P3 | `middleware/better-auth.ts` · `lib/better-auth.ts` | **Full Better Auth graph built every request** | `withBetterAuth` → `createBetterAuth(c.env, baseURL)` every hit: drizzle adapter, org + magicLink plugins, email ports, cookie options. Correct for bindings (ADR-0002 “1 instance / request”) but CPU-heavy on edge. | Keep per-request unless profiling shows pain. If caching, key by secret+baseURL **inside isolate only**, never across tenants with different secrets; document that secret rotation needs isolate recycle. |
| F5 | P3 | `lib/rate-limit.ts` | **Lazy GC delete on every rate-limit check** | Before atomic insert, best-effort `delete` of expired windows for the same key (errors swallowed). Extra D1 write on BA sensitive auth, mint, invite, demo email, admin provision. | Accept for kit scale; or GC via scheduled handler / probabilistic sample. Do not move counters back to process memory. |
| F6 | P3 | `apps/mcp-example/src/index.ts` | **CLI `server.start` not awaited** | `if (import.meta.main) { server.start({ transportType: 'stdio' }) }` — not a Worker export. If FastMCP returns a Promise, unhandled rejection is possible on CLI. | `void server.start(...)` with `.catch` log, or `await` in top-level async main. No CF `fetch`/`queue` surface today. |
| F7 | P3 | `routes/auth.ts` · `index.ts` | **Stale comments / dead error path** | Auth rate-limit comment still says “demo in-memory” while implementation is D1. Queue `try/catch` around non-throwing `handleDemoJob` is effectively dead for handler throws. | Update comment to “D1 fixed-window”. Either let handler throw for poison policy or simplify queue loop to ack after result only. |

## Hunt results (clean / non-findings)

| Hunt | Result | Evidence |
|------|--------|----------|
| Floating promises on `fetch` | **Clean** | Email: `await port.send` / `emailPort.send` (invites, admin welcome, BA magic-link/reset, demo). Queue produce: `await queue.send`. No `void promise` / fire-and-forget on request path. |
| Missing `waitUntil` | **N/A (by design)** | Zero `waitUntil` / `executionCtx` in repo. Side effects are **in-request** (fail-closed email → cancel invite / delete provisioned user). Do not introduce detached email without durability. |
| Module-level mutable globals | **Clean for hot state** | Module: `const app = createApp()`, BA access-control roles, `rootLog`, rate/invite limit constants, kit module sets. **No** shared `Map` rate buckets. Test R2 `Map` only in `memory-env.ts`. |
| Blocking sync CPU on request path | **Low risk** | Kit `hashPassword` / `verifyPassword` use **async** `crypto.subtle` PBKDF2 (`packages/auth/src/keys.ts`); runtime BA password uses `better-auth/crypto` (async). No `Atomics`, no sync scrypt loops on Worker path. SMTP `for (;;)` is **Node-only** (`@kit/email/server`). |
| Queue / scheduled correctness | **Demo-OK · product incomplete** | Wrangler producers/consumers + hourly cron wired; handlers log-only. Always-ack (F1) + untyped env (F3). |
| Durable Object misuse | **None** | No `DurableObject` / DO bindings in apps or packages. |
| Env binding assumptions | **Partial** | `DB`/`BUCKET` required on `Env`; `EMAIL?` optional + factory fail-closed for `cf`. `DEMO_QUEUE` cast (F2). `PRESIGN_MODE=s3` fail-closed (not implemented). |
| In-memory rate-limit races | **Fixed** | D1 `INSERT … ON CONFLICT DO UPDATE … RETURNING count`; concurrent test (`rate-limit.test.ts` 20× race). Fail-closed on D1 error → 500. Floor window ~2× boundary documented. |
| `@kit/storage` | **Clean** | Async put/get/delete/presign; path assert; no global store outside mock signer optional `Map`. |
| `@kit/email` Worker path | **Clean** | `createEmailPort` → log/cf/resend only; SMTP forced off Workers. `sendCf` awaits binding. |
| `@kit/db` | **Clean** | Thin `createDb` + `mapInChunks` sequential awaits (D1 bind limits). |
| `@kit/auth` dual-path | **Clean** | `resolveDualAuth` fully awaited; SHA-256 key verify + constant-time hex compare. |
| `@kit/mcp` / mcp-example | **Stdio, not Worker** | `handleWhoami` uses `AbortController` + timeout; SSRF host allowlist. No CF export. |
| Flows/tasks dogfood | **Pure CPU, in-process** | `flows-dogfood` / pure packages — no queue/Workflow runner yet (ADR-0005 children). |

## Metrics

- Files reviewed: ~45 (example-api entry, middleware, jobs, rate-limit, env/wrangler, auth/email/uploads services; packages storage/email/db/auth/mcp; mcp-example; jobs + rate-limit tests)
- Issues: P0=0 · P1=0 · P2=3 · P3=4
- Notable hotspots:
  - `apps/example-api/src/index.ts` (fetch + queue + scheduled spine)
  - `apps/example-api/src/lib/rate-limit.ts` (durable limit)
  - `apps/example-api/src/lib/better-auth.ts` + `middleware/better-auth.ts` (per-request BA)
  - `apps/example-api/src/routes/jobs.ts` + `env.schema.ts` (queue binding SSoT)
  - `packages/email` / `packages/storage` (edge-safe I/O)

## Recommendations

1. **P2 kit pattern (F1):** Document queue ack policy next to `handleDemoJob` (demo = always ack; product = typed result → ack \| retry). Prefer structured `JobHandleResult` + `retry()` for transient errors when real work lands.
2. **P2 Env SSoT (F2–F3):** Type `DEMO_QUEUE` on `Env`, list it in `WORKER_BINDINGS`, export `ExportedHandler<Env>`. Drop jobs cast. Same bar as type-safety audit F1/F2.
3. **P3 cost (F4–F5):** Profile BA factory under load before caching; keep rate-limit counters on D1; optional cron GC of `rate_limit_buckets`.
4. **Do not regress:** no in-memory rate Maps; no fire-and-forget email on invite/provision; no DO “session stickiness” as tenant store.
5. **When flows runner ships:** durable work on **CF Workflows / Queues** (ADR-0005), not multi-day `waitUntil` pipelines — AGENTS non-goal already.

## Positive controls (keep)

| Control | Why it matters on Workers |
|---------|---------------------------|
| Request-scoped `withDb` + `withBetterAuth` | Bindings never leak across isolates via module cache of wrong env |
| D1 rate limit fail-closed | Isolate crash / D1 blip does not open auth floodgates |
| Awaited transactional email + compensate (invite cancel / user cascade) | No “202 OK, email never sent” without durable outbox |
| Soft queue produce when binding absent | Local/CI without queues still auth-gated |
| Storage/email duck types | Packages stay free of workers-types DOM conflicts while remaining async-only |
