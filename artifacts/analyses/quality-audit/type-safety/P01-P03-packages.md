# Type Safety — packages P1–P3

**Date:** 2026-07-12  
**Partition:** P1 `packages/core|types|config` · P2 `packages/auth` · P3 `packages/db|storage|email|mcp`  
**Focus:** `any`, `as` casts, `@ts-ignore` / `@ts-expect-error`, missing return types, Zod gaps, loose generics  
**Excluded:** `node_modules/`, `coverage/`, `packages/ui` (P4)  
**Auditor posture:** read-only on sources; write only this report

## Summary

Across P1–P3 the kit is **small, mostly explicitly typed, and free of `any` / `@ts-ignore`**. Public functions generally declare return types; `strict: true` is on via `@gosilex/config` `tsconfig.base.json`. The type-safety debt is concentrated in a few **structural holes**: (1) error **codes and details** are `string` / `unknown` on the wire despite a closed `ErrorCode` catalog; (2) **zero Zod** in these packages while AGENTS.md claims Zod schemas / env Zod live in `types`/`core`; (3) **`createDb` erases the D1 binding** via `unknown` + `as never`; (4) **session cookie payload** is HMAC-verified then `JSON.parse` + `as SessionPayload` with no runtime shape check. Casts are sparse and mostly Web Crypto / Drizzle friction. Overall health: **good for B0–B3 size**, not yet the “Zod everywhere / typed ErrorCode SSoT” bar the dual-mission kit promises.

## Findings

