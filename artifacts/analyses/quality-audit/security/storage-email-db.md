# Security — storage · email · db

**Repo:** `roxabi-boilerplate-cf`  
**Date:** 2026-08-12  
**Partition:** `packages/storage`, `packages/email`, `packages/db`  
**Domain:** Security (Wave 3)  
**Call-site samples (context only):** `apps/example-api` notes/uploads/presign, email-port, better-auth; `apps/example-web` magic callback / safe-return-path

## Summary

This slice is in **good security shape for a kit layer**. `@kit/storage` rejects `..` path segments, clamps presign expiry, allows **PUT-only** presign, and never holds R2 secrets (signer injected; mock default). Dogfood uses prefix-enforced `StorageClient` under `demo/`. `@kit/email` implements ADR-0004 fail-closed transports, staging recipient allowlist + From pin + `[TEST STAGING]` subject, HTML escape on templates, and token redaction on the `log` transport. `@kit/db` is a thin Drizzle/D1 factory with **no raw-SQL helpers** and no user-input SQL surface. No P0. Highest package finding: **SMTP envelope CR/LF injection** on the Node-only path. Residual risks are footguns (free R2 helpers / unprefixed presign keys), log PII, and open-redirect/TTL ownership living outside the email package (app + Better Auth — currently wired with trusted origins and 5‑min magic / 1‑h reset).

## Findings

| ID | Severity | File | Finding | Evidence | Recommendation |
|----|----------|------|---------|----------|----------------|
| F1 | P1 | `packages/email/src/server.ts` | **SMTP command injection** via unscrubbed envelope `MAIL FROM` / `RCPT TO` | DATA headers scrub CR/LF (`scrub` L96–101) but envelope uses raw values: L135–137 `` `MAIL FROM:<${input.from}>` `` / `` `RCPT TO:<${input.to}>` ``. A `to`/`from` containing `\r\n` can inject extra SMTP commands (e.g. additional RCPT). Node-only / Mailpit-oriented, but API is public on `@kit/email/server`. | Apply the same CR/LF strip (or strict addr-spec validation, reject `<>[]\r\n`) **before** envelope commands **and** keep DATA scrub. Add a negative test with `\r\n` in `to`. |
| F2 | P2 | `packages/storage/src/index.ts` | `createPresignedUrl` validates traversal only — **no prefix / tenant isolation** | L190–204: `assertObjectKey` + method PUT + `clampExpiresIn`; any non-`..` key is signed. Prefix safety is caller duty. Dogfood is correct (`presignDemoUpload` → `StorageClient.key` under `demo/`), but a product can presign arbitrary bucket keys. | Document “key must come from `StorageClient.key`”; optionally accept `StorageClient` + parts, or require `basePrefix` + assert under prefix inside `createPresignedUrl`. |
| F3 | P2 | `packages/storage/src/index.ts` | Free `putObject` / `getObject` / `deleteObject` reject `..` but **not** base-prefix isolation | L67–85: only `assertObjectKey`. Contrast `StorageClient` L91–156. README prefers client; free helpers remain easy copy-paste for products. | Deprecate free helpers for product use; JSDoc `@deprecated` + banlist/lint later; keep for tests. Prefer single safe API. |
| F4 | P2 | `packages/email/src/index.ts` | `sendLog` logs **full recipient address** (PII) unredacted | L293–300: JSON includes `to: input.to` in clear; only `body` goes through `redactEmailBody`. Dev/default transport — still lands in Worker/console log drains. | Redact local-part (`j***@domain`) or hash `to` in log transport; keep domain for ops debug. Optionally gate full `to` behind `EMAIL_LOG_PII=true`. |
| F5 | P2 | `packages/email/src/index.ts` + templates | **No URL allowlist** on `magicUrl` / `resetUrl` / `acceptUrl` / `setPasswordUrl` | Builders pass through absolute URLs into text + HTML (`templates/magic-link.ts` L13–22, reset/invite/welcome). Open-redirect / phishing body is entirely caller trust. App mitigations exist outside package: BA `trustedOrigins` (`better-auth.ts` L194), web `safePostAuthPath` / `magicCallbackURL`. Package cannot assume that. | Export optional `assertTrustedLink(url, allowedOrigins)` used by builders in strict mode; or document hard contract: “never pass client-supplied absolute URLs without origin allowlist.” |
| F6 | P3 | `packages/storage/src/index.ts` | `StorageClient` constructor prefix check weaker than `joinObjectKey` | L96–98: `!basePrefix \|\| basePrefix.includes('..')` — substring match, not segment walker (`pushPathSegments` L33–41). Over-rejects `foo..bar`; under-validates vs full join rules for empty/`.` consistency with `assertUnderPrefix` raw root (L106–108). | Validate via same `pushPathSegments` / normalize with `joinObjectKey(basePrefix)` once at construct. |
| F7 | P3 | `packages/email/src/cf.ts`, `index.ts` | **No CR/LF scrub** on CF/Resend `subject` / `to` / `from` before provider call | SMTP DATA scrubs headers; `sendCf` / Resend JSON pass strings through (cf.ts L36–41; createResendEmailPort L343–349). CF/Resend structured APIs lower risk than SMTP text, but defense-in-depth missing vs template invite subject using org name (CR stripped in template only). | Central scrub in `EmailPort.send` wrapper for `to`/`subject` (and from display name) for all transports. |
| F8 | P3 | `packages/email/src/redact.ts` | Redaction covers common secret params; **gaps** on alternate names / short tokens | `SECRET_QUERY` = `token\|invitationId\|code\|key` (L7); reset path BA shape (L10); long tokens ≥20 on URL-ish lines (L13–24). Misses e.g. `secret=`, `authToken=`, path forms other than `/api/auth/reset-password/…`, tokens 8–19 chars in query already partially covered only for listed names. | Extend param allowlist; unit-test magic-link `?token=` (already), invite, and a non-listed param to lock expectations. |
| F9 | P3 | `packages/storage/src/index.ts` | No max key length / control-char rejection | `assertObjectKey` only empty + `..` segments (L60–65). R2 key limit ~1024 bytes; `\0` / other controls accepted as opaque keys. | Cap length (e.g. 1024); reject ASCII controls; tests. |
| F10 | P3 | `packages/email` (TTL display only) | **Token TTL not enforced in package** — `expiresHint` is copy only | Magic/reset builders take `expiresHint?: string` (display). Real TTL is app/BA: `magicLink({ expiresIn: 300 })`, `resetPasswordTokenExpiresIn: 3600` in `apps/example-api/src/lib/better-auth.ts`. Not a package bug; easy product footgun if hints diverge from real TTL. | Document ownership: BA/app mint TTL; templates must not claim shorter/longer than configured; optional assert in app when building email. |

