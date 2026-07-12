# Code Smells — P1

**Date:** 2026-07-12  
**Partition:** `packages/core/**`, `packages/types/**`, `packages/config/**`  
**Focus:** long functions, god files, DRY, dead code, magic numbers, naming  
**Excluded:** `node_modules/`, `coverage/` (metrics only)

## Summary

P1 is **smell-light and intentionally small**: no god files, no long functions, no deep nesting, and no product-domain leakage. Runtime surface is essentially one module (`core/src/errors.ts` ~77 LOC) plus a tiny types catalog (`types/src/index.ts` ~22 LOC) and a config helper (`config/vitest-coverage.mjs` ~40 LOC). Real smells are **catalog incompleteness** (`ErrorCode.RATE_LIMITED` without factory/status mapping), **scattered HTTP status literals**, **loose `code: string` typing**, and a few **dead/redundant surface bits** (unused rate-limit code, pointless cast). None of these block extractability; they matter as the kit error surface grows.

## Findings

| ID | Severity | File | Finding | Evidence |
|----|----------|------|---------|----------|
| SMELL-P1-001 | P2 | `packages/types/src/index.ts:9` · `packages/core/src/errors.ts:17–39` | **Orphan catalog entry / incomplete ErrorCode ↔ AppError parity.** | `ErrorCode.RATE_LIMITED` is defined and exported but has **zero** call sites in the monorepo and **no** `AppError.rateLimited()` factory. Factories cover only 6 of 7 codes (`unauthorized`/`forbidden`/`notFound`/`validation`/`conflict`/`internal`). Callers who need 429 must invent status+code manually via the public constructor, defeating the catalog SSoT. |
| SMELL-P1-002 | P2 | `packages/core/src/errors.ts:9,18–38,64` | **Magic HTTP status numbers without a single code→status map.** | Literals `401`, `403`, `404`, `400`, `409`, `500` (and default `500` on constructor + unknown branch) are hand-wired in each factory. No `STATUS_BY_CODE` / shared constant. DRY risk when adding `RATE_LIMITED` (429) or domain codes later: status and factory can drift independently. Acceptable at 6 methods; becomes real debt at growth. |
| SMELL-P1-003 | P3 | `packages/core/src/errors.ts:5,9` · `packages/types/src/index.ts:16` | **Loose public types: `code: string` instead of `ErrorCodeName`.** | `AppError.readonly code: string`, constructor `code: string`, and `ApiErrorBody.error.code: string` allow arbitrary free-form codes while `ErrorCode` / `ErrorCodeName` exist as the intended SSoT. Naming of the catalog promises a closed set; the API does not enforce it. |
| SMELL-P1-004 | P3 | `packages/core/src/errors.ts:9–15` | **Public constructor bypasses named factories.** | Anyone can `new AppError('WHATEVER', '…', 418)`. Factories are the idiomatic path but nothing encourages or types them as the only entry. Mild encapsulation smell (not a bug today). |
| SMELL-P1-005 | P3 | `packages/core/src/errors.ts:67` | **Dead / redundant cast.** | `ErrorCode.INTERNAL_ERROR as ErrorCodeName` — `ErrorCode` is `as const`, so values are already `ErrorCodeName`. Cast is noise and signals type friction rather than a real conversion. |
| SMELL-P1-006 | P3 | `packages/core/src/errors.ts:75–76` | **Magic request-id shape (`req_` + length 16).** | `return \`req_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}\``. Prefix and slice length are unexplained literals; consumers (tests, middleware) hardcode `/^req_/` expectations. Prefer named constants (`REQUEST_ID_PREFIX`, `REQUEST_ID_HEX_LEN`) if format is part of the kit contract. |
| SMELL-P1-007 | P3 | `packages/core/src/errors.ts:17–39` | **Repetitive static factories (micro-DRY).** | Six nearly identical one-liners (`return new AppError(ErrorCode.*, message, STATUS, details?)`). Fine at current size; a table-driven helper would remove SMELL-P1-001/002 together when the next code is added. **Not** worth a refactor for its own sake. |
| SMELL-P1-008 | P3 | `packages/core/src/index.ts:1–2` · `packages/types/src/index.ts` | **Dual export path for the same symbols.** | Core barrel re-exports `ErrorCode`, `ErrorCodeName`, `ApiErrorBody` from `@gosilex/types`. FE correctly imports types-only from `@gosilex/types`; BE can pull everything from `@gosilex/core`. Acceptable split, but two “canonical” import paths for the same names is mild API surface noise—document, don’t duplicate further. |
| SMELL-P1-009 | P3 | `packages/types/src/index.ts:2–10` | **Self-keyed string enum object (style, not defect).** | `UNAUTHORIZED: 'UNAUTHORIZED'` pattern is standard TS const catalog; not smelly enough to change. Note only: if codes ever need rename-without-wire-break, values and keys diverge poorly—unlikely for SCREAMING_SNAKE wire codes. |
| SMELL-P1-010 | P3 | `packages/config/vitest-coverage.mjs:28–37` | **Verbose optional threshold passthrough.** | Spread rebuilds `{ statements, branches, functions, lines }` from the same keys instead of `thresholds: { ...thresholds }` (or filtering undefined). Clarity over DRY; trivial. |

### Non-findings (healthy)