| ID | Severity | File | Finding | Evidence |
|----|----------|------|---------|----------|
| TS-P01-001 | P1 | `packages/core/src/errors.ts` · `packages/types/src/index.ts` | **`ErrorCode` is not enforced on runtime or wire types.** `AppError.code` / constructor `code` and `ApiErrorBody.error.code` are free `string`. Callers can invent codes; clients cannot narrow; SSoT catalog is decorative at the type level. | `readonly code: string` (`errors.ts:5`); ctor `code: string` (`:9`); `ApiErrorBody.error.code: string` (`types/index.ts:16`); `ErrorCodeName` exists (`types:12`) but is unused on those fields. |
| TS-P01-002 | P1 | `packages/types/**` · `packages/core/**` (partition-wide) | **Zod gap vs AGENTS SSoT.** No `zod` dependency, no schemas, no `z.infer` in core/types/config. AGENTS maps `@gosilex/types` → “Zod schemas + ErrorCode” and `@gosilex/core` → “env Zod”. Partition ships hand-written types only. Runtime validation of error bodies, env, and DTOs is deferred to apps without kit helpers. | `rg zod` under these packages → **0**; `types/package.json` has no `zod`; only `ErrorCode` + `ApiErrorBody` in `types/src/index.ts`. |
| TS-P01-003 | P2 | `packages/core/src/errors.ts` · `packages/types/src/index.ts` | **`details?: unknown` on public error contract.** Intended for fieldErrors; type allows any serializable (or non-serializable) value. No branded `ValidationDetails` / Zod object. Coupled to security concern (wholesale JSON spread) but primarily a **type hole**. | `details?: unknown` on `AppError` (`errors.ts:7`) and `ApiErrorBody` (`types:18`); `toApiErrorBody` spreads `err.details` as-is (`errors.ts:56`). |
| TS-P01-004 | P2 | `packages/config/tsconfig.base.json` | **Strict base is thin: only `"strict": true`.** Missing kit-hardening flags commonly used in high-bar monorepos: `noUncheckedIndexedAccess`, `noImplicitOverride`, `exactOptionalPropertyTypes`, `noFallthroughCasesInSwitch` (partially in strict), `useUnknownInCatchVariables` (in strict). DOM lib forced on pure packages (`"lib": ["ES2022","DOM"]`). | Full `compilerOptions` is ~15 keys (`tsconfig.base.json:2–16`); no `noUncheckedIndexedAccess`. |
| TS-P01-005 | P3 | `packages/core/src/errors.ts:67` | **Redundant / noise cast.** `ErrorCode.INTERNAL_ERROR as ErrorCodeName` — with `as const` object, value is already `ErrorCodeName`. Signals type friction rather than conversion. | ```67:67:packages/core/src/errors.ts``` |
| TS-P01-006 | P3 | `packages/core/src/errors.ts:42–48` | **`toApiErrorBody` return type uses inline structural type, not shared alias; `code` remains untyped as `ErrorCodeName`.** Public helper return is ad-hoc `{ body: ApiErrorBody; status: number }` (OK) but does not narrow `body.error.code` after `instanceof AppError`. | ```42:48:packages/core/src/errors.ts``` |
| TS-P01-007 | P3 | `packages/config/vitest-coverage.mjs` | **Config helper is untyped JS (JSDoc only).** Acceptable for tooling, but thresholds object is free-form JSDoc; no `.ts` + `satisfies` export for consumers. | `makeCoverage(name, thresholds)` L19; JSDoc L10–17 only. |
| TS-P01-008 | P3 | `packages/types/src/index.ts:10` | **`as const` on `ErrorCode` is correct (not a defect).** Listed so metrics “as count” are not inflated as unsafe casts. | `} as const` — closed literal union source for `ErrorCodeName`. |
| TS-P02-001 | P1 | `packages/auth/src/session.ts:69` | **`JSON.parse` → `as SessionPayload` without runtime shape validation.** HMAC proves integrity of bytes, not that fields are `sub`/`email`/`exp` with correct types. Malformed-but-signed historical tokens or secret-compromise forgeries with wrong shape pass the cast; only `payload.exp` number compare is checked (and fails oddly if `exp` missing → `undefined < n` is false → may return bad payload). | ```69:71:packages/auth/src/session.ts``` `as SessionPayload` then `if (payload.exp < …)`. No Zod / type guard. |
| TS-P02-002 | P2 | `packages/auth/src/session.ts:61–64` | **`as ArrayBuffer` on `Uint8Array.buffer.slice(...)`.** Web Crypto `verify` wants `BufferSource`; slice of `ArrayBufferLike` needs cast under current lib types. Local, justified, but masks SharedArrayBuffer / byteOffset edge cases. | ```61:64:packages/auth/src/session.ts``` |
| TS-P02-003 | P2 | `packages/auth/src/keys.ts:61,86` | **`saltBytes as BufferSource` / `salt as BufferSource`.** `Uint8Array` should be `BufferSource`; cast papers over TS DOM lib / Workers typing skew. Prefer typed `BufferSource` params or `new Uint8Array(salt)` without cast if lib allows. | PBKDF2 `deriveBits` calls L60–64, L86–89. |
| TS-P02-004 | P3 | `packages/auth/src/keys.ts:23` | **Non-null assertions on index access.** `ba[i]! ^ bb[i]!` — safe given prior length checks, but `!` is a type-escape; with `noUncheckedIndexedAccess` this would be the proper fix pattern (or loop with local const). | ```23:23:packages/auth/src/keys.ts``` |
| TS-P02-005 | P3 | `packages/auth/src/keys.ts` · `session.ts` | **No branded types for secrets / keys / tokens.** `string` for API keys, session tokens, secrets, hashes. Runtime prefixes (`sk_`, `pbkdf2$`) exist but type system does not distinguish plaintext key vs hash vs session cookie value. | `hashApiKey(plaintext: string)`, `signSession(..., secret: string)`, `parseBearer` → `string \| null`. |
| TS-P02-006 | P3 | `packages/auth/src/session.ts` · `keys.ts` | **Public APIs have good explicit return types** (positive residual note). `signSession`/`verifySession`/`hashPassword`/`sessionCookieHeader` etc. are annotated. Gap is validation of *inputs* and parsed JSON, not missing `: Promise<…>`. | Return types present on exported auth surface. |
| TS-P03-001 | P1 | `packages/db/src/index.ts:4–6` | **`createDb` type-erases D1:** param `d1: unknown`, cast `d1 as never` into `drizzle()`. Generic `TSchema extends Record<string, unknown>` is only half-useful; wrong object (sqlite, mock, undefined) typechecks at call site. Apps re-declare `DrizzleD1Database<typeof schema>` locally because package return type is inferred through `never` hole. | ```4:6:packages/db/src/index.ts``` + consumers `createDb(c.env.DB, schema)` without D1Database constraint; repos use own `type Db = DrizzleD1Database<…>`. |
| TS-P03-002 | P2 | `packages/db/src/index.ts:4` | **Misleading eslint-disable for `no-explicit-any` while using `never`.** Comment admits any-class problem; implementation uses `as never` (stronger erasure). Prefer `D1Database` from `@cloudflare/workers-types` (already in package devDeps) or a minimal `D1Database`-shaped interface. | Comment L4 + `as never` L6; `@cloudflare/workers-types` in `db/package.json` but unused in `src/`. |
| TS-P03-003 | P2 | `packages/storage/src/index.ts:9,40` | **`put` / `putObject` resolve to `Promise<unknown>`.** Callers cannot type-narrow put results; intentional minimal R2 surface, but loses write metadata (etag/size) typing that real R2 returns. | `KitR2Bucket.put(...): Promise<unknown>`; `putObject(...): Promise<unknown>`. |
| TS-P03-004 | P2 | `packages/storage/src/index.ts:4–17` | **Duck-typed `KitR2Bucket` / `KitR2ObjectBody` instead of CF types.** Deliberate (comment: avoid workers-types DOM conflicts). Type-safety tradeoff: structural match accepts incomplete mocks forever; no compile-time check that Workers `R2Bucket` satisfies all needed methods when CF API evolves. | L1–17 type aliases; package does not re-export real `R2Bucket`. |
| TS-P03-005 | P2 | `packages/email/**` · `packages/mcp/**` | **No input schemas (Zod or otherwise) for public builders.** `buildDemoEmailText({ to, subjectId })`, `DemoEmail(props)`, `extractBearerFromEnv(env: Record<string, string \| undefined>)` accept unconstrained strings/records. Email addresses, env key shapes unvalidated at type **and** runtime in package. | `email/src/index.ts:4`; `mcp/src/index.ts:26`; no zod in package.json of either. |
| TS-P03-006 | P3 | `packages/email/src/templates/demo.ts:13` | **Missing explicit return type on exported `DemoEmail`.** Inferred structural type is fine today; breaks more easily if template grows fields. Prefer shared `DemoEmailMessage` type used by `buildDemoEmailText`. | `export function DemoEmail(props: {…}) { return { to, subject, html, text } }` — no `: DemoEmailMessage`. |
| TS-P03-007 | P3 | `packages/mcp/src/index.ts:8,17` | **Allowlist helpers take `string[]` not `McpToolName[]`.** Intentional (validate external registration), but `assertExactKitTools` could return `asserts names is McpToolName[]` for callers after success. Currently throws only — no type predicate. | `assertNoShareTools(names: string[])`; `assertExactKitTools(names: string[])`. |
| TS-P03-008 | P3 | `packages/db/src/index.test.ts:27,34,37` | **Test-only casts** bridging better-sqlite3 → D1-shaped client: `as Record<string, unknown>[]`, `as unknown[][]`, `as Record<string, unknown>`. Acceptable in test doubles; not production. Counted separately in metrics. | Mock `all`/`raw`/`first` in `d1FromSqlite`. |
| TS-P03-009 | P3 | `packages/storage/src/index.test.ts:54` | **Test non-null assertion `obj!` after `expect(obj).not.toBeNull()`.** Vitest does not narrow; pattern is common. Prefer `expect(obj).toBeTruthy()` + local assign or non-null after assert helper. | `await obj!.text()`. |

