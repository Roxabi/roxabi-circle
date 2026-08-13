# Security — web + MCP

**Domain:** Security  
**Partition:** `apps/example-web`, `apps/mcp-example`, `packages/mcp`, `packages/api-client`  
**Date:** 2026-08-12  
**Review focus:** credentials include · token storage · MCP sk_ auth · open redirect · XSS sinks · CORS assumptions · mcp-example least privilege

## Summary

This slice is **security-healthy for a kit dogfood SPA + MCP thin client**. Session auth correctly uses **HttpOnly cookies** with `@kit/api-client` default `credentials: 'include'` — **no session/token material in `localStorage`**. Open-redirect hardening on post-auth `next` / magic-link callback paths is explicit (`safeInviteReturnPath` / `safePostAuthPath`). MCP example is **ping + whoami only**, with whoami restricted to **Bearer `sk_`**, host allowlist SSRF guard, and fail-closed domain statuses that never echo key material. Residual risk is mostly **inherent SPA residual** (XSS → session *riding*, not cookie *read*) amplified by **no SPA CSP**, short-lived **plaintext `sk_` in the keys UI**, and **operator-expandable** `MCP_ALLOWED_HOSTS`. No P0 auth bypass or ambient MCP authority found.

## Findings

| ID | Severity | File | Finding | Evidence | Recommendation |
|----|----------|------|---------|----------|----------------|
| F1 | P2 | `apps/example-web/**` (assets) vs `apps/example-api/src/middleware/security-headers.ts` | **SPA has no CSP / security headers**; API sets `default-src 'none'` + frame-ancestors none, HSTS when Secure. XSS residual on the SPA elevates impact of `credentials: 'include'` (session *riding*, not `document.cookie` theft). | API: `Content-Security-Policy: default-src 'none'; frame-ancestors 'none'`, `X-Frame-Options: DENY`, `Referrer-Policy: no-referrer`. Vite SPA (`apps/example-web`) serves HTML/JS without meta CSP or CF Pages headers in-tree. Cookie is HttpOnly (BA `advanced.cookies.session_token`), so classic cookie exfil via JS is blocked; injected script can still call `/api/*` with cookies. | Product deploys: emit CSP on SPA (strict script-src + nonce/hash); keep `frame-ancestors 'none'`. Kit recipe: document “headers on static host” next to `VITE_API_URL` / CORS. Do not treat API CSP as SPA coverage. |
| F2 | P2 | `apps/example-web/src/routes/notes.tsx`, `design-system.tsx` | **User-controlled Markdown** rendered via `@tanstack/markdown/react` on note bodies (table + delete dialog). Defaults are safe (raw HTML escaped; dangerous URL schemes stripped per TanStack security docs) but there is **no in-repo lock** that `allowHtml` stays off, and no kit policy for outbound links. | `<Markdown>{body}</Markdown>` at notes cells ~165 and delete dialog ~471; `body` from `/api/notes`. No `allowHtml` prop today. Catalog hint: “Markdown OK — **bold**, lists, links…”. | Keep `allowHtml` disabled forever for UGC; optional wrapper that hardcodes safe options. Prefer `rel="noopener noreferrer"` / link component policy for external URLs. Add a short product recipe “Markdown threat model”. Regression: snapshot that notes Markdown props omit `allowHtml`. |
| F3 | P2 | `apps/example-web/src/routes/keys.tsx` | **Plaintext `sk_` held in React state + readable DOM** for up to 60s after mint (until copy/TTL). Session stays HttpOnly; machine key does not. XSS / malicious extension / shoulder-surf can steal during the mint window. | `minted` state `{ id, key }`; `PLAINTEXT_TTL_MS = 60_000`; `<Input readOnly value={minted.key} />`; clear on successful clipboard copy. List UI shows id prefix only (good). | Accept as mint UX residual; keep TTL + auto-clear. Optional: reveal-once behind button, no permanent input node; avoid leaving key in DOM when tab blurred. Never persist `sk_` to localStorage (currently correct). |
| F4 | P2 | `apps/example-web/src/components/login-magic-form.tsx`, `apps/example-api/src/lib/better-auth.ts`, `magic-link.test.ts` | **Open-redirect defense is client-strong; server-side BA `callbackURL` rejection is not proven in kit tests.** Magic link builds `callbackURL` from `window.location.origin` + allowlisted path; BA uses `trustedOrigins: corsAllowlist(env)`. No negative test for `callbackURL=https://evil.example/...`. | Client: `magicCallbackURL` → `safePostAuthPath` / `safeInviteReturnPath` then `${origin}${safe}` or `/app`. Password login: `postLoginTarget` uses **only** `safeInviteReturnPath` (non-invite `next` falls to `defaultHomePath` — fail-closed). BA: `trustedOrigins: corsAllowlist(env)`. Tests only happy-path `callbackURL: ${ORIGIN}/app`. | Add API tests: magic-link / reset `redirectTo` with off-allowlist origin rejected or not stored; keep client allowlists. Document that product must keep `CORS_ORIGINS` === SPA origins === BA trusted origins. |
| F5 | P2 | `packages/mcp/src/index.ts`, `apps/mcp-example/src/index.ts` | **`MCP_ALLOWED_HOSTS` can expand whoami’s fetch surface** beyond default `localhost` / `127.0.0.1` / `[::1]`. Misconfiguration turns whoami into an SSRF probe to an allowlisted host (still `sk_` Bearer only; path fixed to `/api/me`). | `isAllowedApiBase` + `DEFAULT_ALLOWED_HOSTS`; example: `process.env.MCP_ALLOWED_HOSTS?.split(',')` overrides when set. Unit test rejects `https://evil.example` with default allowlist. | Document: production MCP should pin `API_BASE_URL` + hosts to the product API origin only. Prefer rejecting host override outside explicit deploy env. Keep fail-closed on bad config. |
| F6 | P2 | `packages/api-client/src/index.ts`, `apps/example-web/src/lib/api.ts`, `apps/example-api/src/app.ts` + `session-env.ts` | **Cross-origin SPA↔API prod is a configuration footgun.** Client always sends `credentials: 'include'`; API CORS allowlist + `credentials: true` + BA `SameSite=Lax` cookies. Split hosts without aligned `CORS_ORIGINS` / cookie domain / Secure will break auth or tempt `*` CORS (currently correctly refused). | `createApiClient` default `credentials = 'include'`; `VITE_API_URL ?? ''` (empty = same-origin Vite proxy in dev). CORS: allowlist only, unknown Origin not reflected (`app.test.ts`). `originGuard` rejects cookie mutations without allowlisted Origin. Cookies: HttpOnly, SameSite lax, Secure outside development\|test. | Product deploy checklist: same host preferred; if split, set explicit `CORS_ORIGINS`, `BETTER_AUTH_URL`, cookie domain, and reconsider SameSite=None+Secure only if required. Never reflect Origin. Keep `originGuard` on mutations. |
| F7 | P3 | `apps/example-web/src/lib/safe-return-path.ts` + `safe-return-path.test.ts` | **`safePostAuthPath` lacks unit tests** (only `safeInviteReturnPath` covered). Logic is sound on read, but magic-link / reset-password paths depend on it. | Tests assert invite-only allowlist + open-redirect rejects (`//evil.com`, schemes, traversal). `safePostAuthPath` allows `/app`, `/admin`, `/login`, `/invite/accept` + `..` reject — **no corresponding tests**. | Extend test matrix for `safePostAuthPath` (allow/deny paths, query drop on `/app`, invite query keep, traversal). |
| F8 | P3 | `packages/mcp/src/catalogue.ts` | **`effect` / `auth` ToolDef fields are metadata only** — `registerAll` intentionally does not enforce them. Product authors may confuse hints with authorization. | Comment SC12: “Intentionally ignore tool.effect / tool.auth for authorization”; `void tool.effect; void tool.auth`. Real auth = handler (`extractBearerFromEnv` + `/api/me` for whoami). | Keep as design; strengthen README “auth hint ≠ gate”. Product tools with side effects must call API with `sk_` + org grants in-handler (parity with flows). |
| F9 | P3 | `packages/ui/src/components/ui/chart.tsx` | Sole in-repo **`dangerouslySetInnerHTML`** — injects theme CSS vars from `ChartConfig` colors (not HTML UGC). Safe if colors stay static; risk if product ever feeds user-controlled color strings. | `ChartStyle` builds `cssText` from `itemConfig.color` / theme; biome-ignore `DEBT:chart-scoped-css`. | Keep colors developer-controlled; if ever dynamic, restrict to `#hex` / `hsl()` regex. Prefer CSS variables without innerHTML long-term. |

