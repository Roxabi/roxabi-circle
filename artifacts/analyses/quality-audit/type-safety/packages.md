# Type Safety — packages/**

**Date:** 2026-08-12  
**Scope:** `packages/**` (`@kit/*`) · exclude `node_modules`  
**Method:** ripgrep pattern hunt + targeted reads of boundary modules

## Summary

`packages/**` is in **good** type-safety shape for a kit monorepo: TypeScript `strict: true` via `@kit/config`, **zero** production `as any` / `@ts-expect-error` / `@ts-ignore` / `Record<string, any>`, and incubating kernels (`flows`, `tasks`, `comments`) parse wire input with Zod at package ports. The main residual risks are intentional FastMCP duck-typing (`any` on `ToolDef.execute` / `ToolServer.addTool`), **missing `tool.input.safeParse` in the catalogue execute wrapper** (budget + optional output only), and the classic unsound `apiFetch<T>` cast on JSON. Env bindings are deliberately **duck-typed** (not generated `Env`) so packages stay free of workers-types DOM fights — acceptable kit design, not a hidden `any` dump.

## Findings

| ID | Severity | File | Finding | Evidence | Recommendation |
|----|----------|------|---------|----------|----------------|
| F1 | P1 | `packages/mcp/src/catalogue.ts` | Zod **input** not enforced inside kit `registerAll` execute path | Wrapper only runs `checkInputBudget(args)` then `tool.execute(args, ctx)`. `tool.input` is passed as FastMCP `parameters` but **never** `safeParse`’d in the kit. `execute` is typed `(input: any, …)`. Output *is* optional-safeParsed when present (L106–112). Tests call the wrapped handler with raw `{}` / nested objects without schema gate. | Before `tool.execute`, `const parsed = tool.input.safeParse(args)`; fail → `PublicToolError('INVALID_ARGUMENTS')`. Type execute as `(input: unknown, ctx) => …` or generic over `z.infer`. Keep FastMCP `parameters` for host UX. |
| F2 | P2 | `packages/mcp/src/catalogue.ts` | Explicit `any` at FastMCP duck boundary (tagged DEBT) | L28–29 `execute: (input: any, …)` — `DEBT:fastmcp-zod-boundary`; L38–39 `addTool: (tool: any) => void` — `DEBT:fastmcp-duck-type`. Only production `any` hits in all packages. | After F1, drop `input: any`. Narrow `addTool` to a minimal structural type (`{ name, description, parameters, execute }`) if FastMCP assignability allows; else keep one DEBT tag with issue link. |
| F3 | P2 | `packages/api-client/src/index.ts` | Unsound success / error JSON casts at HTTP boundary | L57 `JSON.parse(text) as unknown` (good) → L65 `data as ApiErrorBody` (shape check only `body?.error?.code`) → L76 `return data as T` (generic lie). No Zod / `parseOrThrow` for success or full error envelope. | Optional `schema?: ParseableSchema<T>` on `apiFetch` / client options; or export thin helpers that compose `@kit/core` `parseOrThrow`. At minimum validate error body with a shared `apiErrorBodySchema` in `@kit/types`. |
| F4 | P2 | `packages/db/src/index.ts` | Weak D1 binding: `unknown` + `as never` into drizzle | L4–6: stale `eslint-disable … no-explicit-any` but no `any`; `createDb(d1: unknown, schema)` → `drizzle(d1 as never, { schema })`. Bypasses all D1 typing at package entry. | Prefer `d1: D1Database` from `@cloudflare/workers-types` (already devDep) **or** a minimal `KitD1Database` duck type (mirror `KitR2Bucket` / `SendEmailBinding`). Remove obsolete eslint-disable. |
| F5 | P3 | `packages/mcp/src/schemas.ts` | Double cast to feed `z.enum` | L4: `WHOAMI_STATUS as unknown as [WhoamiStatus, …WhoamiStatus[]]` — only **prod** `as unknown as` in packages (3 more in tests). | Zod 4 tuple helper / `z.enum(WHOAMI_STATUS)` if supported; or `as [WhoamiStatus, ...WhoamiStatus[]]` single cast after `satisfies readonly [… ]`. |
| F6 | P3 | `packages/email/src/server.ts` | Non-null assertions on stream handles | L121 `reader!`, L129 `writer!` inside nested `expect`/`write` after assignment; L39 `lines[i]!` in reverse loop. Safe at runtime if connect succeeded, but control-flow not proven to TS. | Capture `const r = reader; const w = writer` after assignment and throw if null; use local non-optional vars. |
| F7 | P3 | `packages/auth/src/keys.ts` | Non-null index asserts in constant-time loop | L23: `ba[i]! ^ bb[i]!` after length equality check — noUncheckedIndexedAccess style. | Local `const x = ba[i]; const y = bb[i]; if (x === undefined \|\| y === undefined) return false` or disable only that line with rationale. Low risk. |
| F8 | P3 | `packages/i18n/src/index.ts` | `Object.keys` widened to locale union | L18: `Object.keys(opts.catalogs) as L[]` — classic TS limitation; wrong keys at runtime still type-check if caller lies on `LocaleCatalogs`. | Accept (engine is generic) or require `locales: readonly L[]` explicit in opts. |

