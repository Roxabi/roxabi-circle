# Security — P3

**Partition:** `packages/db/**`, `packages/storage/**`, `packages/email/**`, `packages/mcp/**`  
**Date:** 2026-07-12  
**Scope:** Path traversal / R2 key join, SQL injection surface of `@gosilex/db`, email header injection, MCP tool privilege & secret handling  
**Out of scope:** App-layer SMTP dialogue correctness as primary target (noted only as consumer residual); product `share-*`; Better Auth product path  
**Auditor posture:** read-only on sources; write only this report · **no secret values**

## Summary

P3 platform packages are **small and mostly low-risk**: `@gosilex/db` is a one-line Drizzle D1 factory with **no raw-SQL API** (parameterized queries stay in apps via Drizzle); `@gosilex/storage` documents and partially implements R2 path-traversal rejection in `joinObjectKey`; `@gosilex/email` escapes HTML for demo template content and strips CRLF from **subject** only; `@gosilex/mcp` exposes **only** `ping` / `whoami` with boot-time allowlist and **does not** implement privileged write/delete/deploy tools. No **P0** remote exploit was found in isolation (no hardcoded secrets, no console logging of keys, no dynamic SQL string builders in packages).

The main defects are **defense-in-depth gaps on the security-critical APIs**: `joinObjectKey` does **not** validate `prefix` for `..` (only `parts`), and `put`/`get`/`delete` accept **any** key string so a single caller mistake bypasses join. Email **`to` is not CRLF-sanitized** while subject is — incomplete header-injection hygiene before transport lives in the app. MCP is least-privilege on tools but **auth is presence-only**, and `whoami` returns a **key prefix** to the client. SQL injection risk in this partition is **low** provided apps keep using Drizzle bindings (current example-api repos do).

## Findings

