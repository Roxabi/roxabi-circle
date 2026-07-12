# Axial Drift — Semantic (ADR review)

**Date:** 2026-07-12  
**Scope:** Full kit tree (`packages/**`, `apps/example-*`, `apps/mcp-example`)  
**ADR:** [`docs/architecture/adr/0001-primary-axis-packages-compose-apps.md`](../../../../docs/architecture/adr/0001-primary-axis-packages-compose-apps.md) (`axial: true`)  
**Primary axis:** platform packages (`@gosilex/*`) compose deployable apps  
**Review mode:** semantic / wrong-axis duplication (axial-adr-review style)  
**Write scope:** `artifacts/analyses/quality-audit/axial-drift/` only

---

## Summary

Singleton axial ADR is present and parseable. The monorepo **currently aligns** with *packages compose apps*: auth crypto/session, `AppError`/`toApiErrorBody`/`newRequestId`, D1 `createDb`, R2 helpers, MCP allowlist, and email **templates** are imported from packages; apps own domain wiring (routes → services → repos), demo schema, and entrypoints.

**No confirmed three-strikes** (same platform helper reimplemented in ≥3 sibling apps) and **no local `class AppError`** under apps. Product-share markers under `packages/` are limited to intentional ban/guard strings in `@gosilex/mcp` (not product implementations).

Residual risk is **pre-product N×M**: several cross-cutting Worker/SPA platform concerns still live only under `apps/example-api` / `apps/example-web`. When `share-api` / `share-web` appear, copy-paste is the default path unless those helpers are promoted along the primary axis **before** or at the second call site (ADR: ≥2 call sites or ADR).

---

## Findings

| ID | Severity | File | Finding | Evidence | Class |
|----|----------|------|---------|----------|-------|
| AX-SEM-001 | P2 | `apps/example-api/src/middleware/{error-handler,request-id,security-headers}.ts` | Platform Hono middleware (error envelope logging, request-id, security headers) is app-local composition of `@gosilex/core`, not a reusable package export. Second API app will reimplement the same stack. | `createApp()` wires `requestIdMiddleware`, `securityHeaders`, `onError` only in example-api; **0** Hono imports under `packages/**`. Sibling count for this concern: **1/3** apps (not three-strikes yet). | `target-axis-trap` (probable) |
| AX-SEM-002 | P2 | `apps/example-api/src/lib/session-env.ts` | Env-aware session secret, CORS allowlist, Secure-cookie policy are platform ops helpers living in the deployable, not `@gosilex/auth` / `@gosilex/core`. | `getSecret`, `corsAllowlist`, `useSecureCookie` defined only under example-api; used from `app.ts` + auth routes. Will be the first file copied into `share-api`. | `target-axis-trap` (probable) |
| AX-SEM-003 | P2 | `apps/example-web/src/lib/api.ts` | Client `ApiError` + `apiFetch` (credentials include, `ApiErrorBody` parse) is the FE half of the central error contract but is not shared kit code. Second SPA (`share-web`) will fork. | `export class ApiError` only in example-web; uses `@gosilex/types` `ApiErrorBody` but not a `@gosilex/*` client helper. AGENTS.md anticipates shared FE `ApiError` / `apiErrorToMessage`. Sibling count: **1** SPA. | `target-axis-trap` (probable) |
| AX-SEM-004 | P2 | `apps/example-api/src/services/email.ts` vs `packages/email/**` | Email **transport** (SMTP connect + log fallback) is implemented in the app service; `@gosilex/email` only exposes template builders. Platform transport should grow on the package axis (AGENTS H2). | `buildDemoEmailText` imported from package; ~70 LOC SMTP/log path only in app service. Second product needing email copies transport, not templates. | `target-axis-trap` (probable) |
| AX-SEM-005 | P3 | `apps/example-api/src/seed/demo-data.ts` · `apps/example-web/src/lib/auth.ts` | `KitRole = 'admin' \| 'user'` mirrored FE/BE without a shared types export. Acceptable contract mirror for one product pair; becomes noise if more apps invent role unions. | Two independent `export type KitRole` declarations. | `target-axis-trap` (weak / type-level) |
| AX-SEM-006 | P3 | `packages/ui/src/test/capture-errors.ts` · `apps/example-web/src/test/browser-errors.ts` | Related Base UI / runtime contract assert helpers split across package tests and app tests (similar regex filters, not identical APIs). | Parallel “assert no Base UI contract errors” patterns; not production path. | parallel-path (test-only) |
| AX-SEM-OK-01 | praise | `apps/example-api/src/services/auth.ts` | Auth domain service **composes** `@gosilex/auth` primitives (`hashApiKey`, `verifyPassword`, `signSession`, `parseBearer`, cookie helpers) rather than reimplementing crypto. | Imports from `@gosilex/auth` only; app owns DB lookup + dual-path `resolveAuth`. | aligned |
| AX-SEM-OK-02 | praise | apps + `packages/core` | No local `class AppError` under apps; all throws use `@gosilex/core` factories + `toApiErrorBody` in middleware. | Grep `AppError` → core definition + app imports only. | aligned |
| AX-SEM-OK-03 | praise | `apps/example-api/src/services/notes.ts` | Storage composed via `@gosilex/storage` (`joinObjectKey`, `putObject`, `getObject`, `deleteObject`); demo prefix `demo/`, not product `share/`. | R2 prefix `joinObjectKey('demo', …)`; package test asserts keys do not start with `share/`. | aligned |
| AX-SEM-OK-04 | praise | `apps/mcp-example/src/index.ts` | MCP example registers tools through `@gosilex/mcp` handlers + allowlist asserts; no forked tool framework. | `assertExactKitTools`, `handlePing`, `handleWhoami`, `extractBearerFromEnv` from package. | aligned |
| AX-SEM-OK-05 | praise | packages dependency graph | Packages do not import apps; package deps are `@gosilex/types` / `@gosilex/core` / `@gosilex/auth` only. Schema lives in app (`apps/example-api/src/db/schema.ts`) per ADR “product/demo schemas in apps”. | No `apps/` imports under `packages/`. | aligned |
| AX-SEM-OK-06 | praise | product ban surface | No product-share implementation under packages; banlist + MCP `assertNoShareTools` encode the anti-pattern as guards. | Banlist patterns in `scripts/check-banned-strings.sh`; MCP rejects `share_*` / `artifact` tool names. | aligned |

