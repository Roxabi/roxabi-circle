# Code Smells — P2 auth

**Date:** 2026-07-12  
**Partition:** `packages/auth/**`  
**Focus:** long functions, DRY, magic numbers, dead code, complexity  
**Excluded:** `node_modules/`, `coverage/` (metrics only); OWASP crypto correctness → security P2; package surface / SessionPort → architecture P2

## Summary

`@gosilex/auth` is **smell-light by size**: two runtime modules (`keys.ts` ~93 LOC, `session.ts` ~102 LOC), no god files, no function near the ~80 LOC threshold, and max nesting about 2. The package is intentionally pure Web Crypto helpers with clear KDF separation (API key SHA-256 vs password PBKDF2 vs session HMAC). Real smells are **hex encode/decode DRY gaps**, **duplicated PBKDF2 derive blocks**, **cookie header string twin**, **magic sizes/TTL literals**, **misleading `async` on a sync compare**, an **unused `@gosilex/core` dependency**, and a **test file name that lies** (`keys.test.ts` owns session tests). None block extractability; several are cheap cleanup before the surface grows (guards / Better Auth adapter).

## Findings

| ID | Severity | File | Finding | Evidence |
|----|----------|------|---------|----------|
| SMELL-P2-001 | P2 | `packages/auth/src/keys.ts` | **Hex bytes↔string logic not DRY.** `hexToBytes` exists, but the inverse encode is copy-pasted four times as `[...uint8].map((b) => b.toString(16).padStart(2, '0')).join('')` in `hashApiKey`, `hashPassword` (hash + salt), and `verifyPassword`. `generateApiKey` uses the same map on random bytes. One typo in pad/radix breaks hash layout or wire format. | ```5:5:packages/auth/src/keys.ts``` · ```30:30``` · ```66:67``` · ```90:90```; decode helper ```8:14``` only. |
| SMELL-P2-002 | P2 | `packages/auth/src/keys.ts` (`hashPassword` / `verifyPassword`) | **PBKDF2 `importKey` + `deriveBits` blocks duplicated.** Both functions open key material from password, call `deriveBits` with `{ name: 'PBKDF2', salt, iterations, hash: 'SHA-256' }` and `256` bits, then hex-encode. Hash path forces `PBKDF2_ITERS`; verify path re-reads iterations from storage. Extracting `pbkdf2Sha256(password, salt, iterations) → Uint8Array` would cut ~15 LOC of twin crypto and keep params aligned. | ```51:68:packages/auth/src/keys.ts``` vs ```70:91``` (near-identical subtle calls). |
| SMELL-P2-003 | P3 | `packages/auth/src/session.ts` (`sessionCookieHeader` / `clearSessionCookieHeader`) | **Cookie attribute assembly duplicated.** Both build `${SESSION_COOKIE}=…; Path=/; HttpOnly; SameSite=Lax; Max-Age=…` + optional `; Secure`. Logout only differs by empty value and `Max-Age=0`. Drift risk if Domain / SameSite options are added later (already anticipated by AGENTS + ARCH-P2-004). | ```79:92:packages/auth/src/session.ts```. |
| SMELL-P2-004 | P3 | `packages/auth/src/keys.ts` · `session.ts` | **Magic numbers without named kit constants (except PBKDF2 iters).** | API key: `new Uint8Array(24)` (```29```); salt: `16` bytes (```52```); derived key: `256` bits (```64```, ```89```); default session cookie TTL: `60 * 60 * 24 * 7` (```84```); hex width `2` / radix `16` inline. Only `PBKDF2_ITERS = 100_000` is named (```45```) — good pattern, incomplete. |
| SMELL-P2-005 | P3 | `packages/auth/src/keys.ts:17–25` | **`timingSafeEqualHex` is `async` with zero `await`.** Body is fully synchronous XOR; return type `Promise<boolean>` forces callers to `await` and suggests I/O. Either drop `async` (breaking but honest) or document “async for API uniformity with hash helpers.” Mild API smell / cognitive tax. | No `await` inside function; still `export async function`. |
| SMELL-P2-006 | P3 | `packages/auth/package.json` | **Dead dependency: `@gosilex/core`.** Declared under `dependencies` but **zero** imports under `packages/auth/src`. Dead graph edge (also ARCH-P2-003). | `package.json` only hit for `@gosilex/core` in this package. |
| SMELL-P2-007 | P3 | `packages/auth/src/keys.ts` · barrel | **Public `timingSafeEqualHex` has no monorepo consumer outside `keys.ts`.** Exported via `index.ts` and unused by apps/packages; only internal to `verifyApiKey` / `verifyPassword`. Not dead *code* (live path), but **over-exported surface** — either keep as intentional primitive or unexport until a second call site. | External `rg timingSafeEqualHex` → package only. |
| SMELL-P2-008 | P3 | `packages/auth/src/keys.test.ts` | **Misnamed test module.** File is `keys.test.ts` but co-locates `describe('session cookie')` covering `signSession` / `verifySession`. Hides session coverage in inventory/coverage tools and confuses ownership (session helpers themselves untested: cookie headers, `parseCookie`). | ```1:67:packages/auth/src/keys.test.ts``` — three top-level describes; only one is keys. |
| SMELL-P2-009 | P3 | `packages/auth/src/session.ts:53–75` | **Complexity pocket: verify fails open on shape, closed only on MAC.** Function is short (~23 LOC) but mixes split, HMAC verify, b64 decode, JSON parse, and a single `exp` check with `as SessionPayload`. Complexity is **logical** (missing guards) more than length — security owns the bug (SEC-P02-001); smell side is “god path for all token failure modes without helper/`parseSessionPayload`.” | One function owns crypto + schema; bare `try/catch` only around JSON path. |
| SMELL-P2-010 | P3 | `packages/auth/src/session.ts:15–25` · `keys.ts` casts | **Micro-noise: multi-branch encode + `as BufferSource` / `as ArrayBuffer` casts.** `b64url` branches string vs `Uint8Array` vs `ArrayBuffer`; salt/`sigBytes.buffer.slice` need casts for Web Crypto typing. Not wrong, but friction that a tiny `asBufferSource(u8)` or always-`Uint8Array` convention would shrink. | ```15:25```, ```61:65``` session; salt casts in keys ```61```, ```87```. |