### Non-findings (healthy — no issue ID)

| Area | Assessment |
|------|------------|
| **Token storage** | Session = Better Auth **HttpOnly** cookie (`better-auth.ts` `session_token` attributes). SPA `localStorage` only for **non-secrets**: `kit.activeOrgId`, theme, locale. **No** session JWT / `sk_` in storage. `@kit/api-client` has **no** bearer default / token store. |
| **credentials: 'include'** | Default in `createApiClient`; example-web + package tests assert it. Correct for cookie sessions; residual XSS riding mitigated by HttpOnly + Origin/CORS (not eliminated). |
| **Open redirect (login next)** | `safeInviteReturnPath` / `safePostAuthPath` reject `//`, schemes, path escape; invite accept builds `next` with `encodeURIComponent(invitationId)`. Password post-login ignores non-invite `next`. |
| **MCP least privilege** | `REGISTERED_TOOL_NAMES === ['ping','whoami']`; catalogue-only `registerAll`; smoke asserts exact list + no `sk_` in whoami text. `ping` = unauthenticated health (intentional). |
| **MCP sk_ auth** | `extractBearerFromEnv` accepts only `sk_` (bare or `Bearer`); non-sk rejected. whoami never returns key material; domain statuses only. |
| **whoami SSRF default** | Host allowlist + http(s) only + no userinfo in URL + fixed `/api/me` path + timeout. |
| **Public tool errors** | `toPublicToolError` maps unknown → `INTERNAL_ERROR` catalogue message (no stack/exception leak). Input budget fail-closed. |
| **CORS assumptions** | Allowlist-only; credentials true; tests reject evil Origin reflect. `originGuard` for cookie mutations without Origin. |
| **api-client** | Pure fetch wrapper; no ambient authority; optional `onUnauthorized` (example-web uses Query invalidation, not blind logout loop). |

