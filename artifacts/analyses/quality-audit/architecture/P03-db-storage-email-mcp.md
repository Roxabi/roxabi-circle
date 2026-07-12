# Architecture — P3 db/storage/email/mcp

**Date:** 2026-07-12  
**Partition:** `packages/db/**`, `packages/storage/**`, `packages/email/**`, `packages/mcp/**`  
**Domain:** Architecture (generic kit vs product leakage, dependency direction, abstraction quality, multi-app readiness, empty stubs)  
**Refs:** ADR-0001 (`docs/architecture/adr/0001-primary-axis-packages-compose-apps.md`), AGENTS.md stack §A/H/E/H2, goal `001-chemin-a-boilerplate-goal.md`

## Summary

P3 platform packages are **axial-clean**: zero product-share domain schema/storage paths, no package→app imports, and each package has ≥1 real example call site (rule “2 call sites **or** ADR / demo proof”). Abstractions are intentionally **thin** for kit exit (B0–B5): `@gosilex/db` is a one-line Drizzle D1 factory with schemas owned by apps (correct per A20/ADR); `@gosilex/storage` adds real value mainly via `joinObjectKey` traversal rejection, while put/get/delete are pass-throughs; `@gosilex/email` and `@gosilex/mcp` prove composition but **under-deliver** the AGENTS promises (transport abstraction / FastMCP conventions). Multi-app readiness is **good for db+storage keying**, **weak for email send and product MCP toolsets**. No P0 architecture defects; main risks are N×M transport fork, exact-tool lock-in on MCP, and missing migrate/presign surface vs package map claims.

## Findings

