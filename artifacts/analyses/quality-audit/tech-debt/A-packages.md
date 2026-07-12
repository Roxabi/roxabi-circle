# Tech Debt — A packages

**Date:** 2026-07-12  
**Partition:** `packages/**` · ADR-0002 interim session · TODO/FIXME/HACK scan  
**Domain:** Tech Debt (interim HMAC vs Better Auth, incomplete packages, magic numbers, deprecated, TODOs)  
**Out of scope:** `apps/**` product/demo wiring (except as call-site evidence); OWASP deep-dive → security domain  
**Refs:** `docs/architecture/adr/0002-session-hmac-interim-vs-better-auth.md`, AGENTS.md §D/E/H/H2/K, goal dual-mission kit-first

## Summary

Packages are **small, intentional, and free of classic `TODO`/`FIXME`/`HACK` markers** (0 hits under `packages/**` for those tags). Tech debt is almost entirely **documented interim design + AGENTS surface overclaim**: `@gosilex/auth` ships Workers-native **HMAC session + PBKDF2 + `sk_` hash** (ADR-0002 accepted), not Better Auth; there is **no `SessionPort` adapter** yet, so the planned product swap is a multi-call-site rewrite. Several kit packages under-deliver the package map (email transport, storage presign, db migrate, FastMCP host conventions, core Result/env Zod, types Zod). Dead edges and magic constants are minor. **No deprecated APIs** in package sources. Overall: healthy kit exit size, **medium structural debt** concentrated on auth interim + incomplete platform facades.

## Findings

