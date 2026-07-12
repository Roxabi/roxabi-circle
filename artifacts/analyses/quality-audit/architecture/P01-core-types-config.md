# Architecture — P1 core/types/config

**Date:** 2026-07-12  
**Partition:** `packages/core/**`, `packages/types/**`, `packages/config/**`  
**Scope:** package boundaries, public API, coupling/cycles, layer purity, god modules, export surface  
**Excluded:** `node_modules/`, `coverage/`

## Summary

P1 is a **healthy leaf layer** of the Chemin A kit: acyclic dependency graph (`types` ← `core`; `config` tooling-only), no imports of apps, no Cloudflare bindings or product-domain strings, and no god modules. Public surface is intentionally thin (`ErrorCode` / `ApiErrorBody` / `AppError` / `toApiErrorBody` / `newRequestId`), which matches ADR-0001 axial rules and A8 (no empty theater). Gaps are mostly **export-boundary hygiene** (`@gosilex/config` not fully package-exported; relative path coupling for Vitest coverage) and **type-level API looseness** (`code: string` instead of `ErrorCodeName`; incomplete factory set vs codes). AGENTS.md still lists Result / env Zod / Biome presets that are not implemented—acceptable under A8 if treated as roadmap, but docs and package map drift.

## Findings

| ID | Severity | File | Finding | Evidence |
|----|----------|------|---------|----------|
| ARCH-P1-001 | P2 | `packages/config/package.json` · consumers via `../config/vitest-coverage.mjs` | **Config public API incomplete; Vitest helper is filesystem-coupled, not package-exported.** | `package.json` `exports` only exposes `./tsconfig.base.json`. `vitest-coverage.mjs` is imported by relative path from every package/app vitest config (e.g. `packages/core/vitest.config.ts:2` `import { makeCoverage } from '../config/vitest-coverage.mjs'`; same pattern under auth/db/email/mcp/storage/types/ui and `apps/example-*`, `mcp-example`). Extract/move of `packages/config` or packaging as real npm exports would break consumers without a path rewrite. `@gosilex/config` name is underused vs relative paths. |
| ARCH-P1-002 | P2 | `packages/core/src/errors.ts` · `packages/types/src/index.ts` | **Weak typed contract on error codes in public API.** | `AppError` field `readonly code: string` (`errors.ts:5`); constructor `code: string` (`:9`). `ApiErrorBody.error.code` is `string` (`types/src/index.ts:16`), not `ErrorCodeName`. `RATE_LIMITED` exists in `ErrorCode` (`types:9`) but no `AppError.rateLimited()` factory; only unauthorized/forbidden/notFound/validation/conflict/internal. Callers can invent arbitrary codes while still using `AppError`, diluting the kit SSoT. |
| ARCH-P1-003 | P3 | `packages/core/src/index.ts` · `apps/example-web/src/lib/api.ts` | **Dual entry for shared error types (core re-export + types direct).** | Core barrel re-exports `ErrorCode`, `ErrorCodeName`, `ApiErrorBody` from `@gosilex/types` (`core/src/index.ts:1–2`). FE uses `@gosilex/types` for `ApiErrorBody` only (`example-web/src/lib/api.ts:1`); API uses `@gosilex/core` for runtime. Acceptable split (types-only client deps) but two “official” paths need a documented convention: *types for contracts, core for runtime*. |
| ARCH-P1-004 | P3 | `packages/core/**` · `packages/types/**` · AGENTS.md §H | **Doc/SSoT surface vs implementation drift (not empty-package theater).** | AGENTS claims `@gosilex/core` = AppError, Result, IDs, requestId, env Zod; `@gosilex/types` = Zod schemas + ErrorCode; `@gosilex/config` = tsconfig, Biome, Vitest presets. Actual: core = errors + `newRequestId` only; types = `ErrorCode` + `ApiErrorBody` only (no Zod); config = `tsconfig.base.json` + unexported `makeCoverage` (no Biome preset—root `biome.json` only). README package map is closer to reality. Under A8 this is **good restraint**, but AGENTS overclaims create audit/plan noise. |
| ARCH-P1-005 | P3 | `packages/config/tsconfig.base.json` | **Shared TS base pulls DOM lib into pure packages.** | `"lib": ["ES2022", "DOM"]` (`tsconfig.base.json:6`) applied by core/types via extends. Enables `crypto.randomUUID` typing without `@types/node` or Workers types, but blurs “edge/node-pure” package purity; non-browser packages get DOM ambient globals. Prefer `ES2022` + explicit `WebCrypto`/`@cloudflare/workers-types` or a split base (`tsconfig.base` / `tsconfig.dom` / `tsconfig.worker`). |
| ARCH-P1-006 | P3 | `packages/core/src/errors.ts` | **`AppError` omits `cause` from AGENTS error sketch.** | AGENTS sketches `AppError { code, status, message?, details?, cause? }`. Implementation has `code`, `status`, `message` (via `Error`), `details?` only—no `cause` chaining (`errors.ts:4–15`). Limits structured internal logging of wrapped failures without stuffing into `details`. |
| ARCH-P1-007 | P3 | `packages/core/package.json` · `packages/types/package.json` | **Source-path exports only (`./src/index.ts`); no emit/build boundary.** | `"exports"."."` points at TypeScript sources with `"build": "echo ok"`. Fine for Bun monorepo + typecheck, but extract-as-publishable packages would need real `dist` or consumers must transpile. Residual packaging risk, not a runtime bug today. |

