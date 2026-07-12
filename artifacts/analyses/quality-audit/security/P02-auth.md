# Security — P2 auth

**Partition:** `packages/auth/**` (`session.ts`, `keys.ts`, `keys.test.ts`, barrel)  
**Date:** 2026-07-12  
**Scope:** OWASP-relevant crypto for Workers Web Crypto — password KDF, API keys, HMAC sessions, cookie flags, secret handling, negative tests  
**Out of scope:** App-level guards/CORS/headers (`apps/example-api` → Security P5); Better Auth product swap (ADR-0002); product `share-*`  
**Auditor posture:** read-only on sources; write only this report

## Summary

`@gosilex/auth` is a small, dependency-light crypto helper package with a **sound primitive split**: high-entropy `sk_` keys → unsalted SHA-256 + constant-time hex compare; user passwords → PBKDF2-SHA-256 with random 16-byte salt; browser sessions → HMAC-SHA256 over base64url JSON + `exp`. Cookie builders set **HttpOnly** and **SameSite=Lax** by default. The package **never logs** tokens or secrets (no `console.*`).

No **P0 remote exploit** was found in isolation: forging sessions or offline-breaking API keys requires the HMAC secret or brute-forcing ~192 bits of key material. Remaining issues are **correctness of fail-closed verify**, **iteration policy / DoS**, **OWASP work-factor gap**, **exception paths on malformed tokens**, and **test holes on negative security cases**. App consumers currently mitigate several risks (`SESSION_SECRET` min 32 + fail-closed outside dev/test; `Secure` via `useSecureCookie`) — those controls are **not** enforced inside the package.

## Findings

