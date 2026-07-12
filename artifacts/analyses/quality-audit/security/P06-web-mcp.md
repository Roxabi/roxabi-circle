# Security — P6 web + MCP example

**Partition:** `apps/example-web/**`, `apps/mcp-example/**`  
**Date:** 2026-07-12  
**Scope:** XSS, `credentials: 'include'`, token storage (localStorage?), open redirects, CSRF posture on cookie-auth SPA, MCP stdio privilege, API key leakage in UI; i18n injection **N/A** (static catalogs, no user-driven message interpolation).  
**Out of scope:** Crypto primitives (`packages/auth` → Security P2); API CORS/Origin middleware implementation (`apps/example-api` → Security P5) except as residual for FE cookie client; product `share-*`; package `@gosilex/mcp` depth beyond what example composes.  
**Auditor posture:** read-only on sources; write only this report. **No secret values** reproduced.

## Summary

`example-web` is a **cookie-first SPA** with a central `apiFetch` that always sends `credentials: 'include'`. Session material is **not** stored in `localStorage` / `sessionStorage` (only theme + locale allowlisted prefs). React text rendering is used for user/API content (notes, errors); **no** `dangerouslySetInnerHTML` / `eval` / open external redirects in app source. Minted `sk_` keys are shown once in React state + clipboard — intentional, XSS-sensitive while visible. Auth/admin gates are **client-only** (UX); real enforcement is API-side.

`mcp-example` is a **least-privilege stdio kit**: exact tools `ping` / `whoami`, boot + smoke allowlist, no shell/FS/network tools. `whoami` is **env presence only** (not API-verified) and returns a **key prefix** (first 8 chars) in tool output — minor leakage if stdio logs are retained. Smoke injects a synthetic `API_KEY` and can dump a JSON-RPC transcript.

**No P0 remote exploit** in this partition alone. Highest practical risks for a kit that will be copied: **CSRF defense-in-depth missing on the client path** (relies on SameSite=Lax + API CORS; AGENTS also wants Origin checks on mutations — API gap, FE has no double-submit), **minted API key residency in DOM/state until navigate**, **demo credentials prefilled in login**, **stdio MCP inheriting full host process env**, and **no SPA Content-Security-Policy**. XSS baseline is good for React defaults; residual is lack of CSP + error/toast surfaces.

## Findings