### Non-findings (healthy)

| Area | Assessment |
|------|------------|
| Circular deps | **None.** Graph: `types` (leaf) ← `core`; `config` has no workspace deps. |
| Layer purity | **core/types** have no `apps/*` imports, no D1/R2/Hono, no CF binding types. Runtime is pure TS + Web Crypto (`newRequestId`). |
| God modules | **None.** `errors.ts` ~77 LOC; `types/src/index.ts` ~22 LOC; config files are small single-purpose. |
| Domain leakage | **None.** `ErrorCode` comment and test assert kit-generic codes only (`!c.includes('SHARE')`). |
| Axial (ADR-0001) | **Aligned.** Platform errors live in packages; apps compose them (`example-api` middleware/services/routes import `AppError` / `newRequestId` / `toApiErrorBody`). No local `class AppError` in apps. |
| Export minimalism | **Good.** Single `.` entry per runtime package; no deep `package.json` export explosion. |

## Metrics

| Metric | Value |
|--------|------:|
| Files analyzed (source + package config in P1) | **12** |
| Source modules (excl. tests) | **5** (`core/errors.ts`, `core/index.ts`, `types/index.ts`, `config/tsconfig.base.json`, `config/vitest-coverage.mjs`) |
| Test modules | **2** |
| Package manifests / tool configs | **5** (`package.json` ×3, `tsconfig.json` ×2 core/types, + vitest configs) |
| Issues total | **7** |
| P0 | **0** |
| P1 | **0** |
| P2 | **2** |
| P3 | **5** |
| Dependency edges inside P1 | **1** (`core` → `types`) |
| Cycles | **0** |
| LOC (core+types runtime src, approx.) | **~100** |
| God files (>400 LOC) | **0** |
| CF / app coupling in P1 | **0** |

**Files inventory:**

```text
packages/core/
  package.json, tsconfig.json, vitest.config.ts
  src/index.ts, src/errors.ts, src/errors.test.ts
packages/types/
  package.json, tsconfig.json, vitest.config.ts
  src/index.ts, src/index.test.ts
packages/config/
  package.json, tsconfig.base.json, vitest-coverage.mjs
```

## Recommendations

1. **Harden `@gosilex/config` as a real package boundary (ARCH-P1-001)**  
   - Add exports e.g. `"./vitest-coverage": "./vitest-coverage.mjs"` (and keep `./tsconfig.base.json`).  
   - Migrate vitest configs to `import { makeCoverage } from '@gosilex/config/vitest-coverage'`.  
   - Optionally document that Biome stays root-level until a second preset is needed (A8).

2. **Tighten error code types (ARCH-P1-002)**  
   - Prefer `code: ErrorCodeName` on `AppError` (or generic `AppError` with branded code for domain extension later).  
   - Narrow `ApiErrorBody.error.code` to `ErrorCodeName | (string & {})` if product apps need extension without breaking kit codes.  
   - Add `AppError.rateLimited(message?, details?)` → 429 for parity with `ErrorCode.RATE_LIMITED`.

3. **Document dual import convention (ARCH-P1-003)**  
   - README / package map: **runtime** from `@gosilex/core`; **wire types only** from `@gosilex/types` (SPA-safe, no Error subclass). Keep core re-exports for backend convenience.

4. **Align AGENTS package map with shipped surface (ARCH-P1-004)**  
   - Mark Result / env Zod / Biome-in-config as **planned (P1)** or remove until ≥2 call sites. README already matches implementation—use it as SSoT for “what exists”.

5. **Optional purity polish**  
   - Split TS bases or drop `DOM` from pure packages (ARCH-P1-005).  
   - Add optional `cause?: unknown` on `AppError` for wrap-and-log (ARCH-P1-006).  
   - When extract packaging matters: real `build` + `dist` exports (ARCH-P1-007).

6. **Adjacent graph hygiene (out of partition, note only)**  
   - `packages/auth/package.json` declares `"@gosilex/core": "workspace:*"` but `packages/auth/src/**` never imports core—dead edge. Drop dep or start throwing `AppError` from auth helpers.

## Residual risks

| Risk | Notes |
|------|--------|
| `instanceof AppError` across bundles | Works under Bun workspace source resolution; if packages later dual-publish or multi-copy, `toApiErrorBody` may treat real `AppError` as internal. Prefer `Symbol` brand or `err?.name === 'AppError' && 'code' in err` for cross-bundle safety later. |
| Untrusted `details` on wire | Architecture allows `details?: unknown` through to JSON body. Not a P1 layer violation; security/error-handling domains should ensure apps never put stacks/secrets in `details`. |
| Incoming `x-request-id` trust | `newRequestId` is clean; app middleware may accept client-supplied IDs—outside P1. |
| Future Result/env Zod placement | If added, keep in `core`/`types` without pulling Zod into SPA-only paths unless needed; avoid reverse deps from types → core. |
| Auth unused `core` dependency | False coupling signal for architecture graphs; not a cycle but pollutes package DAG. |
| Coverage floors vs factories | Several `AppError.*` statics untested by default path still OK for architecture; incomplete factory coverage is test-quality residual. |

**Overall architecture score for P1:** strong foundation, low coupling, correct directionality; fix config export surface and code typing before surface growth.
