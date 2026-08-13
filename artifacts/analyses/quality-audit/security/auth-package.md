# Security audit — `packages/auth` (+ SessionPort compose)

| | |
|---|---|
| **Domain** | Security |
| **Partition** | `packages/auth` · related SessionPort / dual-auth / RBAC usage in `apps/example-api` |
| **Date** | 2026-08-12 |
| **ADRs** | [0002](../../../docs/architecture/adr/0002-session-hmac-interim-vs-better-auth.md) (BA-only · D6 timing-safe) · [0003](../../../docs/architecture/adr/0003-multi-tenant-rbac-modules.md) (D11 org-bound keys · roles) · [0006](../../../docs/architecture/adr/0006-api-key-format-prefix-checksum.md) (**proposed**, non-normative) |
| **Secrets** | `.dev.vars` **not** read · only missing patterns / public code paths |

## Summary

`@kit/auth` is a **pure, Workers-safe** identity/RBAC helper package with a solid dual-path design: Better Auth session via injectable `SessionPort` **or** Bearer `sk_`, Bearer preferred, invalid Bearer **fails closed** (does not fall through to cookie). API keys are **SHA-256 hashed** at rest, verified with **byte-XOR constant-time** compare (`timingSafeEqualHex` / ADR-0002 D6). Org-role and module-grant helpers are **default-deny** on unknown strings.

**HMAC session path is gone from runtime code** (no `createHmacSessionPort`, no HMAC login routes). Residual HMAC-era **surface** remains on the public `SessionPort` type (`sign` / `verify` / `secret`) and app env (`SESSION_SECRET` helpers) — architecture debt with product-fork risk, not an active dual stack.

**Critical multi-tenant guarantees (D11)** are correctly implemented in **example-api compose**, not in the pure package: org-bound mint, membership + active-org recheck on every key use, null-org keys never authenticate, mint/revoke session-only, tenant routes require `keyOrganizationId` match. Package-level `resolveDualAuth` will still authenticate a row with `organizationId: null` if a product injects a naïve `findApiKeyByPrefix` — **consumer footgun**, not a kit dogfood hole.

**No P0** issues found in package + dogfood compose. Highest items are **P1 footgun** (D11 not package-enforced) and several **P2** residual/HMAC-era + key-format / schema-hardening items.

### Verdict (posture)

| Area | Posture |
|---|---|
| BA-only session (ADR-0002) | **Strong** — port fail-closed; app factory fail-closed on secret/URL; cookies HttpOnly · SameSite=Lax · Secure outside dev |
| Dual-path cookie \| `sk_` | **Strong** — Bearer wins; invalid Bearer ≠ cookie fallback |
| API key storage | **Strong** — hash only · prefix index · never list plaintext |
| Timing-safe compares | **Strong** on digest paths (sk_ + kit PBKDF2) |
| Org/role fail-closed | **Strong** pure helpers; app wires ceiling + grantsDominate |
| D11 org-bound keys | **Strong in example-api** · **package does not own it** |
| Residual HMAC surface | **Present (type/env)** · no active HMAC crypto |
| ADR-0006 key format | **Not implemented** (proposed) — Stripe prefix noise + 36-bit UNIQUE prefix |

---

## Findings

