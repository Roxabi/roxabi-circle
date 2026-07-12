# Test Quality — T1 packages

**Date:** 2026-07-12  
**Partition:** `packages/**/*.{test,spec}.{ts,tsx}`  
**Focus:** security-critical path coverage, assertion quality, mock overuse, missing negatives  
**Coverage sources:** `packages/{auth,core,ui}/coverage/coverage-summary.json` + monorepo `coverage/{auth,core,db,storage,mcp,types,email,ui}/coverage-summary.json`  
**Policy SSoT:** [`docs/testing.md`](../../../../docs/testing.md) · floors via `packages/config/vitest-coverage.mjs` + per-package `vitest.config.ts`

## Summary

Package unit tests are **small, real, and generally well-aimed**: **0** `vi.mock` / spy theatre; fakes are in-memory doubles (`memoryBucket`, D1-from-SQLite) that exercise real code. T0 **auth crypto** (hash/verify key, bad key, bad sig, expired session) and **CP-R2** traversal rejects are present with meaningful contract assertions. **Gaps are mostly missing negatives / unowned package seams**, not vanity green tests.

Largest quality debt at this partition: **`sessionCookieHeader` / `clearSessionCookieHeader` / `parseCookie` have zero package tests** (session module ~74% lines / 62.5% functions) while CP-AUTH-SESSION ownership for cookie **shape** is documented on `packages/auth`. Cookie **HttpOnly / SameSite / Secure** is only asserted in `apps/example-api` integration — good composition belt, incomplete package seam. Secondary: **password KDF / Bearer / email escape** lack malformed-input negatives; **core** AppError factories untested (function coverage ~50%, floor intentionally 50%). UI contracts hit known Base UI traps (MenuGroup) but not the documented “closed dialog” trap. **No P0.** Mock overuse is not a problem here.

## Inventory (test modules)

| Package | Test file(s) | `it` count | Role |
|---------|--------------|----------:|------|
| `@gosilex/auth` | `packages/auth/src/keys.test.ts` | 6 | CP-AUTH-KEY + partial CP-AUTH-SESSION |
| `@gosilex/core` | `packages/core/src/errors.test.ts` | 3 | CP-ERR (envelope, no stack leak) |
| `@gosilex/db` | `packages/db/src/index.test.ts` | 1 | createDb round-trip (D1-shaped) |
| `@gosilex/storage` | `packages/storage/src/index.test.ts` | 4 | CP-R2 join + put/get/delete |
| `@gosilex/mcp` | `packages/mcp/src/index.test.ts` | 4 | CP-MCP allowlist + whoami presence |
| `@gosilex/types` | `packages/types/src/index.test.ts` | 1 | ErrorCode kit-generic smoke |
| `@gosilex/email` | `packages/email/src/index.test.ts` | 1 | demo template happy path |
| `@gosilex/ui` | `utils.test.ts`, `dialog-sheet.test.tsx`, `dropdown-menu.test.tsx` | 1+3+2 | CP-UI-CONTRACT + cn |
| `@gosilex/config` | *(none)* | 0 | tooling only — OK |

**Total:** **10** test modules · **26** `it(...)` · **0** `*.spec.*` · **0** `vi.mock` / `jest.mock` / `vi.spyOn` under `packages/`.

## Coverage notes

| Package | Tier / floor (stmts·lines) | Reported total (lines % / funcs % / branches %) | vs floor | Notes |
|---------|----------------------------|--------------------------------------------------|----------|--------|
| **auth** | T0 **80** / br 70 / fn 70 | **85.98** / **76.47** / **80.48** | Pass | `keys.ts` **100%** lines; `session.ts` **74.35** lines / **62.5** funcs — cookie helpers uncovered; `index.ts` re-export 0% (noise) |
| **core** | T1 **75** / br 70 / fn **50** | **81.25** / **54.54** / **87.5** | Pass | `toApiErrorBody` + validation path covered; static factories mostly unhit (fn floor low on purpose) |
| **db** | T1 **70** / fn 50 | **100** / **100** / **100** | Pass | Tiny surface (`createDb` only) |
| **storage** | T1 **70** / br 60 / fn 70 | **100** / **100** / **90.9** | Pass | Traversal + round-trip solid |
| **mcp** | T1 **70** / fn 50 | **100** / **100** / **94.11** | Pass | Strong allowlist + negative product tools |
| **types** | T1 **70** | **100** / n/a / n/a | Pass | Const object only |
| **email** | T3 soft **50** | **100** / **100** / **100** | Pass | % green ≠ security of escape/CRLF paths (happy-only tests) |
| **ui** | T2 **20** / br 50 / fn 40 | **21.99** / **64.28** / **80** | Pass | Low global % expected; Dialog/Sheet/Tooltip/Button/utils covered; sidebar/field/table etc. 0% by design |