| ID | Severity | File | Finding | Evidence |
|----|----------|------|---------|----------|
| SEC-P02-001 | P1 | `packages/auth/src/session.ts` (`verifySession`) | **Session payload shape is not validated — missing / non-numeric `exp` bypasses expiry.** After a valid HMAC, code does `if (payload.exp < Math.floor(Date.now() / 1000)) return null` then returns the cast object. In JS, `undefined < number` is **false**, so a signed body **without** `exp` (or with `exp: {}` / other non-coercible value → NaN comparison false) is accepted as a **non-expiring session**. Attacker still needs the signing secret to mint such a body; risk is defense-in-depth + future signer bugs / handcrafted tokens / migrations that omit `exp`. | ```53:75:packages/auth/src/session.ts``` — `as SessionPayload` with only `exp` comparison; no `typeof exp === 'number' && Number.isFinite(exp)` / required `sub` checks. |
| SEC-P02-002 | P1 | `packages/auth/src/keys.ts` (`verifyPassword`) | **Stored PBKDF2 `iterations` is fully attacker-controlled with no upper bound → login CPU DoS if hash row is writable.** Parser accepts any `iterations >= 1`. A planted hash `pbkdf2$2e9$…$…` (or very large int) makes `deriveBits` burn Worker CPU on every password check. DB write often implies full compromise, but partial write (SQLi update of hash column, backup restore abuse, multi-tenant hash import) still enables auth-path DoS. | ```70:91:packages/auth/src/keys.ts``` — `Number(parts[1])` then `iterations < 1` only; no `iterations > MAX` or `iterations < PBKDF2_ITERS` floor. |
| SEC-P02-003 | P2 | `packages/auth/src/keys.ts` | **PBKDF2 work factor 100 000 is below current OWASP recommendation for PBKDF2-HMAC-SHA256 (600 000).** Salt (16 bytes) and 256-bit derived key are fine; iteration count is the main gap vs Password Storage Cheat Sheet. Workers CPU budget may justify a documented lower target, but 100k should be treated as **legacy/demo** not “prod password bar” without ADR. | `PBKDF2_ITERS = 100_000` (`keys.ts:45`); OWASP cheat sheet: PBKDF2-HMAC-SHA256 **600 000** recommended. |
| SEC-P02-004 | P2 | `packages/auth/src/keys.ts` (`verifyPassword`) | **No minimum iteration floor on verify → hash downgrade if stored format is writable.** Accepts `iterations = 1`. Same threat model as SEC-P02-002 (write hash → weak offline crackability of that account). | Same parse path; only `iterations < 1` rejected. |
| SEC-P02-005 | P2 | `packages/auth/src/session.ts` (`verifySession`, `fromB64url`) | **Malformed tokens can throw instead of fail-closed `null`.** `fromB64url` → `atob` is outside the JSON `try/catch`. Invalid base64 in body/sig, or `crypto.subtle.verify` **DataError** on bad signature length, can surface as uncaught exceptions → 500 rather than anonymous reject. Enables error-path noise / inconsistent client handling; not a crypto break. | ```53:75:packages/auth/src/session.ts``` — only `JSON.parse` / decode path wrapped; `fromB64url` at L57–58 and `subtle.verify` unguarded. |
| SEC-P02-006 | P2 | `packages/auth/src/session.ts` (`signSession` / `hmacKey`) | **No minimum HMAC secret entropy enforced in package.** Empty or short secrets are imported as raw HMAC keys. App layer (`getSecret` min 32, fail-closed prod) mitigates for example-api; **other kit consumers** can ship weak secrets silently. | ```37:50:packages/auth/src/session.ts``` — `importKey('raw', encode(secret), …)` with no `secret.length` / byte check. |
| SEC-P02-007 | P2 | `packages/auth/src/session.ts` (`sessionCookieHeader`) | **`Secure` is opt-in (default off).** HttpOnly + SameSite=Lax always set — good. Production must pass `secure: true` or cookies ride cleartext HTTP. Example-api maps this via `useSecureCookie(env)`; package helpers alone do not env-gate. | ```79:86:packages/auth/src/session.ts``` — `opts?.secure ? '; Secure' : ''`. ADR-0002: “Secure when not local”. |
| SEC-P02-008 | P2 | `packages/auth/src/keys.test.ts` | **Negative security coverage incomplete relative to threat surface.** Present: wrong API key, wrong password, wrong session secret, expired `exp`. **Absent (security-relevant):** missing/malformed token segments; invalid base64; payload without `exp` / non-number `exp`; empty secret; `verifyPassword` with `iterations=1` / huge iterations / wrong part count; `timingSafeEqualHex` length mismatch; cookie header flags (`HttpOnly`, `Secure`, `SameSite`, logout `Max-Age=0`); `parseCookie` edge cases; empty Bearer after `Bearer `; truncated hex expected hash. | Single test file cases L12–67; coverage: `session.ts` lines **74.35%** / functions **62.5%**; `keys.ts` lines **100%** but branch gaps on negative parses. |
| SEC-P02-009 | P3 | `packages/auth/src/keys.ts` (`parseBearer`) | **No max length on Bearer token before SHA-256.** Huge `Authorization` values are hashed (DoS micro-amplification). Prefer reject if `plaintext.length` exceeds e.g. `sk_` + 128 hex / 256 chars. | ```34:38:packages/auth/src/keys.ts``` — `^Bearer\s+(.+)$` captures rest unbounded. |
| SEC-P02-010 | P3 | `packages/auth/src/keys.ts` (`hashApiKey`) | **API key storage is plain SHA-256 (no server-side pepper).** Acceptable for ~192-bit `sk_` (rainbow tables infeasible); pepper would limit damage if DB + not app secrets leak together. Document as intentional high-entropy pattern. | ```1:6:packages/auth/src/keys.ts```; `generateApiKey` 24 bytes CSPRNG (`crypto.getRandomValues`). |
| SEC-P02-011 | P3 | `packages/auth/src/keys.ts` (`hashPassword`) | **Optional caller-supplied salt** allows fixed salts if misused outside tests. Default path uses 16 random bytes — correct. | `salt ?? crypto.getRandomValues(new Uint8Array(16))` (`keys.ts:52`). |
| SEC-P02-012 | P3 | `packages/auth/src/session.ts` | **No cookie name prefix (`__Host-` / `__Secure-`), no `Domain` knobs, no CSRF double-submit helper.** SameSite=Lax + HttpOnly is a solid baseline for same-site SPA; cross-site / multi-subdomain need documented upgrade path (AGENTS). | Cookie builders L79–91; fixed name `gosilex_session`. |
| SEC-P02-013 | P3 | `packages/auth/src/keys.ts` | **No Unicode normalization (NFC) before password KDF** — rare dual-encoding login failures / minor interoperability issue, not a classic bypass. | `TextEncoder().encode(password)` raw (`keys.ts:55`, `80`). |
| — | (positive) | `keys.ts` | **Password vs API key KDFs correctly separated** (prior B3 fix). SHA-256 alone is not used for passwords. | `hashPassword` / `verifyPassword` vs `hashApiKey`; comment L48–49. |
| — | (positive) | `keys.ts` | **API key entropy ~192 bits; verify uses length-checked XOR constant-time compare on digests.** | `generateApiKey` 24×`getRandomValues`; `timingSafeEqualHex` L17–25; `verifyApiKey` L40–43. |
| — | (positive) | `session.ts` | **HMAC-SHA256 via Web Crypto; key `extractable: false`; payload format is not alg-negotiable (no JWT `alg` confusion).** Body is b64url without `.`; split is unambiguous. | `hmacKey` L37–44; `sign`/`verify` L46–66. |
| — | (positive) | `session.ts` | **Cookie flags baseline correct for kit:** `Path=/; HttpOnly; SameSite=Lax`; clear cookie mirrors flags with `Max-Age=0`. Token charset (b64url + `.`) avoids cookie-attribute injection via `;`. | L79–91. |
| — | (positive) | package | **No secret logging; pure functions; no plaintext key storage helpers.** | `rg console` under `packages/auth` → none. |
| — | (positive) | `keys.test.ts` | **Core happy + some negative paths exercised** (wrong key/password, bad HMAC secret, expired session). | L12–67. |