| ID | Severity | File | Finding | Evidence |
|----|----------|------|---------|----------|
| SEC-P03-001 | P1 | `packages/storage/src/index.ts` (`joinObjectKey`) | **`prefix` is not segment-validated — path traversal via prefix bypasses the advertised guard.** Only `parts` are split and checked for `..`. `prefix` is only strip of leading/trailing `/`. Call with `joinObjectKey('demo/../other', 'a')` → `demo/../other/a`. Same for `joinObjectKey('../escape', 'x')` → `../escape/x`. R2 object keys are flat strings (not POSIX FS), but many consumers treat keys as hierarchical namespaces (`demo/…` vs `share/…`); a mis-set or user-influenced prefix escapes the intended tree. Comment claims “Rejects traversal.” | ```19:32:packages/storage/src/index.ts``` — `cleanPrefix = prefix.replace(/^\/+|\/+$/g, '')` then joined without splitting/`..` check. Tests only cover traversal in **parts** (`index.test.ts` L33–38). |
| SEC-P03-002 | P2 | `packages/storage/src/index.ts` (`putObject` / `getObject` / `deleteObject`) | **I/O helpers do not require keys produced by `joinObjectKey` — full bypass of join safety.** Any string is passed to the bucket. Security depends entirely on every call site remembering to join. Current `apps/example-api/src/services/notes.ts` is correct (always `joinObjectKey('demo', id, …)`), but the package API does not make the safe path the only path. | ```35:50:packages/storage/src/index.ts``` — single-line delegates; no assert key starts with allowed prefix or was joined. |
| SEC-P03-003 | P2 | `packages/storage/src/index.ts` + tests | **Traversal test matrix incomplete relative to threat surface.** Covered: `../secret`, nested `a/../../b`. **Missing:** `..` in **prefix**; empty prefix; absolute-looking parts (`/etc/passwd` → currently becomes `etc/passwd` under prefix — OK but untested); null bytes / control chars; overlong segments; backslash-only `..\x` (literal segment on R2 — document); percent-encoded `..%2f` (literal — OK). | `index.test.ts` L28–39 only. |
| SEC-P03-004 | P2 | `packages/email/src/templates/demo.ts` | **Email header injection: `to` not sanitized; only `subjectId` CRLF-stripped for Subject.** `subject` uses `props.subjectId.replace(/[\r\n]/g, '')` — good. `to` is returned and used as-is. Consumer builds raw SMTP headers `To: ${tmpl.to}` and `RCPT TO:<${to}>` (`apps/example-api/src/services/email.ts`). If `to` ever becomes user-controlled (or env poisoned with `\r\nBcc:…`), classic SMTP/header injection. Package is the right place to sanitize all header fields returned by builders. | ```13:20:packages/email/src/templates/demo.ts``` — `to: props.to` raw; subject only. App residual: ```16:25,50:apps/example-api/src/services/email.ts```. |
| SEC-P03-005 | P2 | `packages/email/src/index.test.ts` | **No negative tests for CRLF / header injection on email fields.** Happy path only (`to: 'a@b.c'`, `subjectId: 'u1'`). Regression of subject strip or future `to` sanitization would not be caught. | Single test L4–10. |
| SEC-P03-006 | P2 | `packages/mcp/src/index.ts` (`handleWhoami`) | **Auth is presence-only (`verified: false` always) — MCP “identity” must not be treated as authorization.** Documented, but any future tool that gates on `keyPresent` without API verify is an authz bug waiting to happen. Kit tools today need no privilege (`ping`/`whoami` are inert). | ```38:50:packages/mcp/src/index.ts```; comment “Does **not** verify the key against example-api / D1”. |
| SEC-P03-007 | P3 | `packages/mcp/src/index.ts` (`handleWhoami`) | **Partial secret disclosure: returns `keyPrefix = apiKey.slice(0, 8)`.** For `sk_` keys this leaks prefix + 5 hex chars to the MCP client/agent context (logs, transcripts, chat). Prefer presence boolean only, or fixed `sk_***` mask without entropy. | ```48:49:packages/mcp/src/index.ts```; test expects `sk_abcde` for `sk_abcdef012345`. |
| SEC-P03-008 | P3 | `packages/mcp/src/index.ts` (`extractBearerFromEnv`) | **Fragile AUTHORIZATION env semantics; no length bound.** Builds ``Bearer ${env.AUTHORIZATION}`` then `parseBearer`. If env already holds `Bearer sk_…`, double prefix → null (fail-closed, OK). If holds raw token without `sk_` check on that path, returns full token from `parseBearer` (which does **not** require `sk_`); `API_KEY` path requires `startsWith('sk_')`. Inconsistent: AUTHORIZATION path can return non-`sk_` secrets into `handleWhoami` (prefix leak of arbitrary env). No max length before slice. | ```26:31:packages/mcp/src/index.ts```; `parseBearer` in `@gosilex/auth` captures any Bearer payload. |
| SEC-P03-009 | P3 | `packages/storage/src/index.ts` | **No length / charset bounds on key segments.** Huge keys or weird Unicode can pass join and hit R2/API limits or logging noise. Prefer reject empty after join, max total key length (e.g. 1024), ban `\0` and `\r\n`. | Loop L23–30 pushes any non-`..` segment. |
| SEC-P03-010 | P3 | `packages/email/src/templates/demo.ts` | **HTML XSS hygiene is good for `subjectId`; incomplete if more props added.** `escapeHtml` on `subjectId` in HTML body; static text body. No escaping of `to` in HTML (currently unused in body) — fine today. | ```5:19:packages/email/src/templates/demo.ts```. |
| — | (positive) | `packages/db/src/index.ts` | **No SQL injection surface in package.** Only `createDb` → `drizzle(d1, { schema })`. No `sql.raw`, string-concat queries, or `exec` of caller SQL. Schemas/migrations owned by apps. | Full file L1–7. |
| — | (positive) | App repos (consumer pattern) | **Call sites use Drizzle `eq` / `and` / `isNull` binds** — parameterized. Confirms intended use of package does not introduce classic SQLi. | `apps/example-api/src/repos/notes.ts`, `keys.ts`, `services/auth.ts`. |
| — | (positive) | `packages/storage` | **Parts traversal rejection works** for classic `../` and nested `..` segments; leading `/` on parts collapsed (empty segs skipped). | ```23:30:packages/storage/src/index.ts```; tests L33–38. |
| — | (positive) | `packages/mcp` | **Least-privilege kit tool set:** only `ping` + `whoami`; boot `assertExactKitTools` + product-name guard reduce accidental high-power tools in example. No delete/publish/deploy tools. | `MCP_TOOL_NAMES`; `assertNoShareTools`; `apps/mcp-example` registers same set only. |
| — | (positive) | All four packages | **No `console.*` / no hardcoded secrets / no `process.env` secret baking in package src.** MCP secrets enter only via explicit env map from app/CLI. | `rg console` / secrets under packages → none in prod sources. |
| — | (positive) | `packages/email` | **Subject CRLF strip + HTML escape** of dynamic `subjectId` — correct direction for header/body injection. | `demo.ts` L14–18. |
| — | (positive) | Storage consumers | **example-api notes service always joins under fixed `demo/` with UUID id** — no user-controlled path segments in current demo. | `services/notes.ts` L35–61. |