| ID | Severity | File | Finding | Evidence |
|----|----------|------|---------|----------|
| TD-A-001 | P1 | `packages/auth/src/session.ts` · `docs/architecture/adr/0002-session-hmac-interim-vs-better-auth.md` · AGENTS.md §D | **Interim HMAC session is the live auth spine; Better Auth is not installed.** ADR-0002 accepted (2026-07-12) documents kit HMAC + product Better Auth swap. Package implements `signSession`/`verifySession` via `crypto.subtle` HMAC-SHA-256 body.sig; **zero** `better-auth` dependency. AGENTS stack table still lists “Better Auth sur Hono” / package map “Better Auth Hono, cookies, keys, guards” — doc lag vs ADR. Anti-pattern ADR names (“claiming Better Auth installed when only HMAC is present”) is the live risk for onboarding. | `session.ts:1–7` (“Swap to Better Auth adapters later”); ADR-0002 decision table session = HMAC now; `packages/auth/package.json` deps = only unused `@gosilex/core`. |
| TD-A-002 | P1 | `packages/auth/src/*` · ADR-0002 Consequences · `apps/example-api/src/services/auth.ts` | **`SessionPort` / adapter seam missing** — ADR consequence not implemented. Call sites import concrete `signSession` / `verifySession` / `sessionCookieHeader`. Product swap will touch every consumer (example-api auth service + future share-api) unless a port lands first. | ADR-0002:39 “introduce `SessionPort` / adapter”; package has no port types/factories; app direct imports (`services/auth.ts` from `@gosilex/auth`). |
| TD-A-003 | P1 | `packages/auth/src/*` · AGENTS.md §D | **Guards not in package** (`requireSession` / `requireApiKey` absent). Dual-auth orchestration (`resolveAuth`, combined `requireAuth`) lives only in example-api. Second app will copy-paste bearer-then-cookie precedence and cookie/session secret wiring — N×M debt seeded by incomplete kit surface. | Package exports: crypto + cookie string helpers only (`index.ts`). No Hono, no guards. AGENTS: “Guards \| `requireSession` / `requireApiKey`”. |
| TD-A-004 | P1 | `packages/auth/src/session.ts` (design) | **Stateless HMAC = no server-side session revoke / rotation list.** Logout clears cookie client-side only; secret rotation mass-invalidates all sessions. Acceptable for kit demo; product Better Auth (or session table) is the intended fix — until then, any multi-device / force-logout product story is blocked at package layer. | No session store, no jti/denylist API in package; payload is `{ sub, email, exp }` only. |
| TD-A-005 | P2 | `packages/auth/src/session.ts:69–71` | **Session payload: integrity without shape validation.** After HMAC verify, `JSON.parse` + `as SessionPayload` with only `exp` check. Malformed-but-signed tokens (or shape drift) are not runtime-guarded; interim design debt couples to type-safety TS-P02-001. Prefer Zod/type-guard before Better Auth, so port stays stable. | ```69:71:packages/auth/src/session.ts``` |
| TD-A-006 | P2 | `packages/auth/src/session.ts:78–91` · ADR-0002 | **Cookie contract partially frozen in helpers.** Name `gosilex_session`, `Path=/`, `HttpOnly`, `SameSite=Lax` hard-coded; only `secure` + `maxAge` optional. ADR marks cookie **name** non-stable for Better Auth; AGENTS wants Domain / SameSite=None options. Helpers will fork or grow before product multi-host. | `SESSION_COOKIE = 'gosilex_session'`; `sessionCookieHeader` / `clearSessionCookieHeader`. |
| TD-A-007 | P2 | `packages/auth/package.json` | **Dead dependency `@gosilex/core`.** Declared, never imported under `packages/auth/src`. Graph noise; suggests unfinished “guards throw AppError” work or leftover scaffold. | `dependencies["@gosilex/core"]`; `rg @gosilex/core packages/auth` → package.json only. |
| TD-A-008 | P1 | `packages/email/**` · AGENTS.md §H2 | **Email package is template-only; transport lives in the app.** Exports `buildDemoEmailText` / `DemoEmail` + bare type `EmailTransport = 'smtp' \| 'log' \| 'resend'` with **no send implementation**. AGENTS: “abstraire derrière `@gosilex/email`” (`EMAIL_TRANSPORT`, SMTP, Resend). Comment defers React Email: “Swap to @react-email/components when wiring…”. Second mailer app = SMTP dialogue fork. | `email/src/index.ts:21` type-only; `templates/demo.ts:1–3` swap comment; app owns SMTP in `services/email.ts` (call-site evidence). |
| TD-A-009 | P1 | `packages/mcp/src/index.ts` · AGENTS.md §E | **`@gosilex/mcp` is not a FastMCP/SDK host wrapper.** No `fastmcp` dependency; package = allowlist + demo handlers + bearer env helper. App constructs FastMCP. `handleWhoami` documents `verified: false` always (“until wired to a real Bearer verify”). Product M5 cannot “compose kit MCP host”; will re-copy wiring. | `mcp/package.json` deps = `@gosilex/auth` only; `handleWhoami` L42–49; AGENTS “conventions autour FastMCP”. |
| TD-A-010 | P2 | `packages/mcp/src/index.ts:3–24` | **Kit tool allowlist over-locked.** `MCP_TOOL_NAMES` + `assertExactKitTools` hard-require exact `ping`/`whoami`. Product MCP cannot reuse package law without fork/pollution. Debt: kit purity guard should not encode product toolset size. | L3–24; mcp-example re-checks same list. |
| TD-A-011 | P2 | `packages/db/src/index.ts` · AGENTS.md §H | **`@gosilex/db` = one-line factory; migrate/seed not in package.** AGENTS map: “Drizzle D1 + migrate”. Actual: `createDb(d1 as never, { schema })` only; migrations under `apps/example-api/migrations/`. Intentional schema-in-apps (good axial) but **migrate helpers / test D1 double not promoted** → triplicate better-sqlite3 harness debt. | Entire public surface ~7 LOC; eslint-disable + `as never`. |
| TD-A-012 | P2 | `packages/storage/src/index.ts` · AGENTS.md §H | **Storage surface thin vs map claim “put/get/presign”.** Real value = `joinObjectKey` traversal reject; put/get/delete are pass-throughs; **no presign**, no binary/`arrayBuffer`, no list/head. Product M2 video/presign will either grow package or raw-bind R2 outside storage (layer debt). | L35–50 pass-throughs; `KitR2ObjectBody` = `text()` only. |
| TD-A-013 | P2 | `packages/core/**` · `packages/types/**` · `packages/config/**` · AGENTS.md §H | **P0 package map overclaims vs implementation (doc debt).** | | | |
| | | `@gosilex/core` | Claimed: AppError, **Result**, IDs, requestId, **env Zod**. Actual: `AppError` + `toApiErrorBody` + `newRequestId` only. No Result type, no env Zod. `cause?` from AGENTS §F sketch missing. |
| | | `@gosilex/types` | Claimed: **Zod schemas** + ErrorCode. Actual: `ErrorCode` + `ApiErrorBody` only; **no zod** dependency. `RATE_LIMITED` code with no `AppError.rateLimited()`. |
| | | `@gosilex/config` | Claimed: tsconfig, **Biome**, **Vitest presets**. Actual: `tsconfig.base.json` + `vitest-coverage.mjs` imported by **relative path** (not package export except tsconfig). Root `biome.json` only. | `package.json` exports only `./tsconfig.base.json`. |
| TD-A-014 | P2 | AGENTS.md §H package zoo vs `packages/` tree | **Roadmap packages not scaffolded (correct under A8 if treated as P1+, but map noise).** Absent: `@gosilex/i18n`, `rate-limit`, `audit`, `jobs`, `observability`, `billing`. No empty skeleton packages (good — A8). Residual: readers of AGENTS may assume stubs exist. | `list packages/` = auth, config, core, db, email, mcp, storage, types, ui only. |
| TD-A-015 | P3 | `packages/**` (scan) | **Zero `TODO` / `FIXME` / `HACK` / `XXX` / `@deprecated` in package sources.** Debt is comment-form (“Swap later”, “until wired”) and ADR, not ticket tags. Positive for grep hygiene; **risk = invisible backlog** (no inline trail to tracker). | `rg TODO\|FIXME\|HACK\|XXX\|@deprecated packages` → 0 (except unrelated “placeholder” CSS / AvatarFallback). |
| TD-A-016 | P3 | `packages/auth/src/keys.ts` · `session.ts` · `mcp/src/index.ts` | **Magic numbers / literals (crypto & TTL).** | API key entropy `Uint8Array(24)` (L29); salt `16` bytes (L52); derive `256` bits (L64/89); default session cookie `maxAge = 60 * 60 * 24 * 7` (7d, session L84); whoami `slice(0, 8)` prefix (mcp L49). Only `PBKDF2_ITERS = 100_000` is named (good). Prefer `API_KEY_BYTES`, `DEFAULT_SESSION_MAX_AGE_SEC`, `KEY_PREFIX_LEN`. |
| TD-A-017 | P3 | `packages/auth/src/keys.ts:17–25` | **`timingSafeEqualHex` is `async` with zero `await`.** API shape debt; forces await for sync XOR. Over-exported with no external monorepo consumer beyond package-internal verify paths. | Function body fully sync; still `export async function`. |
| TD-A-018 | P3 | `packages/auth/src/keys.test.ts` | **Misnamed / co-located tests.** Session tests live in `keys.test.ts`; cookie header / `parseCookie` unit gaps. Inventory debt for coverage ownership (session.ts functions ~62.5% in prior snapshot). | Three describes in one file; no `session.test.ts`. |
| TD-A-019 | P3 | `packages/email/src/index.ts:21` · `templates/demo.ts` | **Type/export theater + “React Email-style” naming without React Email.** `EmailTransport` unused at runtime; templates are hand-rolled HTML + partial `escapeHtml`. Honest deferral, but public names over-promise. | Type exported; no function takes it; no `@react-email/*` dep. |
| TD-A-020 | P3 | `packages/ui/**` · AGENTS.md §C | **UI kit solid for B4; theme package debt light.** shadcn Base UI components present (button, field, dialog, sheet, sidebar, sonner, table…). `next-themes` not a direct `package.json` dep (Toaster takes `theme` prop only). No ThemeProvider in package. Not blocking kit exit; product dark-mode wiring may re-add theme host in apps. | `ui/package.json` deps: base-ui, cva, sonner, lucide…; no next-themes. |
| TD-A-021 | P3 | `packages/*/package.json` build scripts | **All packages `"build": "echo ok"` + source-path exports.** Acceptable Bun workspace model; extract-as-publishable npm packages would need real emit. Residual packaging debt, not runtime bug. | Every package `exports` → `./src/index.ts`. |
| TD-A-022 | P3 | `packages/core/src/errors.ts` · `packages/types/src/index.ts` | **Incomplete error SSoT surface.** Free `code: string`; missing `rateLimited()` factory for `RATE_LIMITED`; no `cause` chaining. Coupled to ERR-BE / ARCH-P1 — counts as tech debt until rate-limit package or core factories catch up. | ErrorCode has RATE_LIMITED; factories stop at internal/conflict. |