### Conventional-comment detail (axial-adr-review shape)

```
suggestion(non-blocking): platform Hono middleware still only under example-api
  apps/example-api/src/middleware/error-handler.ts:7
  apps/example-api/src/middleware/request-id.ts:10
  apps/example-api/src/middleware/security-headers.ts:3
  -- axial-adr-review
  Root cause: PRIMARY.axis = packages compose apps, but cross-cutting Worker
    middleware was left as app scaffolding until a second API app exists
  Class: target-axis-trap
  Raw callsites: [
    {file: "apps/example-api/src/middleware/error-handler.ts", line: 7},
    {file: "apps/example-api/src/middleware/request-id.ts", line: 10},
    {file: "apps/example-api/src/middleware/security-headers.ts", line: 3},
    {file: "apps/example-api/src/app.ts", line: 21}
  ]
  Solutions:
    1. Promote thin Hono adapters to @gosilex/core (or @gosilex/hono) when
       share-api is scaffolded — at latest before second copy lands
    2. Keep app-local until second call site; document as expected debt in ADR
  Confidence: 80%
```

```
suggestion(non-blocking): FE ApiError client not on primary axis yet
  apps/example-web/src/lib/api.ts:5
  -- axial-adr-review
  Root cause: shared ErrorCode/ApiErrorBody live in packages; browser client
    class still app-owned → second SPA duplicates credentials+parse path
  Class: target-axis-trap
  Raw callsites: [{file: "apps/example-web/src/lib/api.ts", line: 5}]
  Solutions:
    1. Extract apiFetch/ApiError to @gosilex/core or small @gosilex/http-client
       when share-web is created
    2. Leave until second SPA; accept expected debt (ADR Negative)
  Confidence: 75%
```

```
praise: auth and errors compose packages along PRIMARY.axis
  apps/example-api/src/services/auth.ts:1
  packages/core/src/errors.ts:4
  -- axial-adr-review
  Root cause: N/A — composition works
  Class: target-axis-trap
  Raw callsites: []
  Solutions: keep requiring package imports in code-review checklists
  Confidence: 95%
```