## Metrics

| Metric | Value |
|--------|--------|
| Files in partition (source) | `src/keys.ts`, `src/session.ts`, `src/index.ts`, `src/keys.test.ts` |
| Approx. LOC (crypto surface) | ~195 (`keys` ~93, `session` ~102) |
| Crypto primitives | HMAC-SHA256 (session); SHA-256 (API key); PBKDF2-HMAC-SHA256 (password); CSPRNG `getRandomValues` |
| PBKDF2 iterations (hash) | **100 000** (OWASP rec. 600 000) |
| PBKDF2 salt | 16 bytes random (default) |
| PBKDF2 dkLen | 256 bits |
| API key material | 24 bytes → 48 hex + `sk_` prefix (~192-bit) |
| API key at-rest | SHA-256 hex (64 chars), no salt/pepper |
| Session MAC | `b64url(JSON).b64url(HMAC-SHA256)` |
| Session claims validated | **`exp` comparison only** (no type/required-field schema) |
| Cookie: HttpOnly | **yes** (always) |
| Cookie: SameSite | **Lax** (always) |
| Cookie: Secure | **optional, default false** |
| Secret logging in package | **0** |
| Test file(s) | 1 (`keys.test.ts` covers keys + session) |
| Coverage snapshot | total lines **85.98%**; `keys.ts` **100%** lines; `session.ts` **74.35%** lines / **62.5%** functions; floors 80/80/70/70 |
| Findings | **13** · P0: **0** · P1: **2** · P2: **6** · P3: **5** · positives: **6** |

### Threat model (package boundary)

| Asset | Threat | Package control | Residual |
|-------|--------|-----------------|----------|
| Session integrity | Forge cookie | HMAC-SHA256 | Secret strength & rotation; no server-side revoke / `jti` |
| Session lifetime | Immortal / extended session | `exp` check | Shape validation gap (SEC-P02-001); cookie Max-Age independent of `exp` |
| API key confidentiality at rest | DB dump | SHA-256 only | Offline crack only if key entropy collapses; no pepper |
| Password offline attack | DB dump | PBKDF2 + salt | Work factor below OWASP (SEC-P02-003) |
| Auth CPU | Hash field poison | none on iterations | SEC-P02-002 |
| XSS → session theft | Steal cookie | HttpOnly | Still need CSP/XSS elsewhere |
| CSRF | Cross-site cookie use | SameSite=Lax | Cross-site POST edge cases; Origin checks are app-layer |