### Non-findings (healthy)

| Area | Assessment |
|------|------------|
| God files | **None.** Largest runtime files ≈ **102 LOC** (`session.ts`) / **93** (`keys.ts`) — far under ~400. |
| Long functions | **None.** Longest ~**23 LOC** (`verifySession`, then `verifyPassword` ~22). Threshold ~80. |
| Deep nesting | **None.** Max ~2 (`typeof` branches in `b64url`; loops + early returns). |
| Domain leakage | **None.** No share/artefact strings; cookie name `gosilex_session` is kit-branded, fine. |
| KDF confusion | **Avoided.** Comments + separate APIs for keys vs passwords (prior B3 fix). Not a smell. |
| Dead *functions* | **None.** All runtime exports used by tests and/or `example-api` / `mcp` except external use of `timingSafeEqualHex` (SMELL-P2-007). |
| Naming (public API) | **Clear.** `hashApiKey` / `verifyApiKey` / `signSession` / `parseBearer` / `SESSION_COOKIE` are consistent. |
| Complexity overall | **Low.** Pure functions, no classes, no state machines, no god switch. |
| Interim HMAC vs Better Auth | Documented intentional debt (ADR-0002) — architecture, not a code smell in-file. |

## Metrics

| Metric | Value |
|--------|------:|
| Files analyzed (src + package config) | **7** (`index.ts`, `keys.ts`, `session.ts`, `keys.test.ts`, `package.json`, `tsconfig.json`, `vitest.config.ts`) |
| Runtime source modules (excl. tests) | **3** |
| Test modules | **1** (covers keys + session) |
| LOC runtime (approx., excl. tests) | **~214** (`keys` ~93, `session` ~102, `index` ~19) |
| Max file LOC (runtime) | **~102** (`session.ts`) |
| Max function LOC | **~23** (`verifySession`) |
| God files (>400 LOC) | **0** |
| Functions >80 LOC | **0** |
| Nested depth max | **2** |
| Issues total | **10** |
| P0 | **0** |
| P1 | **0** |
| P2 | **2** |
| P3 | **8** |
| Duplicated logic clusters (meaningful DRY) | **3** (hex encode; PBKDF2 derive; cookie header) |
| Magic number clusters | **1** (key/salt/bits/TTL; iters already named) |
| Dead deps | **1** (`@gosilex/core`) |
| Over-exported symbols (no external consumer) | **1** (`timingSafeEqualHex`) |
| Coverage snapshot (context) | total lines **85.98%** · `keys.ts` **100%** lines · `session.ts` **74.35%** lines / **62.5%** functions · barrel **0%** |

**Inventory:**