---

## Metrics (N×M traps, probable vs confirmed)

| Metric | Value |
|--------|-------|
| Axial ADRs with `axial: true` | **1** (singleton OK) |
| Confirmed three-strikes (≥3 sibling apps same concern) | **0** |
| Confirmed local `class AppError` under apps | **0** |
| Confirmed product markers as implementations under `packages/` | **0** (guards only) |
| Probable N×M traps (1–2 call sites of platform concern left in apps) | **4** (AX-SEM-001…004) |
| Weak / type-level mirrors | **2** (AX-SEM-005, 006) |
| Aligned composition praises | **6** |
| Deployable apps today | 3 (`example-api`, `example-web`, `mcp-example`) — too few siblings for three-strikes on most concerns |
| Package surfaces composed by example-api | auth, core, db, email (templates), storage, types |
| Package surfaces composed by example-web | types, ui |
| Package surfaces composed by mcp-example | mcp (→ auth parseBearer) |
| Layer secondary axis (routes→services→repos) | OK — routes call services; repos not imported from routes |
| Hono present in packages | **no** (by design today) |

### Anti-pattern scan (ADR signals)

| ADR anti-pattern | Result |
|------------------|--------|
| Product markers under `packages/` (`share/{slug}`, product `private_key`, `share_publish`, Shlink) | **Clean** (MCP/tests ban guards only) |
| Local `class AppError` under `apps/` | **Clean** (client `ApiError` is different class — FE mirror, flagged as probable package candidate) |
| Same platform helper in ≥3 apps | **Clean** (insufficient siblings + no copies yet) |

---

## Recommendations

1. **Before scaffolding `apps/share-api`:** extract or consciously accept (ADR amend) the example-api platform surface that is not domain:
   - request-id + onError + security-headers middleware  
   - `session-env` secret/CORS/cookie policy  
   Prefer `@gosilex/core` (+ thin Hono adapters) or a small `@gosilex/worker-kit` so the second app is **compose**, not **copy**.

2. **Before scaffolding `apps/share-web`:** promote `apiFetch` / `ApiError` (and optional `apiErrorToMessage`) to a kit package so both SPAs share credentials + error-body parsing. Keep route/feature code in apps.

3. **Email:** move SMTP/log/resend transport behind `@gosilex/email` (AGENTS H2) when any second send path appears; leave templates as they are.

4. **Keep the good discipline:**
   - No product schemas in `@gosilex/db`  
   - Auth crypto only via `@gosilex/auth`  
   - `AppError` only via `@gosilex/core`  
   - Banlist + extract dry-run as hard gates  

5. **Three-strikes process:** when a second product app lands, run a focused sibling-grep on middleware, env helpers, and FE api client; if count ≥ 3, promote immediately (do not wait for a fourth).

6. **Do not over-package demo RBAC** (`KitRole`, seed users) — domain of the example app; share product will have its own roles. Only extract if two products truly share the same role model.

---

## Residual risks

| Risk | Why it remains |
|------|----------------|
| Product apps not present yet | Three-strikes rule cannot fire; probable traps are **forward-looking** only |
| Interim HMAC session (ADR-0002) | Swap to Better Auth is package-axis work; risk is package rewrite, not app forks — if apps reimplement session after the swap, that **would** be drift |
| Email transport in Workers (`connect`) | App-local transport may diverge per deployable environment handling |
| Secondary layer axis process-only | ADR Expected debt: routes→services→repos is process-enforced; no structural lint for “routes must not import repos” observed in this review |
| Over-extraction pressure | Promoting every middleware before a second call site fights ADR “package when ≥2 call sites or ADR” — prefer **document + promote at share scaffold**, not empty package skeletons |

---

## Method notes

- Read ADR-0001 + axial-decomposition reference (three-strikes, `target-axis-trap`).
- Grep: `AppError`, auth primitives, storage/db/email/mcp usage, product ban tokens, package↔app import direction, Hono in packages.
- Did **not** mutate application code; findings only under `artifacts/analyses/quality-audit/axial-drift/`.
- Did **not** echo raw banlist regex tokens as “hit counts” beyond symptom descriptions (sibling counts and paths).
