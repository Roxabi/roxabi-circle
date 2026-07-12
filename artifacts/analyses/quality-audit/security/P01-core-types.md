# Security — P1 core / types / config

**Partition:** `packages/core/**`, `packages/types/**`, `packages/config/**`  
**Date:** 2026-07-12  
**Scope:** Error message / details leakage design, `ErrorCode` wire surface, requestId generation, accidental secrets/credentials in kit primitives, env/types helpers (security-relevant only)  
**Out of scope:** App middleware / CORS / headers (`apps/example-api` → Security P5); auth crypto (`packages/auth` → Security P2); product `share-*`  
**Auditor posture:** read-only on sources; write only this report  
**No secret values** appear in this document (none found in partition).

## Summary

P1 is a **thin, secret-free foundation** for kit error contracts. The **good news** is intentional: unknown/`Error` throwables are mapped by `toApiErrorBody` to a fixed `INTERNAL_ERROR` + generic `"Internal error"` (covered by a regression test that asserts raw messages like `"secret stack"` never reach the client). There are **no hardcoded credentials**, env loaders, or credential patterns in `core` / `types` / `config`. `newRequestId` uses Web Crypto CSPRNG.

The **main security design gap** is the opposite path: **every `AppError` is treated as fully client-safe**. `message` and `details` are copied into the public JSON body without status-based scrubbing, schema, or size bounds. That violates the AGENTS contract (*client: generic / i18n-ready — never stack, SQL, paths*) at the **enforcement** layer: the package *documents* safety via tests for *non-AppError* only, while factories such as `AppError.internal(customMessage)` invite operational detail into 500 responses. A real consumer already does this (`getSecret` → `AppError.internal('SESSION_SECRET is required…')` — app layer, cited as evidence of footgun impact only). Secondary gaps: unconstrained `code: string` / `details?: unknown` on the wire type, incomplete `ErrorCode` surface vs factories, and no runtime/Zod validation of the error envelope.

**P0 remote exploits in this partition: none.** Risk is **information disclosure by design + caller misuse**, not crypto breaks.

## Findings

