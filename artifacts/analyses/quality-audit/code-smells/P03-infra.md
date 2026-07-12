# Code Smells — P3

**Date:** 2026-07-12  
**Partition:** `packages/db/**`, `packages/storage/**`, `packages/email/**`, `packages/mcp/**`  
**Focus:** long functions, god files, DRY, dead code, magic numbers, naming, pass-through wrappers, over-constrained APIs  
**Excluded:** `node_modules/`, coverage artifacts (metrics only)  
**Related (other domains, not re-scored here):** ARCH-P03-*, SEC-P03-*

## Summary

P3 packages are **deliberately tiny and smell-light on classic metrics**: no god files, no long functions, no deep nesting. Combined runtime surface is roughly **~150 LOC** across four packages. The real smell pattern is **kit surface incompleteness + N×M duplication at the boundary**: (1) D1 sqlite test doubles triplicated, (2) R2 helpers that are pure pass-throughs, (3) email type/export theater without a send path, (4) MCP allowlist/assert that hard-locks the kit tool set and embeds product banlist vocabulary. None of this blocks extract today; it becomes costly the moment a second API or product MCP lands. Overall: **high readability, medium structural DRY debt, low classic “god class” risk**.

## Findings

| ID | Severity | File | Finding | Evidence |
|----|----------|------|---------|----------|
| SMELL-P3-001 | P1 | `packages/db/src/index.test.ts:13–49` · `apps/example-api/src/test/memory-env.ts:18–67` · `apps/example-api/scripts/seed-local.ts` (D1 shim) | **N×M DRY: D1-shaped better-sqlite3 adapter copy-pasted ≥3 times.** | Near-identical `prepare` / `bind` / `run` / `all` / `raw` / `first` / `batch` / `exec` shims in package unit test, app integration harness, and seed CLI. Not exported from `@gosilex/db` (or `db/test`). Three-strikes already met inside this monorepo; second API will make four. Classic promote-or-die smell. |
| SMELL-P3-002 | P2 | `packages/storage/src/index.ts:35–50` | **Pass-through wrappers: `putObject` / `getObject` / `deleteObject` add no behavior beyond one-line delegates.** | Each is `return bucket.*(key, …)` only. All real value is in `joinObjectKey` + `KitR*` types. Call sites could use the bucket directly with the same safety gap (keys not forced through join). API noise for little encapsulation. |
| SMELL-P3-003 | P2 | `packages/email/src/index.ts:21` | **Dead / orphan public type: `EmailTransport` exported with zero runtime use in package or typed consumers.** | `export type EmailTransport = 'smtp' \| 'log' \| 'resend'` — no function takes it, no send path, app hardcodes transport strings (`'smtp'` / `'log'` in `services/email.ts`). Catalog-without-implementation smell (same class as unused `RATE_LIMITED` in P1). |
| SMELL-P3-004 | P2 | `packages/email/src/index.ts:3–17` | **`buildDemoEmailText` is a pure field-passthrough of `DemoEmail`.** | Calls `DemoEmail(params)` then rebuilds `{ to, subject, text, html }` field-by-field — zero transform. Barrel also re-exports `DemoEmail`. Two public entry points for one object shape; one is enough. |
| SMELL-P3-005 | P1 | `packages/mcp/src/index.ts:3–24` · `apps/mcp-example/src/index.ts:20–28` | **Over-constrained kit API: `assertExactKitTools` + hard-coded `MCP_TOOL_NAMES`.** | Package requires exact `['ping','whoami']` (order-insensitive). App duplicates list as `REGISTERED_TOOL_NAMES`, calls assert, **then** re-compares to `MCP_TOOL_NAMES` with JSON.stringify — triple allowlist. Product MCP cannot reuse package guards without forking or polluting kit names. Prefer “no product tools” only + app-local allowlist. |
| SMELL-P3-006 | P2 | `packages/mcp/src/index.ts:8–14` | **Product vocabulary embedded in kit purity guard.** | `n.startsWith('share_') \|\| n.includes('artifact')`. Intentional banlist-in-code, but couples kit source to product lexicon. Extract purity SSoT should be scripts/banlist, not runtime string checks in `@gosilex/mcp`. |
| SMELL-P3-007 | P2 | `packages/db/src/index.ts:1–7` | **Factory is a one-liner with double type escape hatch.** | `d1: unknown` + `drizzle(d1 as never, …)` + eslint-disable for `any` on a 3-line module. Entire package public surface is this cast. Acceptable bootstrap, but the “package” is a naming shell around drizzle with no migrate/helper/export beyond the cast — thin-package smell vs AGENTS “Drizzle D1 + migrate”. |
| SMELL-P3-008 | P2 | `packages/mcp/src/index.ts:26–31` · tests only cover `API_KEY` | **Fragile dual env semantics in `extractBearerFromEnv`.** | `AUTHORIZATION` path always wraps ``Bearer ${env.AUTHORIZATION}`` then `parseBearer`. If env already holds `Bearer sk_…` → double prefix → null. `API_KEY` requires `sk_` prefix; AUTHORIZATION path does not. Undocumented, untested AUTHORIZATION branch; callers will disagree on env shape. |
| SMELL-P3-009 | P3 | `packages/mcp/src/index.ts:34–49` | **Unnecessary `async` on pure sync handlers.** | `handlePing` / `handleWhoami` never `await`; they return plain objects. Async forces `Promise` surface and `await` at every call site (mcp-example) for zero concurrency benefit. Prefer sync or explicit `Promise.resolve` only if FastMCP requires async execute. |
| SMELL-P3-010 | P3 | `packages/mcp/src/index.ts:48–49` | **Magic number: key prefix length `8`.** | `apiKey.slice(0, 8)` — unexplained; tests hardcode `sk_abcde` for `sk_abcdef012345`. Prefer named `KEY_PREFIX_LEN` (or drop prefix entirely — security residual). |
| SMELL-P3-011 | P3 | `packages/storage/src/index.ts:27` · `packages/mcp/src/index.ts:11,22` | **Bare `Error` throws; inconsistent with kit `AppError` SSoT.** | Storage/mcp do not depend on `@gosilex/core`. Fine for pure helpers today; inconsistent if throws cross HTTP/MCP wire later. Smell is **style fragmentation**, not a bug. |
| SMELL-P3-012 | P3 | `packages/email/src/index.ts:3` · `templates/demo.ts:1–3` | **Comment over-promises “React Email-style” without React Email.** | Hand-rolled HTML string + `escapeHtml`. Comment says swap to `@react-email/components` later — honest deferral, but public docs/comments read as if the template system is already React Email. |
| SMELL-P3-013 | P3 | `packages/email/src/templates/demo.ts:5–10` | **Incomplete `escapeHtml` (micro).** | Escapes `& < > "`; not `'` (`&#39;`). Fine while `subjectId` only lands in text content / double-quoted attrs unused. Future attribute use would be incomplete. |
| SMELL-P3-014 | P3 | `packages/storage/src/index.ts:14–17` | **Narrow body type vs package name “storage”.** | `KitR2ObjectBody` exposes only `text()`. Binary/stream/arrayBuffer helpers absent. Not god-file debt — **API undergrowth** that will push apps to raw R2 (layer smell later). |
| SMELL-P3-015 | P3 | `packages/db/src/index.test.ts:6–11` | **Test schema re-implements app demo table shape.** | Local `sqliteTable('demo_notes', …)` mirrors app schema fields for isolation (good), but names `demo_notes` / column set will drift from `apps/example-api` migrations without a shared fixture. Acceptable for package purity; note as coupling smell if columns diverge silently. |