| ID | Severity | File | Finding | Evidence |
|----|----------|------|---------|----------|
| SEC-P06-001 | P1 | `apps/example-web/src/routes/keys.tsx` | **Minted `sk_` plaintext lives in React state + DOM until navigation; clipboard copy has no auto-clear.** One-time display is correct product UX, but while the page is open any XSS (extension, compromised dependency, future `dangerouslySetInnerHTML`) steals a full high-entropy key. No `visibilitychange` / timer clear; key also survives soft UI interactions. Toast path does **not** echo the key (good). | `useState` `minted` L20–27; `<Input readOnly value={minted.key}` L61; `navigator.clipboard.writeText(minted.key)` L32–36. |
| SEC-P06-002 | P1 | `apps/example-web/src/lib/api.ts` + mutations; AGENTS §D CSRF | **SPA always attaches cookies on every API call; client has no CSRF token / Origin enforcement helper.** Relies entirely on cookie `SameSite=Lax` (API) + browser CORS preflight for cross-origin. Modern Lax blocks classic cross-site form POST cookie send — **good baseline**. AGENTS: “SameSite + **vérif Origin sur mutations**”; FE does not send/custom-check CSRF; documented API Origin middleware still **unimplemented** (see `docs/testing.md`, ARCH-P05-014). Dual-host cookie (`.gosilex.com`) raises residual CSRF surface for sibling origins. | `credentials: 'include'` always L26–29; no CSRF header in `apiFetch`; logout/login/keys/notes POSTs bare. |
| SEC-P06-003 | P1 | `apps/example-web/src/routes/login.tsx` | **Demo credentials prefilled in form defaultValues + i18n `demoCreds` copy.** Shoulder-surfing / shared screenshots / browser autofill pollution. Acceptable for local kit demo; **dangerous as copy-paste prod template** without scrub. Password field type=password (good) but value is seeded. | `defaultValues: { email: 'demo@gosilex.local', password: 'demo-password-change-me' }` L35–38; `m.demoCreds` FieldDescription L135. |
| SEC-P06-004 | P2 | `apps/mcp-example/src/index.ts` + `@gosilex/mcp` `handleWhoami` | **whoami returns `keyPrefix` (first 8 characters of `sk_…`) over MCP stdio.** Presence-only tool still leaks high-entropy material into host logs, smoke transcripts, and agent context. Prefix includes `sk_` + 5 hex (≈20 bits) — not enough alone to recover the key, but unnecessary and trains a bad pattern for product MCP. | App: L37–39; package `handleWhoami` returns `keyPrefix: apiKey.slice(0, 8)`. Smoke prints `whoami` result in JSON (`stdio-smoke.mjs` L129–140). |
| SEC-P06-005 | P2 | `apps/mcp-example/src/index.ts` | **MCP stdio process inherits full `process.env`; tools read `API_KEY` / `AUTHORIZATION` from env without isolation.** Any MCP host that launches this server with a real key in the environment grants every tool call access to that secret material (today only prefix leak). No separate secret store, no per-tool scope, no confirmation for future privileged tools. Kit tools are low-privilege **today**; privilege model is “trust the host + env”. | `extractBearerFromEnv(process.env …)` L38; `server.start({ transportType: 'stdio' })` L54–56. |
| SEC-P06-006 | P2 | `apps/example-web/index.html`; SPA deploy surface | **No Content-Security-Policy (or other browser isolation headers) on the SPA shell.** API Worker sets nosniff / XFO DENY / Referrer-Policy (`security-headers.ts`) but Vite `index.html` has none. XSS residual higher without CSP `default-src` / `script-src`. | `index.html` meta/title only; no CSP meta. Headers are API middleware, not static assets. |
| SEC-P06-007 | P2 | `apps/example-web/src/components/app-shell.tsx` (`AuthGate` / `AdminGate`) | **Client-only authz gates — not a security boundary.** Unauthenticated users get navigate-to-login; non-admin redirected from design-system. A user can still load route modules; secrets must never be gated only here. Currently design-system is cosmetic (no secrets) — OK. Template risk if product puts sensitive data behind AdminGate alone. | `AuthGate` L271–300; `AdminGate` L243–268 — `useMe()` + `queueMicrotask(navigate)`. |
| SEC-P06-008 | P2 | `apps/example-web/src/lib/api.ts` (`VITE_API_URL`) | **Optional absolute `VITE_API_URL` + always `credentials: 'include'`.** Mis-set build env (typo domain, attacker-controlled CI var) points credentialed browser traffic at wrong host. Cookies for **that** URL’s domain are sent (not SPA origin cookies unless shared Domain). Cross-origin requires CORS allowlist on API — mitigated if API hard; still footgun for staging. Local default `''` + Vite proxy is same-origin (safer). | `API_BASE = import.meta.env.VITE_API_URL ?? ''` L3; fetch `` `${API_BASE}${path}` `` L26–29; `vite.config.ts` proxy `/api`+`/health`. |
| SEC-P06-009 | P2 | `apps/example-web/src/main.tsx` + query usage | **No global 401 handler — session failure is per-query.** `AuthGate` reacts to failed `useMe`, but other queries may flash errors; mint/notes mutations toast `String(e)` without forcing logout. Stale React Query cache can briefly show prior-user subject after cookie expiry until refetch. Not session theft; weak session lifecycle hygiene. | `QueryClient` defaults L11–18 only `staleTime` / `refetchOnWindowFocus`; no `onError` 401 → clear. |
| SEC-P06-010 | P2 | `apps/mcp-example/scripts/stdio-smoke.mjs` | **Smoke dumps full JSON-RPC transcript (incl. whoami result) to stdout on success/failure.** Fine for local CI with synthetic key; if `API_KEY` is overridden with a real key, prefix + env presence appear in logs/artifacts. Default key is clearly synthetic. | Default `API_KEY: … \|\| 'sk_stdio_smoke_test_key_abcdef'` L17; `console.log(JSON.stringify({ … transcript }))` L129–140; catch logs transcript L147–150. |
| SEC-P06-011 | P3 | `apps/example-web/src/lib/{theme,locale}.tsx`; `index.html` | **localStorage used only for non-secrets (theme, locale) with allowlist reads.** Positive posture; residual: theme bootstrap script reads raw string then compares to fixed enums — not executable. If future prefs store free-form HTML, XSS risk returns. | Theme/locale keys `gosilex.theme` / `gosilex.locale`; read validates `light\|dark\|system` / `fr\|en`. |
| SEC-P06-012 | P3 | `apps/example-web` routes + `routeTree.tsx` | **Open redirect surface: none found.** Navigations use TanStack `navigate({ to: '…' })` / `<Link to="…">` with **hardcoded** internal paths only. Login success → `/`; AuthGate → `/login`; AdminGate → `/`. No `?next=` / `returnUrl` / `window.location = userInput`. Design-system TOC `href={\`#${item.id}\`}` uses static id list. | grep navigate/Link in src; no searchParams redirect. |
| SEC-P06-013 | P3 | `apps/example-web/src/routes/notes.tsx` + React | **Stored XSS baseline OK:** note `title`/`body` rendered as React text children (`{n.title}`, `{n.body}`), not HTML. API is still the validation boundary. Future markdown/HTML preview without sanitizer would reopen XSS. | TableCell L120–122; no `dangerouslySetInnerHTML` under `apps/example-web/src`. |
| SEC-P06-014 | P3 | `apps/example-web` toast / error UI | **Error strings rendered as React/text toast descriptions (`String(e)`).** Generally escaped by React/sonner text path. If a future toast path uses HTML mode or injects API `message` into DOM APIs, reflected XSS possible. Prefer map `ApiError.code` → i18n message (AGENTS §F) — also reduces attacker-controlled copy. | `keys.tsx` L29; `notes.tsx` L55–65; `dashboard.tsx` L37; login uses `e.message` L51–52. |
| SEC-P06-015 | P3 | `apps/mcp-example` tool surface | **Privilege positive: exact allowlist, empty Zod params, no product tools.** Boot `assertExactKitTools`; registration loop only over `REGISTERED_TOOL_NAMES`; unit test rejects extra tools; smoke exact tools + forbids `share_*`. Least privilege for kit demo. | `index.ts` L20–50; `index.test.ts`; `stdio-smoke.mjs` L97–107. |
| SEC-P06-016 | P3 | `apps/example-web/src/messages/*` | **i18n injection N/A / hygiene positive.** Catalogs are static TS objects; no ICU with unsanitized user args. Contract test rejects script/handler-ish patterns in strings. User data is not interpolated into message templates. | `messages.contract.test.ts` HTMLISH regex; `i18n.ts` catalog lookup only. |
| — | (positive) | `lib/api.ts` | **Central credentialed client; no Authorization header from SPA for session.** UI sessions = cookies only; machine keys mint UI then used outside SPA — matches AGENTS (MCP/skill Bearer, UI cookies). | L21–30; keys page copy L87. |
| — | (positive) | storage audit | **No session token / sk_ / password in localStorage or sessionStorage.** Only theme + locale. Minted key is memory/DOM only. | rg localStorage under src → theme/locale only. |
| — | (positive) | open redirect / XSS primitives | **No `eval`, `new Function`, `document.write`, `innerHTML`, `dangerouslySetInnerHTML` in app src.** | rg under `apps/example-web/src`. |
| — | (positive) | `mcp-example` | **whoami explicitly does not verify key against API** — cannot be used as auth bypass oracle for D1; only env presence. | Comment L4–5; package `verified: false` always. |
| — | (positive) | smoke default key | **Synthetic smoke key is obviously non-production** (`sk_stdio_smoke_test_key_abcdef`) — not a real mint format reliance. | `stdio-smoke.mjs` L17. |