### Clean / residual (no finding ID)

| Area | Assessment |
|------|------------|
| **R2 path traversal** | `pushPathSegments` rejects `..` in prefix **and** parts; tests cover nested and prefix traversal (`index.test.ts`). R2 keys are opaque (literal `..` is not FS traversal after reject). |
| **Prefix-enforced client** | `StorageClient` joins under `basePrefix` + `assertUnderPrefix`; dogfood notes/uploads use `demo/` + auth `subject`. |
| **Presign method / expiry / secrets** | PUT-only; `expiresIn` clamped **[60, 3600]**; package never stores R2 secrets; mock signer for CI; app S3 mode fail-closed until aws4fetch. |
| **Staging email policy** | Required `EMAIL_ALLOW_DOMAINS`, From domain pin, subject prefix; exact domain match (no parent wildcard) — tests cover deny + allow. |
| **`log` ban on staging/prod** | `assertEmailTransportAllowed` fail-closed. |
| **SSRF (email)** | Resend hardcodes `https://api.resend.com/emails`; CF uses binding (no user URL); SMTP `host` is operator config (Node CLI → Mailpit), not Worker. |
| **HTML injection in templates** | Shared pattern `escapeHtml` on URLs and user-ish fields; `expiresHint` / org / inviter strip CR/LF. |
| **Open redirect (app layer)** | Out of package: web `safe-return-path` + BA `trustedOrigins` / CORS allowlist. Do not re-audit as package defect; F5 documents package trust boundary. |
| **SQL injection (`@kit/db`)** | Package exports only `createDb`, `mapInChunks`, `D1_IN_ARRAY_CHUNK`. No string-concat SQL API. App `sql\`\`` samples (audit, rate-limit) use Drizzle bound fragments — residual risk is **app** misuse of `sql.raw` / string concat (none seen in package). |
| **Secrets in output** | No secret values reviewed or recorded. |

## Metrics

- **Files reviewed (package source + tests):**  
  - storage: `src/index.ts`, `src/index.test.ts`, README  
  - email: `index.ts`, `server.ts`, `cf.ts`, `redact.ts`, templates (5), `index.test.ts`, `server.test.ts`  
  - db: `src/index.ts`, `src/index.test.ts`  
  - **+ call-site samples:** `presign.ts`, `uploads.ts`, `notes.ts`, `email-port.ts`, `better-auth.ts` (TTL/origins), `login-magic-form.tsx`  
- **Issues:** P0=0 · **P1=1** · **P2=4** · **P3=5**  
- **Notable hotspots:**  
  - `packages/email/src/server.ts` (SMTP envelope)  
  - `packages/storage/src/index.ts` (free helpers + presign trust boundary)  
  - `packages/email/src/index.ts` (`sendLog` / `createEmailPort` policy surface — otherwise strong)

## Recommendations

1. **Fix F1 first** — scrub/validate SMTP envelope addresses; add regression test with CR/LF in `to`/`from`.
2. **Harden storage API surface (F2–F3, F6, F9)** — one prefix-safe path for product keys + presign; deprecate free helpers; unify prefix validation; key length/control-char guards.
3. **Log hygiene (F4, F8)** — redact or hash `to` on log transport; extend secret query names if product links introduce new params.
4. **Document / optional enforce trusted link origins (F5, F10)** — package stays dumb templates; contract + optional helper prevents phishing bodies when products wire custom URLs.
5. **Do not add raw SQL helpers to `@kit/db`** — keep Drizzle-only; any future `sql.raw` escape hatch must be explicit, documented, and unexported from default public API.
6. **Keep ADR-0004 gates in the package** (not reimplemented per app) — current `createEmailPort` + thin `resolveEmailPort` is the correct control plane.

## Severity legend (STRATEGY)

| Level | Meaning |
|-------|---------|
| P0 | Security vuln · data leak · auth bypass · kit extractibility broken |
| P1 | Bug risk · confirmed axial drift · critical coverage hole / injectable surface |
| P2 | Refactor · probable drift · medium debt / trust-boundary footgun |
| P3 | Cleanup · hygiene · defense-in-depth |