### Hunt results (clean / non-findings)

| Pattern | Prod hits | Notes |
|---------|-----------|--------|
| `as any` | **0** | — |
| `: any` / param `any` | **2** | Both MCP catalogue (F2) |
| `as unknown as` | **1** prod + **3** tests | schemas + test mocks |
| `@ts-expect-error` / `@ts-ignore` / `@ts-nocheck` | **0** | — |
| `Record<string, any>` | **0** | — |
| Non-null `!` (TS asserts) | **4** prod sites | email×3, keys×1 (+ tests) |
| `as never` | **1** | db `createDb` (F4) |
| biome/eslint ignore for `any` | **2** biome + **1** stale eslint | catalogue DEBT; db obsolete |

### Boundary strengths (positive)

| Area | Pattern |
|------|---------|
| `@kit/flows` | `checkPlan` / `parseCapabilityGrant` / `loadPlanFromYaml` → Zod + fail-closed YAML; `parseRunnerView` required on read (comment contract) |
| `@kit/tasks` / `@kit/comments` | `parse*` helpers = `safeParse` exports |
| `@kit/core` | `parseOrThrow` shared Zod→AppError; `ParseableSchema<T>` version-agnostic |
| `@kit/auth` | Dual-auth ports typed; `BetterAuthLike` minimal surface; no session `any` |
| `@kit/storage` / `@kit/email` | Duck bindings `KitR2Bucket`, `SendEmailBinding` — explicit, not `any` |
| `@kit/mcp` whoami | `meResponseSchema.safeParse` on upstream JSON |
| Config | `packages/config/tsconfig.base.json` → `"strict": true` |

### Weak Env bindings

Packages **do not** ship generated `Cloudflare.Env`. Bindings are app-injected duck types:

- R2 → `KitR2Bucket`
- Email → `SendEmailBinding`
- Auth → `BetterAuthLike` + `SessionPort`
- MCP env strings → `Record<string, string | undefined>` in `extractBearerFromEnv` / `ToolContext.env`

This is intentional kit purity (avoid workers-types DOM conflicts noted in storage header). **Not** a finding unless apps skip wiring types — track under apps audit. D1 is the outlier (`unknown`/`never`, F4).

## Metrics

| Metric | Count |
|--------|------:|
| Packages under scope | 14 (`api-client`, `auth`, `comments`, `config`, `core`, `db`, `email`, `flows`, `i18n`, `mcp`, `storage`, `tasks`, `types`, `ui`) |
| Source files reviewed (pattern scan + spot-read) | ~130+ `*.{ts,tsx}` under `packages/*/src` (+ package configs) |
| Explicit prod `any` | 2 |
| `as any` | 0 |
| `as unknown as` (prod) | 1 |
| `@ts-expect-error` / `@ts-ignore` | 0 |
| `Record<string, any>` | 0 |
| Prod non-null `!` | 4 sites / 2 files |
| Issues | **P0=0 · P1=1 · P2=3 · P3=4** |
| Notable hotspots | `packages/mcp/src/catalogue.ts`, `packages/api-client/src/index.ts`, `packages/db/src/index.ts` |

## Recommendations

1. **P1 — MCP input parse in catalogue** (`F1`): `tool.input.safeParse` inside `registerAll` before `execute`; treat FastMCP `parameters` as complementary, not sole enforcement when the kit wrapper is the registration path.
2. **P2 — Retire `any` on ToolDef** (`F2`): after F1, type execute input as `unknown` (or inferred); keep one documented duck type for `addTool` only if required.
3. **P2 — api-client envelope** (`F3`): add optional response schema hook and/or Zod for `ApiErrorBody`; stop bare `as T` when schema provided.
4. **P2 — createDb typing** (`F4`): replace `unknown`/`as never` with `D1Database` or `KitD1Database`; delete stale eslint-disable.
5. **P3 hygiene** (`F5`–`F8`): drop double cast on whoami enum; local non-optional SMTP readers; optional i18n locales list.
6. **Keep doing:** Zod ports on flows/tasks/comments; duck-typed CF surfaces without ambient `any`; no `@ts-ignore` culture.