## Metrics

| Metric | Value |
|--------|--------|
| Apps in partition | 2 (`example-web`, `mcp-example`) |
| example-web prod TS/TSX (src, excl. tests) | ~16 modules |
| mcp-example prod modules | 1 (`src/index.ts`) + smoke script |
| `credentials: 'include'` | **always** in `apiFetch` |
| Session storage mechanism | **HttpOnly cookie** (API-set); SPA never holds session secret |
| SPA localStorage secrets | **0** (theme + locale only) |
| SPA `dangerouslySetInnerHTML` / `eval` | **0** in app src |
| Open redirect via user input | **0** found |
| Client CSRF token / Origin helper | **0** |
| SPA CSP | **0** |
| Demo password prefilled | **yes** (login form) |
| Minted key storage | React state + optional clipboard; not persisted |
| MCP transport | **stdio only** |
| MCP tools | exactly `ping`, `whoami` |
| MCP tools with FS/shell/network side effects | **0** |
| whoami verifies API key | **no** (`verified: false`) |
| whoami leaks key prefix | **yes** (8 chars) |
| Product `share_*` tools | **0** (guarded) |
| Findings | **16** · P0: **0** · P1: **3** · P2: **7** · P3: **6** · positives: **6** |

### Threat model (P6 boundary)

| Asset | Threat | Control in partition | Residual |
|-------|--------|----------------------|----------|
| Session cookie | XSS steals session | HttpOnly cookie (API); SPA no token in JS storage | XSS still enables **cookie-authenticated** actions via `credentials:include` |
| Session cookie | CSRF mint key / delete notes | SameSite=Lax (API); CORS allowlist (API) | No FE CSRF token; no Origin mutation middleware (API); dual-host Domain later |
| API key plaintext | XSS / shoulder surf / extension while shown | Show-once UX; not localStorage | SEC-P06-001 residency; clipboard history |
| API key at rest | MCP env leak | Presence-only whoami | Prefix in tool result; full key in process env of host |
| MCP host | Over-privileged tools | Exact allowlist ping/whoami | Future tools must keep allowlist discipline |
| Admin UI | Privilege escalation via client gate | API role checks required | Design-system is cosmetic only today |
| User notes | Stored XSS | React text escape | Markdown/HTML preview later |
| Redirect | Phishing open redirect | Hardcoded internal routes | Keep forbidding `?next=` without allowlist |