| ID | Severity | File | Finding | Evidence |
|----|----------|------|---------|----------|
| ARCH-P03-001 | — | packages/{db,storage,email,mcp} | **Positive:** dependency direction clean; packages ↛ apps; no cycles in P3 DAG | `db` depends only on `drizzle-orm`; `storage`/`email` have **no** workspace deps; `mcp` → `@gosilex/auth` → `@gosilex/core`. Grep: no imports of `apps/*` from packages. ADR-0001 primary axis held. |
| ARCH-P03-002 | — | packages/db/src/index.ts; apps/example-api/src/db/schema.ts | **Positive:** product/demo schemas stay in apps; package is schema-agnostic factory | `createDb(d1, schema)` + comment “Schemas live in apps”. App owns `demoNotes` / `apiKeys` / `demoUsers`. Migrations live under `apps/example-api/migrations/`. Aligns ADR-0001 “Product schemas … not `@gosilex/db`”. |
| ARCH-P03-003 | — | packages/storage; apps/example-api/src/services/notes.ts | **Positive:** R2 keys use kit `demo/` prefix; no `share/` product path in package API | `joinObjectKey('demo', id, 'attachment.txt')` in notes service; storage tests assert `key.startsWith('share/') === false`. Banlist also fails `joinObjectKey('share'…)` under packages/apps. |
| ARCH-P03-004 | P2 | packages/db/src/index.ts:1–7 | **Thin DB abstraction:** factory only; AGENTS/package map claim “Drizzle D1 + migrate” but migrate helpers are absent from package | Entire public surface is `createDb` + `drizzle(d1 as never, { schema })`. Root `db:migrate` scripts proxy to **example-api** only (`package.json` `db:migrate`). Second app must reinvent migrate/seed glue. |
| ARCH-P03-005 | P2 | packages/db/src/index.ts:4–6 | **Typing escape hatch:** `d1: unknown` + `as never` weakens multi-app type safety at the package boundary | `export function createDb<TSchema …>(d1: unknown, schema: TSchema)` then `drizzle(d1 as never, …)`. Call sites cast Worker `D1Database` implicitly; no exported `D1Like` / return type alias for apps to reuse. |
| ARCH-P03-006 | P2 | packages/db/src/index.test.ts:13–49; apps/example-api/src/test/memory-env.ts:18–67 | **N×M test harness:** D1-shaped better-sqlite3 adapter duplicated (package test + app integration) | Near-identical `prepare/bind/run/all/raw/first` shims. Not exported from `@gosilex/db` for multi-app tests. Three-strikes / promote-package signal if a second API app copies `memory-env` again. |
| ARCH-P03-007 | P2 | packages/storage/src/index.ts:35–50 | **Pass-through R2 helpers** add little beyond types; value concentrated in `joinObjectKey` | `putObject`/`getObject`/`deleteObject` are single-line `bucket.*` delegates. AGENTS H table lists “R2 put/get/**presign**”; **no** `presign` / multipart / list / head / arrayBuffer body API. |
| ARCH-P03-008 | P2 | packages/storage/src/index.ts:14–17 | **`KitR2ObjectBody` limited to `text()`** — binary/stream readiness low for multi-app (video M2, zip) | Type only exposes `key` + `text()`. Notes demo is text-only; product R2 (artefacts, video ≤500 MiB) will need a wider kit surface or apps will raw-bind R2 (layer rule risk). |
| ARCH-P03-009 | P1 | packages/email/src/index.ts; apps/example-api/src/services/email.ts | **Transport abstraction missing from package; SMTP/log lives in the app** | Package exports `buildDemoEmailText`, `DemoEmail`, and type `EmailTransport = 'smtp' \| 'log' \| 'resend'` **with no send function**. App implements raw `connect()` SMTP + log fallback (~70 LOC). AGENTS H2: “abstraire derrière `@gosilex/email`” with `EMAIL_TRANSPORT` / SMTP / Resend — **not implemented in package**. Second app will fork send path (N×M). |
| ARCH-P03-010 | P2 | packages/email/src/index.ts:21; packages/email/src/templates/demo.ts | **Stub type + string “React Email-style” templates** without React Email / Resend deps | `EmailTransport` is a bare export (no runtime use inside package). Template is hand-rolled HTML + `escapeHtml` (good XSS hygiene on `subjectId`) but comment says “Swap to @react-email/components when wiring…” — deferred correctly for P1, but public type over-promises. |
| ARCH-P03-011 | P1 | packages/mcp/src/index.ts; apps/mcp-example/src/index.ts | **`@gosilex/mcp` is not a FastMCP wrapper** — no `fastmcp` dependency; app owns server construction | Package: allowlist + `handlePing`/`handleWhoami` + bearer env helper. App: `new FastMCP`, `addTool` loop, stdio start. AGENTS E: “`@gosilex/mcp` = conventions (logging, sk_, registry) **autour** FastMCP”. Today: demo handlers only. Product `share-mcp` cannot “compose kit MCP host”; it will re-copy FastMCP wiring. |
| ARCH-P03-012 | P1 | packages/mcp/src/index.ts:16–24 | **`assertExactKitTools` hard-codes kit tool set** — blocks multi-app MCP with different tools without package change | Requires exact `['ping','whoami']` order-insensitive. Boot of `mcp-example` calls this at module load. A future product MCP must either (a) not use this assert, (b) fork package, or (c) pollute kit allowlist with product tools — all axial-hostile. Prefer `assertNoShareTools` + app-local allowlist only. |
| ARCH-P03-013 | P2 | packages/mcp/src/index.ts:8–14 | **Product vocabulary in kit** (`share_`, `artifact`) for purity guard | `n.startsWith('share_') \|\| n.includes('artifact')`. Known W6 in kit code-review. Intentional banlist-in-code, but couples package source to product lexicon (banlist script is the proper SSoT for extract). |
| ARCH-P03-014 | P2 | packages/mcp/src/index.ts:26–31 | **`extractBearerFromEnv` AUTHORIZATION path is awkward / fragile** | Builds ``Bearer ${env.AUTHORIZATION}`` then `parseBearer`. If env already holds `Bearer sk_…`, becomes double prefix → null. If holds raw token, works. Undocumented dual semantics; multi-app clients may disagree on env shape. |
| ARCH-P03-015 | P3 | packages/mcp/src/index.ts:38–49; apps/mcp-example | **`whoami` is presence-only (`verified: false` always)** — documented, not a full sk_ convention | Comment: “Does **not** verify the key against example-api / D1”. Kit exit D9 only needs presence; architecture gap for “MCP sk_ auth conventions” until API-backed verify helper lands in package or shared client. |
| ARCH-P03-016 | P2 | apps/example-api/src/routes/{notes,auth,me}.ts; middleware/require-auth.ts | **Call-site pattern: `createDb` reconstructed in every route/middleware** (secondary layer smell affecting multi-app copy-paste) | ≥6 call sites of `createDb(c.env.DB, schema)` in routes/middleware. No package-level Hono middleware helper (by design packages stay framework-light) but no app-local `c.get('db')` either — second API will likely paste the same. Not a package violation of routes→services→repos (services still use repos for SQL); it’s **wiring debt**. |
| ARCH-P03-017 | P3 | packages/storage/src/index.ts:27; packages/mcp/src/index.ts:11,22 | **Errors are bare `Error`, not `AppError`** | Storage/mcp do not depend on `@gosilex/core`. Acceptable for pure helpers/boot asserts; inconsistent with FE/BE error SSoT if these throw across HTTP boundaries later. Today: only thrown inside join / boot guards. |
| ARCH-P03-018 | — | package.json exports; apps/* package.json | **Positive:** every P3 package consumed; not empty zoo | Call sites: `createDb` (example-api routes/middleware/seed); storage (notes service); `buildDemoEmailText` (email service); mcp (mcp-example). Goal “Every package imported by ≥1 example” met. |
| ARCH-P03-019 | P3 | packages/email + docker-compose.yml | **Compose Mailpit exists; package does not own env contract** | Root `docker-compose.yml` Mailpit 1025/8025. SMTP vars live only in example-api env schema. Kit email package cannot be configured independently — readiness for non-api deployables (e.g. worker cron mailer) is low. |

## Metrics

| Metric | Value |
|--------|------:|
| Packages in partition | 4 (`db`, `storage`, `email`, `mcp`) |
| Source files (prod TS, excl. tests) | 5 (`db/index`, `storage/index`, `email/index`+`templates/demo`, `mcp/index`) |
| Test files | 4 |
| Approx. prod LOC (hand-count) | ~7 + ~50 + ~40 + ~50 ≈ **147** |
| Workspace runtime deps (P3) | `db→drizzle-orm`; `mcp→@gosilex/auth`; others **0** |
| Package → app imports | **0** |
| Cycles involving P3 | **0** |
| Call-site apps | `example-api` (db, storage, email); `mcp-example` (mcp) |
| Product-share strings in package prod sources | **1 cluster** (`share_` / `artifact` in mcp assert only) |
| Coverage (lines, existing summaries) | db 100% · storage 100% · email 100% · mcp 100% (thin surfaces) |
| Issues by severity | **P0: 0** · **P1: 3** · **P2: 10** · **P3: 3** · positives tracked separately |
| Empty / type-only stubs | 1 explicit (`EmailTransport`); MCP/email under-built vs AGENTS narrative |
| Presign / migrate / FastMCP host / Resend send in packages | **0 / 0 / 0 / 0** |

### Dependency direction (P3)

```text
@gosilex/mcp ──► @gosilex/auth ──► @gosilex/core ──► @gosilex/types
@gosilex/db   ──► drizzle-orm
@gosilex/storage  (leaf)
@gosilex/email    (leaf)

apps/example-api ──► db, storage, email, auth, core, types
apps/mcp-example ──► mcp (+ fastmcp direct, not via @gosilex/mcp)
```

### Abstraction quality scorecard

| Package | Generic? | Leakage | Abstraction depth | Multi-app ready? |
|---------|----------|---------|-------------------|------------------|
| `@gosilex/db` | Yes | None | Minimal (factory) | Schema-yes; migrate/test harness-no |
| `@gosilex/storage` | Yes | None | Low (key join strong; I/O thin) | Text demo yes; binary/presign-no |
| `@gosilex/email` | Mostly (demo template) | None product | Template only; transport in app | **No** (send forked) |
| `@gosilex/mcp` | Kit-demo tools | Product words in assert | Handlers + allowlist; not FastMCP host | **No** for product toolsets |

## Recommendations

1. **P1 — Promote email transport into `@gosilex/email`** (before a second mail-sending app): `sendEmail({ transport, smtp, resend, message })` with `log | smtp | resend` implementations; keep React Email migration as follow-up. Leave demo template in package or move “GOSILEX kit demo” copy to example-api if purity matters. Collapse app `services/email.ts` to a thin env adapter.

2. **P1 — Soften MCP kit contracts for multi-app:** keep `assertNoShareTools` (or prefer **script banlist only** and drop product tokens from package). Replace `assertExactKitTools` / hard `MCP_TOOL_NAMES` as *package* law with example-local allowlist in `mcp-example`. Grow `@gosilex/mcp` toward AGENTS: optional `createKitMcpServer({ name, tools, auth })` wrapping FastMCP, structured logging, sk_ verify hook (HTTP client to API).

3. **P1/P2 — Document or implement “migrate glue” scope for `@gosilex/db`:** either (a) export versioned SQL apply helpers + optional `createMemoryD1()` for tests, or (b) explicitly ADR that migrate/seed remain **per-app** and README/AGENTS stop implying package-owned migrate. Prefer exporting the D1 sqlite test double once to kill ARCH-P03-006.

4. **P2 — Widen `@gosilex/storage` when M2/product needs it:** `arrayBuffer()`/`body` on objects, `list`/`head`, and **presign** helper behind `KitR2Bucket` (or separate binding type). Keep `joinObjectKey` as the security spine; avoid putting product `share/` defaults in the package (callers pass prefix).

5. **P2 — Typing:** replace `d1: unknown` / `as never` with a minimal `D1Database`-compatible interface typed in-package (or re-export workers type under a package-local alias that avoids DOM conflicts — same rationale as `KitR2Bucket`).

6. **P2 — App wiring (secondary axis, call-site readiness):** introduce `db` (and optionally `bucket`) on Hono context via middleware in example-api so routes don’t re-`createDb`; pattern becomes the template for `share-api`.

7. **P3 — Error style:** if storage/mcp throws become cross-cutting, map to `AppError` or keep pure `Error` with documented “non-HTTP helpers only”.

8. **P3 — `extractBearerFromEnv`:** accept either raw `sk_…` or full `Authorization` header value; unit-test both; document env contract for stdio MCP.

## Residual risks

| Risk | Why residual | When it bites |
|------|--------------|---------------|
| Second CF app copies SMTP dialogue | Transport not in package | First non-example mail feature |
| `share-mcp` bypasses `@gosilex/mcp` entirely | No FastMCP host conventions | M5 product slice |
| Raw R2 usage outside `@gosilex/storage` for binary/presign | Package surface too small | M2 video / large upload |
| D1 memory shim drift | Duplicated in db tests + example-api | Second API app’s test suite |
| Product strings in mcp package | Banlist script is true extract gate; package asserts can rot | Rename product tools / false sense of purity |
| `whoami.verified === false` forever | Demo contract only | Agents trusting MCP auth presence as proof |
| Empty-ish packages still justified by goal exit | “≥1 call site” bar is low | Kit polish reviews may over-score completeness |
| Not audited here | Security of path traversal edge cases, async leaks, coverage floors policy | Security / Test Quality / Async domain agents |

**Bottom line:** P3 is **architecturally safe for kit extract** (no product domain in schemas/R2 prefixes, clean DAG, real consumers) but **not yet a multi-product platform layer** for email send or MCP hosting. Prioritize transport promotion and MCP contract redesign before `apps/share-*` MCP/email work; keep db schema-in-apps rule; grow storage only with concrete second call sites (presign/binary).