## Metrics

| Metric | Value |
|--------|------:|
| Files / trees reviewed | `packages/api-client` (src), `packages/mcp` (src), `apps/mcp-example` (src + smoke), `apps/example-web` (api/auth/safe-return/keys/login/magic/reset/notes/routeTree/org-context/main), cross-ref API CORS/cookies/originGuard/BA for client assumptions |
| Issues | **P0=0 · P1=0 · P2=6 · P3=3** |
| Session credential store | HttpOnly cookie (not localStorage) |
| SPA XSS sinks (`dangerouslySetInnerHTML` in web) | **0** direct; Markdown UGC; chart sink lives in `@kit/ui` |
| MCP registered tools | **2** (`ping`, `whoami`) |
| Open-redirect helpers | 2 (`safeInviteReturnPath`, `safePostAuthPath`) — invite fully tested |
| credentials default | `'include'` |

### Notable hotspots

1. `apps/example-web/src/routes/keys.tsx` — plaintext `sk_` mint window.  
2. `apps/example-web/src/routes/notes.tsx` — Markdown on multi-tenant note body.  
3. `packages/mcp/src/index.ts` `handleWhoami` — network edge + host allowlist.  
4. Split-origin deploy triangle: `VITE_API_URL` × `CORS_ORIGINS` × BA cookie flags.

## Recommendations

1. **P2 — SPA CSP / headers recipe** for product static hosts (not only API middleware); reduce residual XSS → session-riding impact of credentials-include.  
2. **P2 — Markdown policy**: hard-disable `allowHtml`; document link/image policy; optional link `rel` wrapper.  
3. **P2 — Prove BA open-redirect server side** with tests for evil `callbackURL` / `redirectTo` outside `corsAllowlist`.  
4. **P2 — Pin MCP hosts** in deploy docs; treat `MCP_ALLOWED_HOSTS` as break-glass, not default widen.  
5. **P2 — Cross-origin deploy checklist** next to zero-edit product contract (`CORS_ORIGINS`, Secure cookies, prefer same host).  
6. **P3 — Unit-test `safePostAuthPath`**; clarify ToolAuthHint non-auth in `@kit/mcp` README.  
7. **Keep (do not regress):** HttpOnly session-only; no sk_ in localStorage; mcp catalogue thinness + smoke; whoami fail-closed + no key echo; CORS non-reflect + originGuard; client return-path allowlists.

## Scope notes

- Read-only audit; did not run live exploit harness or browser XSS probes.  
- API cookie/CORS/originGuard reviewed as **client assumptions**, not full example-api security partition.  
- Org IDOR / grant checks on `X-Org-Id` belong to API security agent (server must not trust SPA `kit.activeOrgId`).  
- TanStack Markdown security claims taken from vendor docs (safe defaults); no local fork of the parser audited line-by-line.