## Metrics

| Metric | Value |
|--------|--------|
| Packages in partition | 4 (`db`, `storage`, `email`, `mcp`) |
| Prod source files | 5 (`db/index`, `storage/index`, `email/index` + `templates/demo`, `mcp/index`) |
| Test files | 4 |
| Approx. prod LOC | ~7 + ~50 + ~40 + ~50 ≈ **147** |
| SQL string builders / raw exec in packages | **0** |
| R2 key helpers with traversal check | 1 (`joinObjectKey`) — **parts only** |
| R2 I/O helpers enforcing join | **0 / 3** |
| Email fields CRLF-sanitized | subject (`subjectId`) **yes** · `to` **no** · From fixed in app |
| MCP tools (kit allowlist) | 2 (`ping`, `whoami`) — both non-mutating |
| MCP tools with server-side auth verify | **0** (`verified` always false) |
| Secret logging in packages | **0** |
| Hardcoded credentials in packages | **0** |
| Findings | **10** · P0: **0** · P1: **1** · P2: **5** · P3: **4** · positives: **7** |

### Threat model (package boundary)

| Asset / surface | Threat | Package control | Residual |
|-----------------|--------|-----------------|----------|
| R2 object namespace | Path / prefix escape → read/write outside intended tree | `joinObjectKey` rejects `..` in **parts** | Prefix not checked (SEC-P03-001); raw keys via put/get/delete (SEC-P03-002) |
| R2 object body | Malicious content type / XSS when served | Only stores contentType if caller passes | Serve layer / CSP (app, not this partition) |
| D1 / SQL | Injection via untrusted input | No raw SQL API in package | App must not add `sql.raw` / string concat |
| Email headers | CRLF injection → spoofed Bcc/Subject | Partial (subject only) | `to` + raw SMTP dialogue in app (SEC-P03-004) |
| Email HTML body | XSS if opened as HTML | `escapeHtml(subjectId)` | Future dynamic fields need same treatment |
| MCP tool surface | Over-privileged agent tools | Allowlist `ping`/`whoami` only | Product MCP must re-apply least privilege |
| MCP secrets | Key exfil via tool result / logs | No console log; presence-only whoami | `keyPrefix` leak (SEC-P03-007); env misconfig |
| MCP authz | Agent treats whoami as proof | Explicit `verified: false` | Callers may ignore flag (SEC-P03-006) |

### Call-site safety snapshot (context only)

| Call site | Uses join? | User path segments? | Authz on object? |
|-----------|------------|---------------------|------------------|
| `example-api` notes create/get/delete | **yes** `demo` + UUID + fixed filename | **no** | Note row scoped by `subject` in SQL; R2 key not re-checked against subject beyond id ownership |
| Package unit tests | yes | adversarial `..` in parts | N/A |

## Recommendations