| ID | Severity | File | Finding | Evidence |
|----|----------|------|---------|----------|
| SEC-P01-001 | P1 | `packages/core/src/errors.ts` (`toApiErrorBody`, `AppError.internal`) | **`AppError` 5xx messages are client-visible with no scrub.** For any `instanceof AppError`, body uses `message: err.message` regardless of `status`. `AppError.internal(message = 'Internal error')` accepts a custom string that is then **public**. Non-`AppError` paths correctly force `"Internal error"`. Result: developers who wrap env/DB failures as `AppError.internal(err.message)` (or descriptive config errors) leak ops/config strings; the kit does not enforce AGENTS “never stack, SQL, paths” for the 500 path. | ```37:39:packages/core/src/errors.ts``` factory; ```49:60:packages/core/src/errors.ts``` passthrough; contrast ```63:71``` unknown → fixed message. Consumer pattern (out of package, impact only): `apps/example-api/src/lib/session-env.ts` `AppError.internal('SESSION_SECRET is required (min 32 chars)…')` — names secret env + policy. |
| SEC-P01-002 | P1 | `packages/core/src/errors.ts` · `packages/types/src/index.ts` | **`details?: unknown` is serialized wholesale into the public API body.** No allowlist, depth/size limit, or strip of sensitive keys. Intended use is Zod-style `fieldErrors`; actual type permits stacks, raw SQL, request bodies (passwords), file paths, or nested objects if a caller passes them. FE trusts the field (`ApiError` stores `body.error.details`). | ```7:14:packages/core/src/errors.ts```; ```56:56:packages/core/src/errors.ts``` spread of `details`; ```14:20:packages/types/src/index.ts``` `details?: unknown`. |
| SEC-P01-003 | P2 | `packages/core/src/errors.ts` · `packages/types/src/index.ts` | **`ErrorCode` SSoT is not enforced on runtime or wire.** `AppError` holds `code: string`; constructor accepts any string; `ApiErrorBody.error.code` is `string`, not `ErrorCodeName`. Callers can invent codes (including ones that encode internal state) or mistype kit codes; clients cannot type-narrow reliably. `RATE_LIMITED` exists in the enum without a factory — incomplete surface encourages ad-hoc `new AppError(...)`. | ```4:15:packages/core/src/errors.ts```; ```2:10:packages/types/src/index.ts``` + ```16:16```; no `isErrorCode()` / Zod schema in package. |
| SEC-P01-004 | P2 | `packages/core/src/errors.ts` (`AppError` factories) | **No split between public message and internal/log message (no `cause`).** AGENTS sketch includes `cause?`; implementation has only a single `message` used for both `Error.message` (logged by app `onError` with stack) **and** client body. Forces a false choice: informative ops errors vs safe clients. Logging is correctly app-side; package cannot express “log rich / respond generic”. | Class L4–15; factories L17–38; no `cause` / `publicMessage`. App log: `error-handler.ts` logs `err.message` + `stack` (correct) while body still gets same message for `AppError`. |
| SEC-P01-005 | P2 | `packages/core/src/errors.test.ts` | **Security tests cover only the unknown-error branch.** Present: non-`AppError` message not leaked; body has no `stack` key for validation example. **Absent:** `AppError.internal('…secret…')` still exposes custom text; `details` with `stack`/`password` keys still present in body; arbitrary `code`; status 500 + generic override regression; factory matrix for unauthorized/forbidden/etc. Function coverage on `errors.ts` ~**50%** (statics under-exercised). | Tests L4–32; coverage summary: functions **50%** on `errors.ts`, package functions **54.54%**. |
| SEC-P01-006 | P3 | `packages/types/src/index.ts` | **No runtime validator / Zod schema for `ApiErrorBody`.** FE casts JSON to `ApiErrorBody` without shape checks (app layer). Kit types package is the natural home for a shared schema (`code` enum + message string + optional details shape) per AGENTS “Zod schemas + ErrorCode”; absence is a contract hole, not a direct exploit. | Types-only file ~22 LOC; test only checks `ErrorCode` string values + ban `SHARE`. |
| SEC-P01-007 | P3 | `packages/types/src/index.ts` (`ErrorCode`) | **Thin code catalog vs product/security needs later.** Kit codes are appropriate and domain-clean (`!SHARE`). Missing common secure-API codes that apps may invent inconsistently later (e.g. dedicated auth failure vs generic, payload too large). `RATE_LIMITED` without documented HTTP 429 mapping in core increases drift. | Enum L2–10; factories omit `rateLimited`. |
| SEC-P01-008 | P3 | `packages/core/src/errors.ts` (`newRequestId`) | **Request ID is high-entropy but not validated as a format when consumed.** Generator is fine (`req_` + 16 hex from UUID). Security of **accepting client-supplied** `x-request-id` (log injection / unbounded length) is app middleware — not implemented here; package offers no `parseRequestId` / sanitize helper. | ```75:77:packages/core/src/errors.ts```; app `request-id.ts` uses `incoming?.trim() \|\| newRequestId()` (adjacent). |
| — | (positive) | `toApiErrorBody` unknown path | **Fail-closed for non-AppError:** status 500, fixed code/message, **no** `details`, **no** stack, **no** original message. | ```63:71:packages/core/src/errors.ts``` + test L20–25. |
| — | (positive) | `errors.test.ts` | Explicit non-leak assertion for unknown `Error('secret stack')`. | L21–25. |
| — | (positive) | Partition secrets scan | **No** passwords, API keys, tokens, PEMs, `sk_`, cloud keys, or env loaders in core/types/config sources. Only test string `"secret stack"` as anti-leak fixture. | `rg` credential patterns → empty on src (except test fixture). |
| — | (positive) | `ErrorCode` product purity | Kit codes only; test bans `SHARE` substring — extractibility + no product error oracle in packages. | `types/src/index.test.ts` L8. |
| — | (positive) | `@gosilex/config` | Tooling only (`tsconfig.base.json`, `vitest-coverage.mjs`); **no** runtime secrets, env parsing, or network. `private: true`. | `package.json` exports tsconfig only; coverage helper is pure path math. |
| — | (positive) | Logging | **No `console.*` in core/types** — package does not log errors (avoids accidental secret logs in the library itself). | `rg console` under packages/core, packages/types → none. |
| — | (positive) | `instanceof AppError` | Plain objects / forged JSON cannot become `AppError` via `instanceof` → fail closed to generic 500. Cross-bundle duplicate class risk is fail-closed (over-generic), not over-open. | `toApiErrorBody` L49. |

## Metrics

| Metric | Value |
|--------|--------|
| Files in partition (source) | `core`: `errors.ts`, `index.ts`, tests, package/ts/vitest configs; `types`: `index.ts`, test, configs; `config`: `package.json`, `tsconfig.base.json`, `vitest-coverage.mjs` |
| Approx. LOC security-relevant runtime | ~100 (`errors.ts` ~77, `types` ~22) |
| Public error sanitization (unknown `Error`) | **yes** — fixed message |
| Public error sanitization (`AppError` any status) | **no** — full message + details |
| `details` wire type | `unknown` (unconstrained) |
| `code` wire type | `string` (not `ErrorCodeName`) |
| `ErrorCode` members | 7 (`UNAUTHORIZED`, `FORBIDDEN`, `NOT_FOUND`, `VALIDATION_ERROR`, `CONFLICT`, `INTERNAL_ERROR`, `RATE_LIMITED`) |
| Matching `AppError.*` factories | 6 (missing `rateLimited`) |
| Zod / env helpers in partition | **0** (AGENTS overclaim vs ship surface) |
| Secrets / credentials in partition | **0** |
| Secret-like test fixtures | 1 (`'secret stack'` anti-leak) |
| `newRequestId` entropy source | `crypto.randomUUID()` (CSPRNG) |
| Core coverage snapshot | lines **81.25%**; `errors.ts` lines **83.87%** / functions **50%** / branches **85.71%** |
| Findings | **8** · P0: **0** · P1: **2** · P2: **3** · P3: **3** · positives: **7** |

### Threat model (package boundary)