## Recommendations

1. **P1 — Harden `verifySession` (SEC-P02-001 + SEC-P02-005)**  
   - Wrap entire verify body in try/catch → always `null` on any error.  
   - After parse, require: `typeof sub === 'string' && sub.length > 0`, `typeof email === 'string'`, `typeof exp === 'number' && Number.isFinite(exp)`.  
   - Optionally clamp clock skew (`exp + skew`).  
   - Unit tests: omit `exp`, `exp: "soon"`, invalid base64, empty token, extra `.` segments, truncated sig.

2. **P1 — Bound PBKDF2 iterations on verify (SEC-P02-002 / 004)**  
   - e.g. `MIN_ITERS = PBKDF2_ITERS` (or 100_000) and `MAX_ITERS = 1_200_000` (2× OWASP). Reject outside range with `false` (same as bad password).  
   - Prefer re-hash on login when stored iters &lt; current constant (lazy upgrade).

3. **P2 — Raise or document work factor (SEC-P02-003)**  
   - Target OWASP **600_000** if Worker CPU budget allows demo login latency; or ADR: “demo KDF 100k; product uses Better Auth / higher cost”.  
   - Do not silently leave 100k as implied prod password standard.

4. **P2 — Enforce secret minimum in `signSession` / `verifySession` (SEC-P02-006)**  
   - Reject `secret` with `length < 32` (UTF-8 bytes preferred) so package is safe without relying on example-api only.

5. **P2 — Cookie helper defaults (SEC-P02-007)**  
   - Keep dev-friendly API but document `secure: true` required for staging/prod; consider `sessionCookieHeader(token, { secure: boolean })` making `secure` **required** (no default) to force callers to choose.  
   - Mirror options on clear.

6. **P2 — Expand negative tests (SEC-P02-008)**  
   - Table-driven cases for SEC-P02-001/005 paths, password format abuse, cookie attribute strings (`toContain('HttpOnly')`, `SameSite=Lax`, Secure on/off, Max-Age=0).  
   - Aim session function coverage ≥ package floor (functions 70% currently barely package-wide; session alone 62.5%).

7. **P3 — Hygiene**  
   - Cap Bearer / key plaintext length before hash.  
   - Optional HMAC pepper env for API keys if multi-tenant DB dump is in threat model.  
   - NFC normalize passwords if shipping user-facing credentials long-term.  
   - When promoting product sessions: server-side session store or Better Auth (ADR-0002) for **revocation**.

## Residual risks

| Risk | Why it remains | Owner |
|------|----------------|-------|
| **Stateless HMAC sessions cannot be revoked** before `exp` | No denylist / session table in package by design (ADR-0002 interim) | Product swap / app denylist |
| **Secret rotation** | No `kid` / dual-secret verify | App ops when rotating `SESSION_SECRET` |
| **JS constant-time limits** | XOR loop is best-effort in JIT; Web Crypto `verify` is preferred for MAC (already used for sessions) | Accept for digest compare; keep MAC on Web Crypto |
| **Secure / secret policy lives partly in apps** | Package is pure helpers | Enforce in package (recs 4–5) + keep app fail-closed |
| **Demo passwords in seed** | Kit intentional placeholders — not package crypto failure | Never ship demo password hashes to real users |
| **Offline password strength after DB leak** | Depends on user password + KDF cost | Raise iters / Argon2 only if Web Crypto allows later; prefer Better Auth credential path for product |

---

**Bottom line:** Kit auth crypto is **directionally correct** and already fixed the critical “passwords via unsalted SHA-256” mistake. Treat **payload validation + PBKDF2 iteration bounds** as the next security hardening before any non-demo credential surface; close negative tests so regressions cannot reintroduce immortal sessions or auth DoS via stored hashes.