### Non-findings (healthy)

| Area | Assessment |
|------|------------|
| TODO/FIXME/HACK density | **0** tagged markers in packages — no abandoned half-patches littering source |
| Deprecated APIs | **None** found (`@deprecated`, removed exports) |
| Empty package zoo | **Avoided** — no empty `rate-limit`/`billing` shells (A8 respected) |
| ADR honesty on session | **ADR-0002 present and accepted** — interim HMAC is intentional, not accidental debt |
| KDF separation | **Clear** — `hashApiKey` (SHA-256) vs `hashPassword` (PBKDF2) vs session HMAC; ADR anti-pattern encoded in comments |
| Axial product leakage | **Low** — product tokens only in mcp ban guard (`share_`, `artifact`); no share domain schemas in packages |
| Classic god-file debt | **None** — largest auth modules ~100 LOC; P3 packages ~50 LOC |
| Call sites | Every runtime package has ≥1 example consumer (extract dry-run viable) |

### ADR-0002 scorecard (tech-debt lens)

| ADR element | Status | Debt? |
|-------------|--------|-------|
| HMAC session kit default | **Shipped** | Intentional interim |
| FE contract cookies + credentials | **Shipped** (helpers + example-web) | Stable |
| Machine Bearer `sk_` | **Shipped** | Stable |
| Better Auth product swap | **Not started** | Planned |
| `SessionPort` at boundary | **Missing** | **Yes — P1** |
| Password PBKDF2 demo | **Shipped** | Replace with BA credential plugin later |
| Cookie name stability | Documented non-stable | Helpers hard-code name |
| Anti-pattern “claim BA installed” | Doc risk | AGENTS still says BA in stack tables |