| Area | Assessment |
|------|------------|
| God files | **None.** Largest runtime file `errors.ts` ≈ **77 LOC** (threshold ~400). |
| Long functions | **None.** Longest: `toApiErrorBody` ≈ **31 LOC** (threshold ~80). Factories ≤ 3 LOC. |
| Deep nesting | **None.** Max depth ~2 (`if instanceof` / optional spread). |
| Dead modules / unused files | **None** in P1 source. `RATE_LIMITED` is dead *symbol*, not dead file. |
| Naming vs AGENTS | **Aligned.** `AppError`, `ErrorCode` SCREAMING_SNAKE, `toApiErrorBody`, `newRequestId`, `makeCoverage` are clear and consistent. |
| Domain leakage | **None.** Types test asserts no `SHARE` in codes. |
| Config helper quality | `makeCoverage` is small, pure, single-purpose; exclude globs are sensible. |
| Test file smells | Tests are short and intent-clear; incomplete factory coverage is a **test-quality** concern more than a code smell in production sources. |

## Metrics

| Metric | Value |
|--------|------:|
| Files analyzed (P1 source + package/tool config) | **12** |
| Runtime / source modules (excl. tests) | **5** |
| Test modules | **2** |
| LOC runtime (`core/src` + `types/src` excl. tests, approx.) | **~100** |
| LOC `config/vitest-coverage.mjs` | **~40** |
| Max file LOC (runtime) | **~77** (`errors.ts`) |
| Max function LOC | **~31** (`toApiErrorBody`) |
| God files (>400 LOC) | **0** |
| Functions >80 LOC | **0** |
| Issues total | **10** |
| P0 | **0** |
| P1 | **0** |
| P2 | **2** |
| P3 | **8** |
| Dead / orphan public symbols | **1** (`ErrorCode.RATE_LIMITED` unused monorepo-wide) |
| Magic number clusters | **2** (HTTP statuses; request-id shape) |
| Duplicated logic clusters (meaningful DRY) | **1** (factory↔status wiring) |
| Nested depth max | **2** |

**Inventory:**

```text
packages/core/
  package.json, tsconfig.json, vitest.config.ts
  src/index.ts          (~3 LOC barrel)
  src/errors.ts         (~77 LOC)
  src/errors.test.ts
packages/types/
  package.json, tsconfig.json, vitest.config.ts
  src/index.ts          (~22 LOC)
  src/index.test.ts
packages/config/
  package.json          (exports: tsconfig.base only)
  tsconfig.base.json
  vitest-coverage.mjs   (~40 LOC)
```

**Coverage signal (context only):** `packages/core` functions ≈ **50–55%** — several factories unexercised by unit tests; not a production smell, but leaves factory parity regressions unguarded.

## Recommendations

1. **Close catalog parity (SMELL-P1-001 + SMELL-P1-002)**  
   - Add `AppError.rateLimited(message = 'Rate limited', details?)` → `ErrorCode.RATE_LIMITED`, status **429**.  
   - Prefer a single map, e.g. `const HTTP_STATUS: Record<ErrorCodeName, number>`, used by factories (and optionally constructor default). Removes magic-status scatter and orphan-code risk.

2. **Tighten types without blocking domain extension (SMELL-P1-003/004)**  
   - Type `AppError.code` as `ErrorCodeName` for kit errors, **or** generic `AppError<C extends string = ErrorCodeName>`.  
   - Narrow `ApiErrorBody.error.code` to `ErrorCodeName | (string & {})` if apps need product codes later.  
   - Optional: deprecate free-form constructor usage in docs; keep constructor for map-driven factory internals.

3. **Drop dead cast; name request-id contract (SMELL-P1-005/006)**  
   - Remove `as ErrorCodeName`.  
   - Export or local-const `REQUEST_ID_PREFIX = 'req_'` and hex length if format is stable kit API (middleware/tests already depend on `^req_`).

4. **Do not over-refactor factories (SMELL-P1-007)**  
   - Only table-drive when adding the next code or status mapping. Current repetition is readable and A8-friendly.

5. **Document dual import (SMELL-P1-008)**  
   - Convention: **runtime** `@gosilex/core`; **wire types only** `@gosilex/types`. Keep re-exports; avoid a third path.

6. **Leave `RATE_LIMITED` only if rate-limit package is imminent**  
   - If not: remove from `ErrorCode` until first real call site (A8 — no empty theater). Prefer add-with-factory in one PR with `@gosilex/rate-limit` or middleware demo.

7. **Config polish optional (SMELL-P1-010)**  
   - `thresholds: thresholds` (or filter undefined) is enough; export helper via package `exports` is architecture (see ARCH-P1-001), not a smell priority.

## Residual risks

| Risk | Notes |
|------|--------|
| Status/code drift under growth | Without a map, next engineer hardcodes 429 wrong or invents `TOO_MANY_REQUESTS`. |
| Free-form `code: string` on wire | Clients cannot exhaustively switch on kit codes; i18n mapping harder. Type-safety domain may escalate. |
| `details?: unknown` passthrough | Not a smell of structure; security/error-handling must ensure no stack/secrets in `details`. |
| `instanceof AppError` across bundles | Smell-adjacent identity risk if dual-package copies appear post-extract; brand symbol later if needed. |
| AGENTS claims Result / env Zod / Biome-in-config | Not dead code in tree — **missing** vs docs. Avoid scaffolding empty stubs; update AGENTS instead. |
| Factory unit-test gaps | `unauthorized`/`forbidden`/`notFound`/`conflict`/`internal` untested in isolation — own domain (test quality). |
| Threshold magic in vitest configs | Coverage floors live outside `makeCoverage` defaults (call-site numbers). Intentional per-package; not P1 smell debt. |

**Overall code-smell score for P1:** high quality / low debt. Treat P2 items as **cheap hardening before the error surface grows**; no emergency refactors.