### Non-findings (healthy)

| Area | Assessment |
|------|------------|
| God files | **None.** Largest runtime modules: `storage/src/index.ts` ≈ **50 LOC**, `mcp/src/index.ts` ≈ **50 LOC**, `email` split ~20 + ~21, `db` ≈ **7 LOC**. Threshold ~400. |
| Long functions | **None.** Longest runtime: `joinObjectKey` ≈ **14 LOC**, `handleWhoami` ≈ **8 LOC**. Threshold ~80. |
| Deep nesting | **None.** Max depth ~2 (`for` + `if` in join / assert). |
| Dead modules / unused packages | **None.** All four packages have ≥1 app call site (`createDb`, storage in notes service, `buildDemoEmailText`, mcp-example). Not empty zoo. |
| Domain leakage in db/storage/email | **Clean.** Storage tests assert keys never `share/`; db schema-agnostic; email is kit demo only. Product strings only in mcp ban guard (SMELL-P3-006). |
| Naming vs AGENTS | **Mostly aligned.** `createDb`, `joinObjectKey`, `MCP_TOOL_NAMES`, `buildDemoEmailText` are clear. `KitR2*` prefix documents intentional minimal surface. |
| Test file bloat | Tests are short and intent-clear; harness duplication is production-adjacent smell (SMELL-P3-001), not god tests. |
| Circular deps | **None.** `db` → drizzle only; `storage`/`email` zero workspace deps; `mcp` → `@gosilex/auth` only. |

## Metrics

| Metric | Value |
|--------|------:|
| Files analyzed (P3 source + package config + tests) | **16** |
| Runtime / source modules (excl. tests) | **5** (`db/index`, `storage/index`, `email/index`, `email/templates/demo`, `mcp/index`) |
| Test modules | **4** |
| LOC runtime (approx., excl. tests) | **~130** |
| LOC tests (approx., excl. harness bulk counted once) | **~190** (db test harness alone ~40) |
| Max file LOC (runtime) | **~50** (`storage` / `mcp` index) |
| Max function LOC (runtime) | **~14** (`joinObjectKey`) |
| God files (>400 LOC) | **0** |
| Functions >80 LOC | **0** |
| Issues total | **15** |
| P0 | **0** |
| P1 | **2** |
| P2 | **6** |
| P3 | **7** |
| Dead / orphan public symbols | **1** (`EmailTransport` unused) |
| Pass-through / zero-logic public APIs | **4** (`put`/`get`/`delete` + `buildDemoEmailText` field mirror) |
| Duplicated logic clusters (meaningful DRY) | **2** (D1 sqlite adapter ×3; MCP allowlist ×3) |
| Magic number clusters | **1** (`slice(0, 8)` key prefix) |
| Nested depth max | **2** |