1. **P1 — Harden `joinObjectKey` (SEC-P03-001 + SEC-P03-009)**  
   - Split **and** validate `prefix` with the same segment rules as `parts` (reject `..`, skip `.` / empty).  
   - Optionally require non-empty final key and max length; reject `\0`, `\r`, `\n`.  
   - Unit tests: `joinObjectKey('a/../b', 'x')` throws; `joinObjectKey('../x', 'y')` throws; empty prefix + safe parts still works if intended.

2. **P2 — Make unsafe R2 keys hard (SEC-P03-002)**  
   - Prefer: `putObject(bucket, { prefix, parts }, body)` that always joins internally; or  
   - `assertSafeObjectKey(key, allowedPrefix)` called at start of put/get/delete.  
   - Document: never pass user strings as full keys without join.

3. **P2 — Complete email header sanitization (SEC-P03-004 / 005)**  
   - Central helper e.g. `sanitizeHeaderValue(s)` → strip `[\r\n]` (and ideally reject if remaining has control chars). Apply to **`to` and `subject`**.  
   - Validate email shape (Zod) before return.  
   - Tests: `subjectId` / `to` containing `\r\nBcc: attacker@evil` must not appear in returned headers.  
   - When promoting transport into `@gosilex/email`, never interpolate unsanitized fields into SMTP DATA.

4. **P2 — MCP auth contract (SEC-P03-006 / 007 / 008)**  
   - Keep kit tools inert until verify exists; do **not** add mutating tools gated only on `keyPresent`.  
   - Drop `keyPrefix` from `whoami` (or return `hasSkPrefix: boolean` only).  
   - Normalize `extractBearerFromEnv`: accept either raw `sk_…` **or** full `Authorization: Bearer sk_…`; always require `sk_` prefix; cap length (e.g. 256).  
   - Future: shared `verifyApiKeyAgainstApi(baseUrl, key)` with no key echo in responses.

5. **P3 — Hygiene**  
   - Expand storage traversal tests (prefix, empty, max length).  
   - When adding Resend/React Email, keep header sanitization independent of HTML escape.  
   - Keep `@gosilex/db` free of `sql.raw` helpers; if migrate glue is added, only load versioned files from trusted paths (no user path concat).

## Residual risks

| Risk | Why it remains | Owner |
|------|----------------|-------|
| **Caller bypasses `joinObjectKey`** | I/O APIs take free-form keys by design today | Package API redesign (rec 2) + code review / banlist patterns |
| **User-controlled path segments later (zip unpack, multi-file)** | Demo uses fixed `attachment.txt` + UUID; product M1/M2 will take filenames | Must join + sanitize each segment; zip-slip is **app** concern (Security P5/product) |
| **App SMTP builds headers manually** | Transport not in package yet | Promote send + sanitize into `@gosilex/email` (ARCH-P03-009) |
| **Drizzle misuse / `sql` template with untrusted input** | Package cannot prevent app-level raw SQL | App reviews; lint/ban `sql.raw` if needed |
| **MCP agents over-trust `keyPresent`** | Flag is explicit but humans/agents ignore docs | Product MCP: real Bearer verify before any privileged tool |
| **R2 list/presign not in package** | No list-by-prefix ACL helpers yet | M2+ storage growth — design ACL at key layout + app guards |
| **D1 binding type `unknown`** | Not an injection vector; wrong binding fails closed at runtime | Type-safety domain / ARCH-P03-005 |
| **Local Mailpit SMTP AUTH accept any** | Dev compose convenience (`MP_SMTP_AUTH_ACCEPT_ANY`) | Ops: never point prod SMTP at catcher (AGENTS H2) |

---

**Bottom line:** P3 has **no P0 package-level vulns** and a **sound default posture** (no secrets, no raw SQL, least-privilege MCP tools, partial path + header hygiene). Before product R2 layouts or user-facing email, **fix prefix validation + force joined keys**, **sanitize all email header fields**, and **treat MCP whoami as non-auth** (no key material in responses). SQL safety in this partition is “factory only” — keep that boundary and continue parameterized Drizzle in apps.