**Interpretation:** floors are met. Auth **overall** % masks **session cookie helpers**. Email **100%** is from a single happy `it` that still exercises `escapeHtml` only on safe input — branch for `& < > "` and subject CRLF strip are covered by call path but **not asserted**.

### CP-* map (package ownership only)

| CP-ID | Package home | Package test status |
|-------|--------------|---------------------|
| **CP-AUTH-KEY** | `auth` | **Good** — mint prefix, hash len 64, verify true/false |
| **CP-AUTH-SESSION** | `auth` | **Partial** — sign/verify + bad sig + expired; **no** cookie header flags / parse / clear at package unit |
| **CP-ERR** | `core` | **Good** — nested body + requestId + unknown→INTERNAL without message leak |
| **CP-R2** | `storage` | **Good** — `..` / nested `..` throw; demo prefix; no `share/` key in demo path |
| **CP-MCP** | `mcp` | **Good** — exact allowlist, `share_*` / `artifact` forbidden, whoami `verified: false` |
| **CP-UI-CONTRACT** | `ui` | **Partial** — MenuGroupContext negative + open Dialog/Sheet/Tooltip; **no** closed-dialog trap |
| Dual auth / IDOR / CORS / FE-CRED | apps | Out of T1 scope (T2) |

## Findings

| ID | Severity | File | Finding | Evidence |
|----|----------|------|---------|----------|
| TQ-T1-001 | **P1** | `packages/auth/src/session.ts` · `keys.test.ts` | **CP-AUTH-SESSION cookie helpers untested at package seam.** Public `sessionCookieHeader`, `clearSessionCookieHeader`, `parseCookie` never imported in package tests. Coverage: `session.ts` lines **74.35%**, functions **62.5%**. Regression dropping `HttpOnly` / `SameSite=Lax` / `Path=/` would not fail package suite. | Grep: no `sessionCookieHeader`/`parseCookie` in any `packages/**/*.{test,spec}.*`. App only asserts HttpOnly/SameSite/Secure in `apps/example-api/src/app.test.ts` (~L96–97, ~L296–312). docs/testing.md seam 1 = `packages/auth` unit. |
| TQ-T1-002 | **P1** | `packages/auth/src/keys.ts` · `keys.test.ts` | **Password KDF missing malformed-store negatives.** `verifyPassword` has fail-closed branches (`parts.length !== 4`, scheme ≠ `pbkdf2`, non-finite/iterations &lt; 1, empty salt/hash) — only happy + wrong-password tested. | Test L29–35: good password true, wrong false. No cases for `"not-a-kdf"`, `"pbkdf2$0$ab$cd"`, truncated `$` parts. Security-relevant for login path once composed. |
| TQ-T1-003 | **P2** | `packages/auth/src/keys.ts` · `keys.test.ts` | **`parseBearer` / `timingSafeEqualHex` edge cases thin.** Bearer: null + Basic only; no empty token (`Bearer `), no multi-space, no case variants beyond regex. `timingSafeEqualHex` never direct-tested for length mismatch / odd hex length (only via verify). | L22–26; `timingSafeEqualHex` L17–25 in keys.ts early-return false paths unasserted as named cases. |
| TQ-T1-004 | **P2** | `packages/auth/src/session.ts` · `keys.test.ts` | **Session verify negatives incomplete.** Covered: bad secret, expired. Missing: token without `.`, empty string, garbage base64, valid HMAC + invalid JSON body (catch → null). | Tests L38–67 only three session cases. |
| TQ-T1-005 | **P2** | `packages/core/src/errors.test.ts` | **AppError factories + non-Error throws under-tested.** Only `validation` + raw `Error` + `newRequestId`. No `unauthorized`/`forbidden`/`notFound`/`conflict`/`internal` status/code contracts; no `toApiErrorBody("string")` / `null`. Function coverage **~55%** (floor 50% allows this). | errors.test.ts L4–33; factories L17–39 errors.ts unused in tests. |
| TQ-T1-006 | **P2** | `packages/email/src/templates/demo.ts` · `index.test.ts` | **Email XSS/CRLF defenses not asserted.** Code escapes HTML in body and strips `[\r\n]` from subject; test only safe `subjectId: 'u1'`. Happy 100% coverage without security contract. | demo.ts L5–18 vs index.test.ts L5–10. |
| TQ-T1-007 | **P2** | `packages/ui/.../dialog-sheet.test.tsx` | **CP-UI-CONTRACT incomplete vs docs inventory.** Docs list “closed dialog” as known Base UI trap; suite only mounts **open** controlled Dialog/Sheet/Tooltip. No closed-default / missing-provider negative beyond TooltipProvider happy path. | testing.md CP-UI-CONTRACT row; dialog-sheet tests L24–77 all `open` or provider wrap. |
| TQ-T1-008 | **P2** | `packages/mcp/src/index.test.ts` | **`extractBearerFromEnv` AUTHORIZATION path untested.** Code prefers `AUTHORIZATION` via `parseBearer(\`Bearer ${…}\`)` then `API_KEY` sk_ prefix; test only `API_KEY: 'sk_test'` and non-key. | mcp/index.ts L26–31; test L38–41. |
| TQ-T1-009 | **P3** | `packages/types/src/index.test.ts` | **Types suite is smoke only.** Checks a couple codes + no `SHARE` substring; does not freeze full ErrorCode set / `ApiErrorBody` shape (no runtime Zod). Acceptable for const module; weak if codes drift. | L4–9. |
| TQ-T1-010 | **P3** | `packages/ui/src/lib/utils.test.ts` | **`cn` single happy path.** Merge + conflict override only; fine for tailwind-merge wrapper. | L4–8. |
| TQ-T1-011 | **P3** | `packages/db/src/index.test.ts` | **Happy-only createDb.** One insert/select; no failure modes (invalid SQL / missing table). Acceptable for thin kit wrapper; behavior lives in apps. | L52–70. |
| TQ-T1-012 | **P3** | UI contract tests | **Some text selectors vs roles** (assertion mild brittleness). `getByText('Title'|'Actions'|…)` vs `getByRole('heading'|'menuitem')`. Interactive opens use roles correctly. | dialog-sheet L41; dropdown L57–58. (Also SMELL-T01-009.) |