```text
packages/auth/
  package.json          # unused @gosilex/core dep
  tsconfig.json
  vitest.config.ts      # floors 80/80/70/70
  src/
    index.ts            # barrel (~19 LOC)
    keys.ts             # API keys + password KDF (~93 LOC)
    session.ts          # HMAC cookie session + cookie helpers (~102 LOC)
    keys.test.ts        # keys + password + session (misnamed co-location)
  coverage/             # excluded from smell scan (metrics only)
```

**Function size sketch (approx. LOC body):**

| Function | LOC | Notes |
|----------|----:|-------|
| `verifySession` | ~23 | longest; multi-step |
| `verifyPassword` | ~22 | twin of hash path |
| `hashPassword` | ~18 | |
| `b64url` | ~11 | type branches |
| `timingSafeEqualHex` | ~9 | sync-in-async |
| others | ≤9 | fine |

## Recommendations

1. **Extract `bytesToHex` / keep `hexToBytes` pair (SMELL-P2-001)**  
   - Single encode helper used by `hashApiKey`, password hash/salt, `verifyPassword`, `generateApiKey`.  
   - Optional: `hexToBytes` already private — export only if tests or consumers need it; prefer keep private.

2. **Extract `pbkdf2Sha256Bits(password, salt, iterations)` (SMELL-P2-002)**  
   - Shared by hash + verify; verify still owns parse/format/timing-safe compare.  
   - Place to clamp iteration bounds later (security SEC-P02-002/004) without two edit sites.

3. **Unify cookie header builder (SMELL-P2-003)**  
   - e.g. `buildSessionCookie({ value, maxAge, secure, …opts })` used by set and clear (`value: ''`, `maxAge: 0`).  
   - Same change site when adding `domain` / `sameSite` (ARCH-P2-004).

4. **Name crypto/size constants (SMELL-P2-004)**  
   - `API_KEY_BYTES = 24`, `PBKDF2_SALT_BYTES = 16`, `PBKDF2_BITS = 256`, `DEFAULT_SESSION_MAX_AGE_SEC = 60 * 60 * 24 * 7`.  
   - Documents kit contract next to `PBKDF2_ITERS`.

5. **Make `timingSafeEqualHex` sync or justify async (SMELL-P2-005)**  
   - Prefer sync `function timingSafeEqualHex(…): boolean` — call sites already `await` only for uniformity; removing async is a minor semver bump for a `0.0.1` private package.

6. **Drop unused `@gosilex/core` (SMELL-P2-006)**  
   - Re-add when guards throw `AppError` from this package.

7. **Surface hygiene (SMELL-P2-007/008)**  
   - Unexport `timingSafeEqualHex` until a second consumer, **or** document as public primitive in package README/JSDoc.  
   - Split or rename tests: `session.test.ts` + `keys.test.ts` (or `auth.test.ts`); add cases for cookie helpers / `parseCookie` (test-quality + ARCH-P2-005).

8. **Optional `parseSessionPayload` helper (SMELL-P2-009)**  
   - Keep `verifySession` thin: MAC ok → parse+validate shape → exp check. Aligns with security hardening without growing the function further.

9. **Do not “refactor for metrics”**  
   - No file split needed at ~100 LOC. Avoid inventing ports/guards in this PR set unless architecture wave promotes them.

## Residual risks

| Risk | Notes |
|------|--------|
| Hex encode drift | Until SMELL-P2-001 fixed, a partial edit can break stored hash format compatibility. |
| PBKDF2 param drift | Twin derive blocks can disagree on hash alg or bit length if only one is updated. |
| Cookie flag drift | Set vs clear cookies with different flags → sticky sessions in some browsers. |
| Async compare API | Future maintainers may wrap unnecessary microtasks or assume async equality “does crypto.subtle.” |
| Unused core dep | Signals false coupling; may hide that auth intentionally returns `null`/`false` not `AppError`. |
| Test inventory blind spot | Session helpers under-tested while suite “lives” under keys filename — regressions on cookie strings go unnoticed (coverage already flags `session.ts` functions 62.5%). |
| Security / arch overlap | Immortal session without `exp`, PBKDF2 iter DoS, missing SessionPort are **not** re-scored here — see `security/P02-auth.md`, `architecture/P02-auth.md`. |
| Interim HMAC | Acceptable demo debt per ADR-0002; smell report does not demand Better Auth rewrite. |

**Overall code-smell score for P2 auth:** high quality / low structural debt. Treat the two P2 DRY items as **cheap consolidations before auth surface growth** (guards, cookie options, stronger password policy); no emergency refactors on length or god-file grounds.