```text
Browser SPA ──credentials:include──► example-api (Set-Cookie HttpOnly · SameSite=Lax)
     │                                    ▲
     │ POST /api/keys → sk_ once in DOM   │ (Bearer not used by SPA)
     ▼                                    │
  clipboard / React state                 │
                                          │
MCP host ──stdio──► mcp-example ──env API_KEY──► whoami prefix only (no HTTP verify yet)
```

## Recommendations

1. **P1 — API key display hygiene (SEC-P06-001)**  
   - Keep show-once, but: clear React state on unmount / after N minutes; optional “I’ve copied it” dismiss that zeroes state.  
   - Prefer `type="password"` + reveal toggle, or non-`<Input>` monospaced block with select-all, to reduce casual shoulder-surf.  
   - Never put `key` into Query cache, URL, or analytics.  
   - Document: “XSS ⇒ key theft while page open; HttpOnly does not protect minted sk_”.

2. **P1 — CSRF posture as dual-host arrives (SEC-P06-002)**  
   - Keep SameSite=Lax for same-site kit demo.  
   - Before separate SPA/API hosts with `Domain=.gosilex.com`: implement API Origin allowlist check on state-changing routes (AGENTS) **and** optional double-submit / custom header (`X-Requested-With` / CSRF) that SPA always sets via `apiFetch`.  
   - SPA: centralize mutation header helper in `apiFetch` so product apps inherit it.

3. **P1 — Scrub demo credentials for non-dev (SEC-P06-003)**  
   - Empty defaults outside `import.meta.env.DEV`; keep `demoCreds` help text only in dev builds.  
   - Never ship prefilled password in staging/prod example deployments.

4. **P2 — MCP whoami / stdio (SEC-P06-004–005, 010)**  
   - Return `keyPresent: boolean` only (drop `keyPrefix`) or return a non-secret fingerprint (HMAC of key with server salt once verified).  
   - When wiring real verify: call example-api `/api/me` with Bearer; never log full key; redacted smoke asserts.  
   - Document operator rule: launch MCP with **minimal env** (only `API_KEY`), not full shell env dump.  
   - Smoke: assert transcript does not match `/sk_[a-f0-9]{20,}/` when using real keys; keep synthetic default.

5. **P2 — SPA hardening (SEC-P06-006–009)**  
   - Add CSP for production static deploy (Workers assets / Pages): strict `default-src 'self'`; `connect-src` API origin; no `unsafe-inline` scripts if build allows (Vite nonces/hashes).  
   - Treat AuthGate/AdminGate as UX only in AGENTS/docs; never sole control for secrets.  
   - Validate `VITE_API_URL` at build (https + allowlisted host) or forbid absolute URL in kit default.  
   - Global Query `onError`: 401 → clear `me` cache → `/login`.

6. **P3 — Hygiene**  
   - Map API errors by `code` to i18n (reduce reflected attacker-controlled messages).  
   - If notes gain rich text: sanitize (DOMPurify or server allowlist) before HTML.  
   - Keep localStorage allowlists if more prefs land.  
   - Preserve MCP exact-tool tests + smoke as security regression nets when adding tools.

## Residual risks

| Risk | Why it remains | Owner |
|------|----------------|-------|
| **Cookie theft via XSS still enables CSRF-less abuse of session** | HttpOnly stops JS read, not browser auto-send with `credentials: 'include'` | CSP + XSS discipline + short session TTL (API/auth) |
| **CSRF Origin middleware not in this partition** | Enforced (or not) on example-api | Security P5 / product before dual-host |
| **Minted key is intentionally shown once** | Product requirement for MCP/machine bootstrap | UX clear + short residency (rec 1) |
| **MCP host is trusted** | stdio model: host can prompt tools freely | Least-privilege tools + human confirm for destructive product tools (AGENTS §7) |
| **Demo credentials public by design** | Kit local login | Never reuse seed password hashes/users in prod tenants |
| **Client admin gate** | Cosmetic design-system only | Product admin APIs must re-check role |
| **Dependency XSS (React, Vite, ui kit)** | Supply chain | Lockfile + updates + CSP |
| **i18n injection** | N/A today (static catalogs) | Revisit if user-generated locale packs or ICU with raw HTML |

---

**Bottom line:** P6 SPA/MCP kit is **directionally secure for a cookie + sk_ demo**: no session-in-localStorage, no open redirects, no HTML sink XSS, MCP tools locked to ping/whoami. Treat **minted-key residency**, **CSRF defense-in-depth before multi-subdomain cookies**, **demo password prefills**, and **whoami prefix / stdio env trust** as the main hardening items before copying this partition into a public or multi-tenant product surface.
)