### Non-findings (healthy)

| Area | Assessment |
|------|------------|
| Explicit `any` in production src | **0** |
| `@ts-ignore` / `@ts-expect-error` / `@ts-nocheck` | **0** in partition |
| Missing return types on most public APIs | **Mostly good** — auth crypto, storage helpers, mcp handlers, core `toApiErrorBody`/`newRequestId` annotated |
| `as const` catalogs | Correct pattern for `ErrorCode` |
| Package size vs god-typing | Thin modules; type debt is quality of contracts, not sprawl |
| Auth password/session crypto surface | Explicit `Promise<string>` / `Promise<boolean>` / `Promise<SessionPayload \| null>` |
| MCP tool name union | `McpToolName = 'ping' \| 'whoami'` + `MCP_TOOL_NAMES` array — good closed set |
| Storage path helper | `joinObjectKey` pure, fully typed strings, throws on traversal |

## Metrics

| Metric | Value |
|--------|------:|
| **Production source files analyzed** | **12** (`core` 2, `types` 1, `auth` 3, `db` 1, `storage` 1, `email` 2, `mcp` 1; + config JSON/mjs tooling) |
| **Test source files scanned** | **7** |
| **Issues total** | **20** |
| **P0** | **0** |
| **P1** | **4** |
| **P2** | **8** |
| **P3** | **8** |
| **`any` (production src)** | **0** |
| **`any` (tests)** | **0** |
| **Unsafe `as` casts (production)** | **6** (`as ErrorCodeName`×1, `as ArrayBuffer`×1, `as SessionPayload`×1, `as BufferSource`×2, `as never`×1) |
| **Safe / catalog `as const`** | **1** (`ErrorCode`) |
| **`as` casts (tests only)** | **3** (`db/index.test.ts`) |
| **`@ts-ignore` / `@ts-expect-error` / `@ts-nocheck`** | **0** |
| **Non-null `!` (production)** | **2** (`keys.ts` index) |
| **Non-null `!` (tests)** | **1** (`storage` test) |
| **Zod schemas in partition** | **0** |
| **`zod` package deps in P1–P3** | **0** |
| **eslint-disable no-explicit-any** | **1** (`db/src/index.ts`, paired with `as never`) |
| **Public APIs with explicit return types** | **~high** (~90%+ of exports); gaps: `DemoEmail`, inferred `createDb` |
| **Loose `unknown` on public contracts** | `AppError.details`, `ApiErrorBody.details`, `createDb(d1)`, `put`/`putObject` results, `toApiErrorBody(err)` input (OK for catch) |