### Non-findings (healthy)

| Area | Assessment |
|------|------------|
| **Mock overuse** | **None.** No module mocks; auth uses real Web Crypto; storage/db use local fakes implementing real interfaces. |
| **Assert-mock-only tests** | **None.** Expectations hit return values, throws, DOM, or public codes — not `toHaveBeenCalled` theatre. |
| **Flaky timers / network** | **None** in package tests (no fake timers, no fetch). |
| **AI spam** | **None** — no `expect(true)`, no status-only without code. |
| **Product share fixtures** | **Avoided** — mcp builds `share${'_'}publish`; storage asserts `!startsWith('share/')` for demo keys. |
| **CP-AUTH-KEY / CP-R2 / CP-MCP / CP-ERR core** | **Solid** relative to surface size. |
| **Negative paths present** | auth wrong key/password/sig/expired; storage traversal; mcp forbidden tools + exact allowlist; ui Label-outside-Group; core INTERNAL no secret message. |

## Assertion quality (spot check)

| Suite | Quality | Comment |
|-------|---------|---------|
| `auth/keys.test.ts` | **High** | Prefix, hash length, boolean verify, null payload on reject. Names say failure mode (`rejects bad signature`). |
| `core/errors.test.ts` | **High** | Full deep-equal on API body; explicit no-stack / no-secret. |
| `storage/index.test.ts` | **High** | Throw message `/traversal/`; key prefix; payload round-trip. |
| `mcp/index.test.ts` | **High** | Exact allowlist; whoami documents non-verified; banlist. |
| `ui/*` contracts | **Medium–high** | Captures runtime contract errors; negative MenuGroup good; closed-dialog gap. |
| `email` / `types` / `utils` | **Low breadth** | Correct but thin. |

## Metrics