**Inventory:**

```text
packages/db/
  package.json, tsconfig.json, vitest.config.ts
  src/index.ts          (~7 LOC)   createDb only
  src/index.test.ts     (~70 LOC)  incl. d1FromSqlite harness

packages/storage/
  package.json, tsconfig.json, vitest.config.ts
  src/index.ts          (~50 LOC)  join + put/get/delete + Kit types
  src/index.test.ts     (~60 LOC)  memoryBucket + join/traversal

packages/email/
  package.json, tsconfig.json, vitest.config.ts
  src/index.ts          (~21 LOC)  buildDemoEmailText + EmailTransport
  src/templates/demo.ts (~21 LOC)  DemoEmail + escapeHtml
  src/index.test.ts     (~11 LOC)  happy path only

packages/mcp/
  package.json, tsconfig.json, vitest.config.ts
  src/index.ts          (~50 LOC)  allowlist, assert, bearer env, handlers
  src/index.test.ts     (~42 LOC)
```

**Coverage floors (context only):** storage/db/mcp floors 50–70%; email floors lower (50/40). Not a production smell; floors match intentionally thin packages.

## Recommendations

1. **P1 — Promote one D1 test double (SMELL-P3-001)**  
   - Export `createMemoryD1()` / `d1FromSqlite` from `@gosilex/db/test` (or `tooling/d1-memory`).  
   - Point package test, `memory-env.ts`, and `seed-local.ts` at it.  
   - Optional: document that migrate/seed remain per-app (align AGENTS with reality) so the package is not expected to own Wrangler migrate.

2. **P1 — Soften MCP kit allowlist (SMELL-P3-005 + 006)**  
   - Keep `assertNoShareTools` **or** drop runtime product lexicon and rely on banlist CI.  
   - Replace `assertExactKitTools` with app-local exactness (`mcp-example` only).  
   - Export `ping`/`whoami` handlers + optional `KIT_DEMO_TOOLS` constant without failing product servers that import handlers only.  
   - Remove the redundant app JSON.stringify equality after assert (one SSoT).

3. **P2 — Either grow or thin storage (SMELL-P3-002 + 014)**  
   - **Thin path:** export only `joinObjectKey` + types; drop pass-through put/get/delete (apps use binding).  
   - **Grow path:** key-must-be-joined helper, `arrayBuffer()` / stream, list/head, later presign — so the package justifies its name vs AGENTS “R2 put/get/presign”.  
   - Prefer one clear story; current middle ground is the smell.

4. **P2 — Email package: implement or stop advertising (SMELL-P3-003/004/012)**  
   - Either move SMTP/log send behind `@gosilex/email` with `EmailTransport` + env contract, **or** remove `EmailTransport` and collapse `buildDemoEmailText` → single `DemoEmail` export until send lands.  
   - Avoid type-only theater.

5. **P2 — `createDb` typing (SMELL-P3-007)**  
   - Export a minimal `D1Like` interface matching what drizzle needs, or re-export drizzle’s expected type with a single documented cast site.  
   - Drop eslint-disable noise if `D1Database` from workers-types can live as peer type-only.

6. **P2 — Document or fix `extractBearerFromEnv` (SMELL-P3-008)**  
   - Accept either raw token or full `Bearer …` without double-prefix.  
   - Align `sk_` requirement on both paths. Add tests for AUTHORIZATION branch.

7. **P3 polish (optional)**  
   - Sync handlers if FastMCP allows (SMELL-P3-009).  
   - Name `KEY_PREFIX_LEN` or remove prefix (SMELL-P3-010).  
   - Complete `escapeHtml` with `'` if templates grow (SMELL-P3-013).  
   - Bare `Error` → stay as-is until HTTP boundary needs `AppError` (SMELL-P3-011).

## Residual risks

| Risk | Notes |
|------|--------|
| Second Worker app copies D1 harness again | SMELL-P3-001 becomes P0 extract pain; promote helper before `share-api`. |
| Product MCP cannot use kit package | SMELL-P3-005 forces fork or kit pollution; axial-hostile if ignored. |
| Pass-through storage bypasses join discipline | Smell + security (SEC-P03-002); package does not make safe path the only path. |
| Email send stays in app forever | N×M SMTP dialogue; AGENTS H2 unmet until package owns transport. |
| Comment/docs drift vs implementation | “migrate”, “presign”, “React Email”, `EmailTransport` over-claim readiness. |
| Classic god-file risk in this partition | **Negligible** at current size; do not invent structure for empty packages. |

**Overall code-smell score for P3:** high local quality / **medium kit-boundary DRY debt**. No emergency refactors for LOC/nesting. Prioritize **one shared D1 test double** and **MCP allowlist decoupling** before product apps land; treat email/storage pass-throughs as “grow or delete” decisions, not cosmetic renames.