| ID | Severity | File | Finding | Evidence | Recommendation |
|----|----------|------|---------|----------|----------------|
| S1 | **P1** | `packages/auth/src/require-auth.ts` · product contract | **D11 org-binding is not enforced inside `@kit/auth`** — only identity dual-path. A product that implements `findApiKeyByPrefix` without membership/active-org recheck (or that returns rows with `organizationId: null`) gets subject-global keys. | `resolveDualAuth` returns auth when hash matches even if `organizationId` is null/undefined (`require-auth.ts` L58–62). Dogfood fix lives in `apps/example-api/src/middleware/require-auth.ts` `findKeyRecord` (null org → null; membership + `org.status === 'active'`). Mint fail-closed is `services/auth.ts` L60–63. Package types still document “null = unbound legacy key”. | Document as **mandatory product inject recipe** in package README / ADR-0002 product inject; optionally add `requireOrgBoundKey: true` option on ports that rejects missing `organizationId` at package layer; keep membership recheck app-side (needs DB). Add a zero-edit / consumer checklist item. |
| S2 | **P2** | `packages/auth/src/session-port.ts`, `better-auth-port.ts`, `require-auth.ts` | **HMAC-era SessionPort surface still public after BA-only** | `SessionPort` still requires `sign`/`verify`; BA adapter `sign` throws, `verify` always `null`. `ResolveSessionInput.secret` + `DualAuthPorts.secret` unused by BA `resolveSession`. ADR-0002 D2 retired HMAC; D3 normative is `resolveSession`. | Narrow public type to `resolveSession` + cookie helpers; drop `sign`/`verify`/`secret` (or `@deprecated` + banlist one release). |
| S3 | **P2** | `packages/auth/src/keys.ts`, `index.ts` · `apps/example-api/src/seed/seed-db.ts` | **Dual password KDF story** — kit PBKDF2 still first-class public API while sessions use Better Auth crypto | Kit exports `hashPassword`/`verifyPassword` (PBKDF2 WebCrypto, floor/ceil iters). Seed writes `demo_users.password_hash` via `@kit/auth` **and** BA `account.password` via `better-auth/crypto`. Login is BA-only. Risk: product stores kit PBKDF2 and expects BA verify (or reverse). | Mark kit password helpers **legacy/demo-table only** or un-export from barrel once `demo_users` unused for auth; never use `hashApiKey` for passwords (already documented). |
| S4 | **P2** | `apps/example-api/src/db/schema.ts` · migrations `0001`/`0008` | **`api_keys.organization_id` remains nullable** — integrity relies on app code, not schema | `organizationId: text('organization_id')` optional. Migration `0008` added nullable column. App mint refuses missing org; `findKeyRecord` denies null. DB still allows hand-inserted or legacy unbound rows. | After dual-accept cleanup: `NOT NULL` + backfill/re-mint; or CHECK constraint. Keep app deny as defense-in-depth. |
| S5 | **P2** | `packages/auth/src/keys.ts` · ADR-0006 | **`sk_` format: Stripe collision + 36-bit UNIQUE prefix + no offline checksum** (ADR-0006 proposed) | `generateApiKey` = `sk_` + 24 random bytes hex (192-bit entropy — OK). `apiKeyPrefix` = first 12 chars (`sk_` + 9 hex = **36 bits** UNIQUE). Scanner cannot offline-verify; Stripe detectors collide. Not an auth bypass. | Accept ADR-0006 Option C when ready (vendor prefix + checksum + wider prefix); dual-accept or clean re-mint (kit pre-product). Keep `verifyApiKey` as sole auth boundary. |
| S6 | **P2** | `apps/example-api/src/lib/session-env.ts` · `env.schema.ts` | **`SESSION_SECRET` residual after HMAC retirement** | `getSecret` still fail-closes / denylists placeholders; not on BA session path (`BETTER_AUTH_SECRET` is). Operators may still set a dead secret; confuses “which secret is live”. | Deprecate `SESSION_SECRET` when no caller remains; docs: BA secret is the only session secret; keep placeholder denylist on `BETTER_AUTH_SECRET` only. |
| S7 | **P2** | `packages/auth/src/require-auth.ts` L46–57 | **API key auth path: early exits before hash verify** can distinguish missing / revoked / expired / wrong-secret via timing | Order: prefix parse → DB lookup → `revokedAt` → `expiresAt` → `verifyApiKey`. Length mismatch on digests also early-returns (ADR-0002 D6 documents digest-length leak only). Online full-key brute force remains impractical (192-bit). | Optional harden: always run `hashApiKey` + compare to dummy hash when row missing/revoked (constant work); rate-limit Bearer failures per IP if abuse appears. Not P0 given entropy. |
| S8 | **P2** | `packages/auth` consumer surface · `org-context.ts` (app) | **Package RBAC helpers do not cover custom roles for org capabilities** — fail-closed correctly, but products must not use `roleHasCapability` alone for custom roles | `roleAtLeast` / `roleHasCapability` return false for non-system role strings (`org-roles.ts` L17–19). Module access uses DB grants + `accessAllows` (`module-grants.ts`, app `resolveModuleAccess`). Custom roles cannot pass `manage_members` — **good** against privilege escalation. | Document: system capabilities = system roles only; custom roles = module grants only. Keep `assertAssignableRole` ceilings (system via `canInviteRole`, custom via `grantsDominate`). |
| S9 | **P3** | `packages/auth/src/better-auth-port.ts` L79–84 | **Cookie name override via string `.replace` is brittle** | Builds with `SESSION_COOKIE` then replaces name. Mis-replace if format changes. | Pass `cookieName` into `sessionCookieHeader` / clear helpers (structured builder). |
| S10 | **P3** | `packages/auth/src/better-auth-port.ts` L74–77 | **`resolveSession` swallows all errors as null** | `catch { return null }` — misconfig can look like “logged out”. App already throws if `betterAuth` unbound. | Keep fail-closed for authz; log debug in non-prod at app middleware if needed; never leak stack to client. |
| S11 | **P3** | `packages/auth/src/session.ts` | **Kit `sessionCookieHeader` can emit Set-Cookie with arbitrary token** if misused | Helpers set HttpOnly · SameSite=Lax · optional Secure — good attributes — but do not authenticate. Real issuance is BA handler (`lib/better-auth.ts` advanced.cookies). | Prefer BA-owned Set-Cookie only; treat kit helpers as clear-cookie / name SSoT; avoid app routes that set session cookies from kit `sign`. |
| S12 | **P3** | `packages/auth/src/keys.ts` `hexToBytes` | **Non-hex characters in stored hash** → NaN bytes; compare still false (fail-closed) but not validated | No alphabet check before parseInt. | Reject non-`[0-9a-f]+` digests early as false; keep length parity. |
| S13 | **P3** | `packages/auth/src/keys.ts` L28–31 | **`sk_` greppable as Stripe-like; no checksum** (detection / ops, not auth) | ADR-0006 §1–2; detector workarounds (#51/#54). | Track ADR-0006 acceptance; update `trufflehog-detectors.yaml` same commit as format change. |
| S14 | **P3** | App compose (reference) | **No dedicated rate limit on Bearer verify** (only BA sign-in / mint / invite) | `assertRateLimit` on BA sensitive paths, key mint, invites — not on every `requireAuth` Bearer attempt. | Accept while entropy high; add IP+prefix throttle if scanning observed. |

### Non-findings (healthy / intentional)

| Area | Evidence |
|------|----------|
| **HMAC runtime removed** | No `createHmacSessionPort` / `AUTH_SESSION_ADAPTER` in TS sources; `routes/auth.ts` BA-only; health test asserts BA. |
| **Cookie attributes (BA)** | `lib/better-auth.ts`: `httpOnly: true`, `sameSite: 'lax'`, `path: '/'`, `secure` via `useSecureCookie` (Secure outside `development`\|`test`). |
| **Secret handling (BA)** | `getBetterAuthSecret`: min 32 · kit placeholder denylist outside dev · `assertBetterAuthConfigured` requires URL outside dev. Placeholders not pasted here. |
| **API key never stored plaintext** | `mintApiKey` → `hashApiKey` + `apiKeyPrefix` only; `listApiKeysForSubject` selects no `keyHash`. |
| **Timing-safe sk_ verify** | `verifyApiKey` → `timingSafeEqualHex` XOR loop; tests assert wrong key false; ADR-0002 D6 + `@invariant` marker. |
| **Password PBKDF2 floors** | `PBKDF2_MIN_ITERS` / `MAX_ITERS` reject downgrade / CPU DoS planted hashes. |
| **Bearer vs session fail-closed** | `CP-AUTH-DUAL`: invalid Bearer with valid session → 401. |
| **BA SessionPort fail-closed** | Missing user, missing/unparseable `expiresAt`, expired → null; `sign` throws. |
| **Org-bound dogfood** | Mint requires org + membership; null-org row → 401; membership removal → 401; key hop to other org → 403; mint/revoke session-only. |
| **Invite / assign ceiling** | `canInviteRole`: owner→admin/member/reader; admin→member/reader only; never owner. Custom targets: `grantsDominate`. Custom actors cannot assign system roles. |
| **Module grants fail-closed** | `accessAllows(null/disabled)` false; missing role/grant → deny; system grants immutable. |
| **Super_admin break-glass** | Read only with flag; write needs `allowSuperAdminWrite`; **never** `delete_org` via bypass. Staff has **no** membership bypass. |
| **CSRF defense-in-depth** | `originGuard`: cookie mutations require Origin allowlist; Bearer may omit Origin. Cookie name from SSoT. |
| **BA org mutation surface denied** | Kit routes own invites/memberships; BA org mutation paths 404. |
| **Public signup default off** | `disableSignUp: !allowPublicSignup`; magic link same flag. |
| **Package purity** | No Hono/Drizzle/CF imports in `packages/auth/src`; peer `better-auth` optional. |

---

## Metrics

| Metric | Value |
|--------|------:|
| Package source modules (`packages/auth/src`, excl. tests) | **10** |
| Package test modules | **3** (`keys`, `org-roles`, `module-grants`) |
| Migrations in package | **3** (BA core · org · platform modules SQL) |
| Public barrel symbol groups | SessionPort · dual-auth · sk_ · password · cookies · org-roles · module-grants |
| Active HMAC session implementation | **0** |
| Residual HMAC-era API fields | `sign`, `verify`, `secret` on SessionPort / DualAuthPorts |
| sk_ entropy (generateApiKey) | **192 bits** (24 bytes) |
| Lookup prefix entropy | **36 bits** (9 hex) UNIQUE |
| Digest algorithm (API keys) | SHA-256 hex (no salt — appropriate for high-entropy tokens) |
| Password KDF (kit, non-session) | PBKDF2-SHA-256 · 100k iters · min=max floor |
| Timing-safe digest compare | **Yes** (`timingSafeEqualHex`) |
| Example-api D11 recheck on key use | **Yes** (membership + active org) |
| Schema `organization_id` NOT NULL | **No** (nullable) |
| ADR-0006 status | **proposed** · `normative: false` |
| Issues filed this audit | **P0=0 · P1=1 · P2=7 · P3=6** |

### Threat model map (auth package + dogfood)

```text
Browser SPA ──cookie kit_session──► BA getSession ──SessionPort──► subject (session)
Machine/MCP ──Bearer sk_──────────► prefix lookup → hash verify ──► subject + keyOrganizationId
                                      │
                                      └─ example-api only: org active ∧ membership ∧ orgId non-null

Tenant route: requireAuth → requireOrgContext
  api_key ⇒ keyOrganizationId must equal path/header org (no membership hop)
  session ⇒ membership or super_admin break-glass (flagged)

Grants: platform.available ∧ org.enabled ∧ role grant (read|write|disabled)
  empty/missing = deny
```

---

## Recommendations

### P0
*None.* Do not block kit extractibility on auth package crypto alone.

### P1 (before product consumers scale)
1. **S1 — Product D11 inject contract**  
   Codify in `@kit/auth` docs / `docs/product-consumer-contract.md` / inject recipe:  
   `findApiKeyByPrefix` **must** (a) require non-null `organizationId`, (b) re-check membership, (c) re-check org active — matching `findKeyRecord`.  
   Optional package flag `rejectUnboundApiKeys` default true for new ports.

### P2 (hardening / debt)
2. **S2 — Trim SessionPort** to BA-only (`resolveSession` + cookies); remove product temptation to reimplement HMAC `sign`.  
3. **S3 — Close dual password API** (un-export kit PBKDF2 or fence as demo-only).  
4. **S4 — Schema**: migrate `api_keys.organization_id` toward `NOT NULL` after legacy purge.  
5. **S5 — ADR-0006**: accept and implement vendor prefix + checksum when secret-scan pain warrants; same-commit detector update.  
6. **S6 — Drop or deprecate `SESSION_SECRET`** path once unused.  
7. **S7 — Optional constant-work key verify** on miss/revoke (defense-in-depth).  
8. **S8 — Document** custom-role vs system-capability split for product eng (already fail-closed).

### P3 (hygiene)
9. Structured cookie name builder (**S9**); non-hex digest reject (**S12**); Bearer verify rate limit if needed (**S14**); avoid kit-set session cookies (**S11**).

### Keep as-is (do not “fix”)
- Dual-path Bearer-preferred + invalid Bearer fail-closed.  
- Org membership recheck every key use (TOCTOU-aware).  
- Mint/revoke session-only (no key-chain expansion).  
- Pure package without DB bindings (apps own policy + secrets).  
- `grantsDominate` / `canInviteRole` ceilings and immutable system grants.  
- Super_admin never silent delete_org via bypass.

---

## ADR residual checklist

| ADR claim | Code status |
|-----------|-------------|
| ADR-0002 D1 BA-only browser session | **Met** — `createBetterAuthSessionPort` + BA handler |
| ADR-0002 D2 HMAC retired | **Met** runtime · **partial** public type surface (S2) |
| ADR-0002 D4 secrets fail-closed | **Met** in app `session-env` / BA factory |
| ADR-0002 D6 constant-time digest compare | **Met** — `timingSafeEqualHex` on sk_ + kit password verify |
| ADR-0003 D11 org-bound sk_ | **Met** example-api · **not** package-enforced (S1) |
| ADR-0006 vendor prefix + checksum | **Not implemented** (proposed only) (S5/S13) |

---

## Scope notes

- Reviewed: all `packages/auth/src/*`, package migrations headers, ADR-0002/0003/0006, and compose points `apps/example-api` middleware/services for SessionPort, keys, originGuard, org-context, BA factory.  
- **Not** in this partition: full IDOR matrix of every route, R2 path traversal, email token storage (separate security partitions).  
- No secrets from `.dev.vars` were opened or quoted.

---

*Audit partition: Security · auth package · 2026-08-12 · read-only · Chemin A multi-tenant CF kit*