### Counts by package (production)

| Package | `any` | unsafe `as` | `@ts-*` | Notes |
|---------|------:|------------:|--------:|-------|
| core | 0 | 1 | 0 | `as ErrorCodeName` redundant |
| types | 0 | 0* | 0 | *`as const` only |
| config | 0 | 0 | 0 | JSDoc JS helper |
| auth | 0 | 4 | 0 | Session parse + WebCrypto |
| db | 0 | 1 | 0 | `as never` (+ eslint any comment) |
| storage | 0 | 0 | 0 | `unknown` returns instead of casts |
| email | 0 | 0 | 0 | inferred returns |
| mcp | 0 | 0 | 0 | good unions; loose `Record` env |

## Recommendations

1. **P1 — Type the error code SSoT end-to-end (TS-P01-001)**  
   - `AppError` / constructor: `code: ErrorCodeName` (or generic `AppError<C extends string = ErrorCodeName>` if apps need domain codes later).  
   - `ApiErrorBody.error.code`: `ErrorCodeName` or `ErrorCodeName | (string & {})` for extensibility without full open `string`.  
   - Add `AppError.rateLimited()` for parity with `ErrorCode.RATE_LIMITED`.  
   - Drop redundant `as ErrorCodeName` in `toApiErrorBody`.

2. **P1 — Introduce Zod at the types boundary when the next consumer needs validation (TS-P01-002, TS-P02-001, TS-P03-005)**  
   - Minimum kit set: `apiErrorBodySchema`, `sessionPayloadSchema`, optional `env` helpers later.  
   - `verifySession`: `sessionPayloadSchema.safeParse(JSON.parse(...))` instead of `as SessionPayload`.  
   - Align AGENTS.md package map with reality until Zod lands (doc drift → false audit noise).  
   - Do **not** mass-scaffold empty Zod files (A8); add when second call site exists.