### Package completeness vs AGENTS map

| Package | AGENTS claim (abbrev.) | Actual | Debt class |
|---------|------------------------|--------|------------|
| core | AppError, Result, IDs, requestId, env Zod | AppError + requestId | Doc + missing Result/env |
| types | Zod + ErrorCode | ErrorCode + ApiErrorBody | Doc + no Zod |
| config | tsconfig, Biome, Vitest | tsconfig + unexported coverage helper | Boundary incomplete |
| auth | Better Auth + guards + keys | HMAC + keys + cookies strings | **Interim P1** |
| db | Drizzle + migrate | `createDb` only | Thin |
| storage | put/get/**presign** | put/get/delete + join | Missing presign |
| email | transport abstraction | template demo | **Transport in app** |
| mcp | FastMCP conventions | handlers + allowlist | **Not host** |
| ui | shadcn Base UI shell | Present | Light |
| i18n / rate-limit / audit / jobs / obs / billing | P1–P2 map | **Absent** | Roadmap (OK if gated) |

## Metrics

| Metric | Value |
|--------|------:|
| Packages under `packages/` | **9** (auth, config, core, db, email, mcp, storage, types, ui) |
| Production source modules (approx., excl. ui components bulk) | **~15** non-ui + **~20** ui components |
| Files analyzed (src + package.json + ADR + related tests) | **~40+** |
| `TODO` / `FIXME` / `HACK` / `XXX` in packages | **0** |
| `@deprecated` markers | **0** |
| Explicit “Swap later” / “until wired” comments | **3** (auth session, email template, mcp whoami) |
| ADR-0002 status | **accepted** (interim documented) |
| Better Auth installed | **No** |
| SessionPort types | **0** |
| Package-level Hono guards | **0** |
| Unused workspace deps | **1** (`auth` → `core`) |
| Orphan public types (no runtime use) | **1+** (`EmailTransport`) |
| Magic-number clusters (crypto/TTL/prefix) | **1** cluster (~6 literals) |
| Roadmap packages not created | **6** (i18n, rate-limit, audit, jobs, observability, billing) |
| Issues total | **22** |
| P0 | **0** |
| P1 | **6** |
| P2 | **8** |
| P3 | **8** |

**Severity mix:** No extract-blocking P0 tech debt in packages. P1 cluster is **auth interim without port/guards** + **email/mcp under-build** (multi-app fork risk). P2 is map/doc drift and thin facades. P3 is hygiene.

**Subjective package tech-debt score (partition):** **~62/100**  
(100 = pristine / matches AGENTS claims and ADR consequences). Dragged down by missing SessionPort, AGENTS Better Auth wording, email/mcp incompleteness; lifted by zero TODOs, no empty zoo, ADR honesty, thin modules.

## Recommendations

1. **P1 — Treat ADR-0002 as SSoT; align AGENTS stack tables (TD-A-001)**  
   - Stack “When” / package map: *kit = HMAC session (ADR-0002); Better Auth = product / M3+ swap*.  
   - README already closer to reality (“Session cookie HMAC”) — keep AGENTS in sync to stop false claims.

2. **P1 — Introduce `SessionPort` before any Better Auth work (TD-A-002)**  
   - Minimal interface: `sign` / `verify` / cookie set-clear options.  
   - HMAC adapter = default export; Better Auth adapter later.  
   - Migrate example-api to depend on port, not concrete `signSession` (or re-export HMAC as default adapter).

3. **P1 — Promote dual-auth resolver (optional pure API) without pulling D1 into auth (TD-A-003)**  
   - e.g. `resolveAuthFromHeaders({ authorization, cookie, secret, lookupKeyHash })` in `@gosilex/auth`.  
   - Keep Hono middleware in apps **or** optional `@gosilex/auth/hono` peerDep later.  
   - Goal: second app does not reimplement bearer-vs-cookie order.

4. **P1 — Email transport into package before second sender (TD-A-008)**  
   - `sendEmail({ transport, smtp?, resend?, message })` with `log | smtp | resend`.  
   - Keep demo template; collapse app SMTP dialogue to env adapter.  
   - React Email migration remains P1 follow-up (comment already honest).

5. **P1 — MCP host conventions before product MCP (TD-A-009 / TD-A-010)**  
   - Soften `assertExactKitTools` → app-local allowlist; keep banlist in scripts.  
   - Optional `createKitMcpServer` wrapping FastMCP + sk_ verify hook.  
   - Wire `whoami.verified` only when a real verify port exists (don’t fake true).

6. **P2 — Doc or implement thin-package scopes (TD-A-011–013)**  
   - **db:** export `createMemoryD1` / migrate helper **or** ADR “migrate stays per-app” and stop saying “+ migrate” in package map.  
   - **storage:** add presign when M2 needs it; don’t grow for theater.  
   - **core/types/config:** either implement Result + shared Zod env helper + config exports, or rewrite AGENTS §H to match shipped surface (prefer rewrite until 2nd call site — A8).

7. **P2 — Session payload runtime guard (TD-A-005)** cheap win pre-port  
   - Validate `sub`/`email` strings + finite `exp` after parse; reject otherwise.  
   - Optional shared Zod schema later in types when Zod lands.

8. **P3 — Hygiene batch (TD-A-007, 016–019)**  
   - Drop unused `@gosilex/core` from auth (or use it when guards land).  
   - Name crypto/TTL constants; sync cookie header builder; rename/split `session.test.ts`.  
   - Delete or implement `EmailTransport` usage; drop “React Email” wording until dep exists.  
   - Prefer tracked issues over silent “swap later” comments for P1 items.

9. **Do not**  
   - Scaffold empty i18n/rate-limit/billing packages “for the form” (AGENTS A8).  
   - Claim Better Auth in marketing/README while HMAC is live.  
   - Put product session schema inside `@gosilex/auth` (keep axial: apps own tables).

## Residual risks / not covered

| Risk | Why residual | Owner domain / when |
|------|--------------|---------------------|
| Deploy footgun SESSION_SECRET / ENVIRONMENT | Lives in `apps/example-api` `session-env.ts` (fail-closed path exists) | Security / apps tech-debt B |
| HMAC crypto edge cases (timing, empty secret) | Partial unit coverage; secret policy in app | Security P2 |
| Better Auth Workers adapter complexity | Not started; schema/cookie rename | Product M3+ |
| Concurrent session revoke races | N/A until server sessions | Async / product |
| UI ThemeProvider / i18n Paraglide | i18n messages live in example-web, not package | Tech-debt B / B4–B5 |
| Coverage floors policy | Floors exist; not re-scored here | Test quality T1/T3 |
| License / dependency lag (semver pins) | Not scanned deeply | Tooling P7 |
| Banlist product strings in mcp package | Intentional purity guard | Axial / code smells P3 |

**Bottom line:** Package tech debt is **managed interim architecture**, not abandoned TODOs. The critical path is: **document honesty (AGENTS ↔ ADR-0002) → SessionPort → dual-auth promote → email/MCP real facades** before `apps/share-*` multiplies copies. Magic numbers and dead deps are cheap cleanup. Zero TODO tags is a hygiene win; keep the backlog in ADR/plan issues so “swap later” does not become permanent.