- Files analyzed (test modules): **10**
- Source modules with public security surface reviewed: **auth keys/session, core errors, storage, mcp, email template**
- Issues: **12** total · **P0: 0** · **P1: 2** · **P2: 6** · **P3: 4**
- Package `it` cases: **26**
- Mock/spy usages in package tests: **0**
- Suites with ≥1 explicit negative path: **auth, storage, mcp, ui(dropdown), core** (5/8 packages with tests)
- Suites happy-only: **email, types, utils, db** (4)
- Coverage floors: **all packages pass** (auth T0 80% still above despite session holes)

### Domain-specific

| Metric | Value |
|--------|------:|
| CP package gaps (major) | 1 (cookie header unit) + partial UI closed-dialog |
| Auth session lines uncovered (approx.) | ~20 / 78 (cookie helpers + edge verify branches) |
| Core functions covered | 6 / 11 (~55%) |
| Email security asserts | 0 |
| UI global line coverage | ~22% (within T2 policy) |

## Recommendations

1. **P1 — Add `packages/auth` cookie contract tests** (keep in package, not only example-api):  
   - `sessionCookieHeader(token)` contains `HttpOnly`, `SameSite=Lax`, `Path=/`, `Max-Age=…`, name `gosilex_session`  
   - `secure: true` → `; Secure`  
   - `clearSessionCookieHeader` → `Max-Age=0` + same flags  
   - `parseCookie` happy / missing name / null header / value with `=`  
   Map names to **CP-AUTH-SESSION**.
2. **P1 — `verifyPassword` negatives:** malformed scheme, wrong part count, iterations `0`/`NaN`, empty salt/hash → `false` (not throw).
3. **P2 — Session token garbage cases** + direct `timingSafeEqualHex` length mismatch; expand `parseBearer` empty/whitespace.
4. **P2 — Core:** table-driven factory → `{code,status}`; `toApiErrorBody` with non-Error; keep no-leak property.
5. **P2 — Email:** one case `subjectId: '<script>\r\nBcc: evil@x'` asserts escaped HTML body + subject without CR/LF.
6. **P2 — UI:** one closed Dialog / missing TooltipProvider negative if still a real Base UI trap; prefer `getByRole` where roles exist.
7. **P2 — MCP:** `extractBearerFromEnv({ AUTHORIZATION: 'sk_…' })` and reject non-sk API_KEY (already partially there).
8. **Do not** chase ui/sidebar % or mock Drizzle for vanity; keep fakes as thin as today.
9. Optional later: mutation testing on `packages/auth` (docs: nightly, not PR gate).

## Residual risks / not covered

- **App-layer** dual auth, IDOR, CORS, Secure-by-env, seed credentials — **T2** (`apps/**` tests), not re-audited here except as belt for cookie flags.
- **Better Auth swap (ADR-0002):** package crypto tests will need rewrites; cookie **wire** tests from rec (1) should survive if helpers keep names/shape.
- **No mutation / property tests** — floors can stay green with shallow asserts; recommended cases above close the real holes.
- **`packages/config`** has no runtime tests (thresholds script only) — OK.
- **PBKDF2 cost** (100k iters) makes password tests slow-ish on CI; still fine for pre-push; do not add dozens of password cases without fixed salt fixture.
- Coverage HTML under `coverage/*` and some `packages/*/coverage` may lag last `bun run test:coverage`; numbers above from current `coverage-summary.json` on disk (2026-07-12 tree).

## Quick reference — absolute test paths

```text
/home/mickael/projects/gosilex/silex-share/packages/auth/src/keys.test.ts
/home/mickael/projects/gosilex/silex-share/packages/core/src/errors.test.ts
/home/mickael/projects/gosilex/silex-share/packages/db/src/index.test.ts
/home/mickael/projects/gosilex/silex-share/packages/email/src/index.test.ts
/home/mickael/projects/gosilex/silex-share/packages/mcp/src/index.test.ts
/home/mickael/projects/gosilex/silex-share/packages/storage/src/index.test.ts
/home/mickael/projects/gosilex/silex-share/packages/types/src/index.test.ts
/home/mickael/projects/gosilex/silex-share/packages/ui/src/lib/utils.test.ts
/home/mickael/projects/gosilex/silex-share/packages/ui/src/components/ui/dialog-sheet.test.tsx
/home/mickael/projects/gosilex/silex-share/packages/ui/src/components/ui/dropdown-menu.test.tsx
```