3. **P1 — Fix `createDb` typing (TS-P03-001/002)**  
   - Prefer:  
     `export function createDb<TSchema extends Record<string, unknown>>(d1: D1Database, schema: TSchema): DrizzleD1Database<TSchema>`  
   - Or a minimal local interface compatible with Workers `D1Database` if full workers-types conflicts (same pattern as storage).  
   - Remove `as never` and the any eslint-disable.  
   - Apps can stop re-declaring `type Db = DrizzleD1Database<…>` if return type is exported.

4. **P2 — Web Crypto casts (TS-P02-002/003)**  
   - Centralize `toArrayBuffer(u8: Uint8Array): ArrayBuffer` helper with one documented cast.  
   - Target `BufferSource` on public salt params to avoid per-call `as BufferSource`.

5. **P2 — Storage result types (TS-P03-003/004)**  
   - Replace `Promise<unknown>` with `Promise<void>` or a minimal `KitR2PutResult { key: string }` if callers never use R2 put metadata.  
   - Document that `KitR2Bucket` is intentional duck typing; add a compile-time test `type _Assert = R2Bucket extends KitR2Bucket ? true : false` in a workers-typed test file when safe.

6. **P2/P3 — tsconfig hardening (TS-P01-004)**  
   - Add `noUncheckedIndexedAccess` (will force cleanup of `ba[i]!` patterns).  
   - Consider split bases: `tsconfig.base.json` (no DOM) vs `tsconfig.dom.json` / worker for crypto packages.

7. **P3 — Polish**  
   - Export `DemoEmailMessage` and annotate `DemoEmail`.  
   - `assertExactKitTools`: add `asserts names is McpToolName[]` if useful to callers.  
   - Optional brands: `type ApiKeyPlaintext = string & { readonly __brand: 'sk' }` only if it pays off at call sites.

## Residual risks / not covered

- **Apps (`example-api`, `example-web`, `mcp-example`)** may cast `ApiErrorBody` / env / Hono context outside this partition — type holes there are out of scope (P5–P6 type-safety agents).  
- **`packages/ui`** excluded (P4).  
- **Runtime security impact** of loose `details` / AppError message passthrough is covered in Security P1; this report only notes the type-level open surface.  
- **Drizzle query result inference** depends on app schemas — package correctly does not own schemas; residual risk is only the factory entrypoint.  
- **Better Auth migration** will change session types; current HMAC `SessionPayload` cast debt may be deleted rather than fixed — still worth a safeParse while interim auth ships.  
- **No full `tsc --strict` differential** run under alternate flags (`exactOptionalPropertyTypes`) — residual unknown friction.  
- **Dependency types** (`drizzle-orm`, workers-types) quality not audited beyond call-site usage.  
- **Config package** has almost no TypeScript surface; type-safety score is N/A for runtime.

---

**Bottom line:** No P0 type-safety defects. Four P1 items (open `ErrorCode`/`string` wire, zero Zod vs SSoT, session `as SessionPayload`, `createDb`/`as never`) should be fixed or consciously deferred with AGENTS doc updates before the kit is treated as the extractable Full-CF template bar. Cast/`any`/`ts-ignore` hygiene is already strong.