| Asset | Threat | Package control | Residual |
|-------|--------|-----------------|----------|
| Client error body confidentiality | Leak stack / SQL / paths / secret *names* / env policy | Unknown → scrubbed; **AppError → open** | SEC-P01-001/002; app must not put sensitive text in message/details |
| Error code integrity | Invented / inconsistent codes | Catalog only (soft) | SEC-P01-003 |
| Correlation IDs | Predictable IDs | UUID-based | Client-supplied IDs at app layer |
| Credential material in kit | Hardcoded keys in packages | N/A — none present | Keep package free of env loaders that print secrets |
| Extract / supply chain | Domain codes or secrets in kit | Banlist-style test on `SHARE` in codes | No banlist on secret-shaped strings in messages |
| FE trust of error JSON | Malformed / hostile error bodies | Types only, no parse | SEC-P01-006 + app FE |

## Recommendations

1. **P1 — Status-aware public mapping (SEC-P01-001, SEC-P01-004)**  
   - For `status >= 500` (or always for `ErrorCode.INTERNAL_ERROR`), force public `message` to a constant (`'Internal error'`) independent of `err.message`.  
   - Optionally add `cause?: unknown` (or `logMessage`) for operators; never copy `cause` into `toApiErrorBody`.  
   - Deprecate / document: `AppError.internal()` should ignore custom public text or only accept a **public** optional override that is still generic.  
   - Unit tests: `AppError.internal('DB password rejected at host …')` → body message `'Internal error'`; log path remains free to use `err.message` in apps.

2. **P1 — Constrain `details` (SEC-P01-002)**  
   - Prefer a typed shape, e.g. `{ fieldErrors?: Record<string, string[]> }` (or Zod-inferred), not bare `unknown`.  
   - Or sanitize in `toApiErrorBody`: only pass `details` when code is `VALIDATION_ERROR` / `CONFLICT`, and only allow a JSON-safe allowlisted structure; strip keys matching `/pass(word)?|secret|token|authorization|cookie|stack/i`.  
   - Cap serialized size (e.g. reject or truncate if `JSON.stringify(details).length > 4_096`).

3. **P2 — Harden ErrorCode surface (SEC-P01-003, SEC-P01-007)**  
   - Type `AppError.code` and `ApiErrorBody.error.code` as `ErrorCodeName` (domain apps can extend via branded union later).  
   - Add `isErrorCode(value: string): value is ErrorCodeName`.  
   - Add `AppError.rateLimited(message = 'Too many requests', details?)` → **429**.  
   - Constructor: accept `ErrorCodeName` only (or private constructor + factories).

4. **P2 — Expand security regression tests (SEC-P01-005)**  
   - Table-driven: internal custom message scrubbed; details with forbidden keys; arbitrary constructor code rejected or typed away; each factory status/code pairing; ensure `JSON.stringify(body)` never matches `/stack|password|SESSION_/i` for 5xx.  
   - Raise functions coverage floor for core above 50% once factories are tested.

5. **P3 — Optional kit schemas (SEC-P01-006)**  
   - When Zod lands in `@gosilex/types` (or core): `ApiErrorBodySchema` for FE parse; shared `ErrorCode` enum schema. Keeps FE from trusting hostile proxies’ error JSON blindly.

6. **P3 — Request ID helper (SEC-P01-008)**  
   - Export `isRequestId(s)` / `resolveRequestId(incoming?: string)` that only accepts `^req_[a-f0-9]{8,32}$` (or similar) and falls back to `newRequestId()` — so apps do not reimplement unsafely.

7. **Config**  
   - No security changes required in `packages/config` for this partition; keep it free of runtime env/secret helpers (those belong in apps or a future validated env module with **never log raw values** rules).

## Residual risks

| Risk | Why it remains | Owner |
|------|----------------|-------|
| **Caller still controls public 4xx copy** | Even after 5xx scrub, validation/conflict messages can overshare (e.g. “user X exists”) — product policy | App services + code review |
| **App `onError` logs full `err.message` + stack** | Correct for ops; ensure log sinks are not client-facing and redact secrets in structured logs | Observability / P5 |
| **Client-controlled `x-request-id`** | Not in this package; log injection / header bloat | Security P5 (`request-id` middleware) |
| **No env Zod in core yet** | Secrets validation lives in apps (`getSecret`); inconsistent min-length across consumers | Future `@gosilex/core` or app env module |
| **`instanceof` across dual package copies** | Would over-scrub (generic 500) not under-scrub — safe bias | Packaging / extract |
| **AGENTS package map overclaims** | Result / env Zod not present — no false sense of secret validation in kit | Docs alignment (ARCH residual) |
| **i18n of error messages** | Stable **codes** are the SSoT; free-form English messages in factories are not i18n-safe and encourage leaking prose | `@gosilex/i18n` + UI maps codes → FR/EN |

---

**Bottom line:** P1 has **no embedded secrets** and a **correct fail-closed path for unexpected errors**. Treat **`AppError` as a trusted public-content channel** as the primary hardening item: scrub 5xx messages, constrain `details`, and type-enforce `ErrorCode` so the kit matches AGENTS error rules by construction, not by caller discipline.
