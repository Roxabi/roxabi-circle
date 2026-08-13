# Error Handling — apps (example-api · example-web · mcp-example)

**Domain:** Error Handling  
**Partition:** apps  
**Scope:** `apps/example-api/**`, `apps/example-web/**`, `apps/mcp-example/**`  
**Date:** 2026-08-12  
**Hunt:** `onError` · `toApiErrorBody` · client toast mapping · swallowed fetch errors · 401 handling · `fieldErrors` · ErrorBoundary / route error UI

## Summary

The kit dogfood apps have a **solid error spine**: `example-api` wires Hono `app.onError` → `@kit/core` `toApiErrorBody` (5xx scrub, requestId, security headers, Retry-After on 429); services/middleware throw `AppError` for almost all domain paths; `example-web` bridges `@kit/api-client` `ApiError` + `apiErrorToMessage` with an i18n catalog, global mutation toasts, Query 401/403 no-retry, session invalidation without `/me` remove loops, AuthGate hard-error UI, and TanStack Router `errorComponent` (ShipFast-style). **mcp-example** stays thin and inherits fail-closed whoami domain statuses + `PublicToolError` wrap from `@kit/mcp`. Residual issues: **tasks list masks query failure as empty**, **BA `/api/auth/*` non-kit envelopes** surface as `HTTP {status}` on login/forgot (change-password already special-cased), **validation `details` shape is not SSoT** (`parseOrThrow` `{ fieldErrors }` vs raw flatten on orgs/admin routes), **FE never maps server `fieldErrors` to form fields**, and a few request-path bare `throw new Error` land as generic 500. No stack/SQL leak to clients found on the AppError path; intentional best-effort swallows (audit, R2 cleanup) are logged.

## Findings

| ID | Severity | File | Finding | Evidence | Recommendation |
|----|----------|------|---------|----------|----------------|
| F1 | P1 | `apps/example-web/src/routes/tasks.tsx` | **Query failure rendered as empty success** | Load path: `tasks.isLoading` → else `(tasks.data?.tasks.length ?? 0) === 0` → `<Empty>` (L157–166). **No `tasks.isError` branch.** On 5xx/403/network, `data` is undefined → false “no tasks” UX. Mutations toast correctly (`onError` L112, L127). Comments panel also treats failed load as empty list (`tasks-comments-panel.tsx` L43–45: `comments?.length === 0 && !loading`). Notes/items/keys/admin/org-members all check `isError`. | Before empty: `tasks.isError` → destructive message + `apiErrorToMessage` + retry (mirror notes L281–285). Pass `error` into comments panel or gate parent. Add regression test for failed list query. |
| F2 | P2 | `apps/example-web/src/routes/login.tsx`, `forgot-password.tsx`, `login-magic-form.tsx`, `reset-password.tsx` · `@kit/api-client` | **Better Auth non-kit error bodies → raw `HTTP {status}`** | Auth routes return BA `handler` response as-is (`routes/auth.ts` L39), not `AppError` envelope. `apiFetch` only builds `ApiError` when `body.error.code` present (`packages/api-client` L64–73); else `throw new Error(\`HTTP ${status}\`)`. Login catch uses `apiErrorToMessage(e, m)` only (login L76–79) → user-facing `"HTTP 401"`. **Change-password already maps HTTP status** via `account-errors.ts` (`changePasswordErrorMessage` / tests). Forgot/magic/reset do not. | Reuse/generalize `httpStatus` helper from `account-errors.ts` for all BA auth surfaces (login fail → catalog “invalid credentials” without enumeration; 429 → rate limited). Optional long-term: thin adapter mapping BA codes → kit envelope at BA boundary. |
| F3 | P2 | `apps/example-api` routes vs `packages/core/src/parse.ts` | **Inconsistent VALIDATION_ERROR `details` shape** | `parseOrThrow` → `details: { fieldErrors: flatten.fieldErrors }` (`parse.ts` L23–25). Many routes pass **raw** flatten as details: `orgs.ts` (L82, L126, L200, L238, L264, L309), `admin-users.ts` L65/79, `admin-audit.ts` L25, `modules.ts` L34, `me.ts` L75. Wire clients cannot reliably read `error.details.fieldErrors`. | Standardize on `parseOrThrow` (or always `{ fieldErrors }`). Prefer migrating orgs/admin/me to `parseOrThrow`; add one contract test on validation body shape. |
| F4 | P2 | `apps/example-web` forms (notes, login, reset, account-password) | **Server `fieldErrors` never mapped to form fields** | FE only uses **client** Zod `flatten().fieldErrors` for TanStack Form field errors (login L48–56, notes L116–126, reset-password L55, account-password L24). API validation failures surface only as toast/generic `apiErrorToMessage` (code → `errValidation`). AGENTS FE matrix: “Forms → map fieldErrors” incomplete. | Helper `apiDetailsToFieldErrors(err)` reading `ApiError.details`; set form field errors on mutation 400. Depends on F3 SSoT shape. |
| F5 | P2 | `apps/example-api/src/lib/presign.ts`, `services/notes.ts`, invite/admin email paths | **Bare `throw new Error` on request-ish paths** | `createAppPresignSigner` throws plain `Error` for s3 misconfig / not implemented (presign L36–42) → `onError` maps to scrubbed `INTERNAL_ERROR` 500 (OK privacy, wrong code semantics). `createNote` rethrows raw R2 err (notes L38–44). Email failures often rewrap to `AppError.internal` (invitations L171–176, admin-users L179–180) — good. | Prefer `AppError.integrationNotConfigured` / `AppError.internal` at throw site so logs + code stay intentional; keep 5xx message scrub. |
| F6 | P3 | `apps/example-web/src/routes/dashboard.tsx` | **Notes widget masks fetch error as zero** | Notes count: loading skeleton else `notes.data?.notes.length ?? 0` (L73–77) — no `notes.isError`. Health maps failure to “offline” badge (acceptable). | Show “—” / error affordance when `notes.isError`; keep health offline badge. |
| F7 | P3 | `apps/example-web/src/main.tsx` | **Global mutation toast uses `defaultLocale`, not active locale** | `MutationCache.onError` → `apiErrorToMessage(error, t(defaultLocale))` (L41). Local mutation `onError` usually wins (L38–39 skip), so impact is fallback path only. | Pass active locale via a small module/ref set by `LocaleProvider`, or drop global toast and require local `onError` everywhere. |
| F8 | P3 | `apps/example-web` (root) | **No React `ErrorBoundary`; router-only recovery** | Sole user-facing crash UI: `RouteErrorComponent` as root `errorComponent` (`routeTree.tsx` L52, `route-error.tsx`). No `componentDidCatch` / React 19 boundary under `QueryClientProvider`. Router catches route render/load errors; some provider-level throws may still white-screen. DEV shows `error.message` only (route-error L15–18) — good (no stack). | Acceptable for kit SPA; optional thin React boundary around `RouterProvider` reusing `RouteErrorComponent` for non-route throws. |
| F9 | P3 | `apps/example-web/src/routeTree.tsx` | **`beforeLoad` non-401 handling inconsistent** | `appLayout` / `authed` catch: only redirect on `isUnauthorized`, else fall through (L98–104, L132–138). `admin` / `index` rethrow non-401 (L117–119, L203–205). UX still OK via `AuthGate` hard-error (auth-gates L74–93), but dual policy is easy to break when adding layouts. | Document “layout swallows → AuthGate owns hard error” **or** always rethrow non-401 for uniform route error page. |
| F10 | P3 | `apps/example-api/src/index.ts` queue | **Demo queue always acks after handler error** | `queue` catch logs + `msg.ack()` (L15–27) — intentional anti-poison for demo (`// product may retry`). Not HTTP path. | Keep for kit demo; product handlers must use `retry()` / DLQ policy. Document in jobs recipe. |

### Non-findings (healthy — no issue ID)

| Area | Assessment |
|------|------------|
| **`onError` + `toApiErrorBody`** | `createApp` L54 → `middleware/error-handler.ts`: requestId, warn/error log (stack **server-only** on ≥500), `applySecurityHeaders`, Retry-After for 429, `c.json(body, status)`. Unknown throws → public `{ code: INTERNAL_ERROR, message: 'Internal error' }` (core `errors.ts` L91–99). Scrub of AppError 5xx messages/details proven in `packages/core` tests. |
| **notFound** | Same nested envelope via `toApiErrorBody(AppError.notFound())` (`app.ts` L55–59). Covered by `app.test.ts` unknown route. |
| **AppError discipline (API)** | Middleware (`require-auth`, `org-context`, `origin-guard`, rate-limit) and services (tasks, orgs, uploads, modules, comments…) throw `AppError.*`. Dual-path auth → `UNAUTHORIZED`. Fail-closed rate limit store → 500 not skip. |
| **Client toast / catalog** | `lib/api.ts` `CODE_TO_MSG` covers all `ErrorCodeName` → Messages keys; mutations widely use `toast.error(m.error, { description: apiErrorToMessage(e, m) })`. Global MutationCache skips double toast when local `onError` set. |
| **401 session handling** | `onSessionUnauthorized`: ApiError 401 only; **never** `removeQueries(['me'])` while me query is the source (avoids infinite loop — comment L16–20). Invalidates `me` for other protected queries. `isUnauthorized` = status 401 only. AuthGate → login; hard non-401 error → retry + login CTA. Query retry: false for 401/403. |
| **fieldErrors (server emit)** | Validation paths do emit details (shape inconsistent — F3). Client Zod field UX exists for primary forms. |
| **ErrorBoundary / route error** | `RouteErrorComponent`: i18n title, generic loadFailed, support mailto, home link; DEV message only. |
| **mcp-example** | No local error fork: catalogue `registerAll` → kit wrap (`toPublicToolError`, input budget). `handleWhoami` **does not throw** on auth/network; domain `status` only; never echoes `sk_`. Tests assert `bad_config` / no key material. |
| **Intentional best-effort catch** | Audit append / first_login (log + continue), notes R2 delete-after, BA session hook audit — log structured JSON, do not fail primary op. Invite/admin email failure **rolls back** then `AppError.internal` — correct. |
| **Security of public body** | Tests assert no `stack` in 401 notes response (`app.test.ts` L139). Logger keeps stack server-side only. |

## Metrics

| Metric | Value |
|--------|------:|
| Files reviewed (primary) | ~45 (API middleware/app/routes sample · services · web main/api/auth/routeTree/auth-gates/route-error · list/mutation routes · mcp-example · kit core/api-client/mcp cross-ref) |
| Issues | **P0=0 · P1=1 · P2=4 · P3=5** |
| Central `onError` | **1** (`middleware/error-handler.ts`) |
| Nested kit error envelope | **yes** (`{ error: { code, message, details? }, requestId }`) |
| Web `isError` list UIs | notes · items · keys · admin · org-members · modules · orgs — **tasks missing** |
| React ErrorBoundary | **0** (router `errorComponent` only) |
| mcp tools | **2** (`ping`, `whoami`) — domain/public error channels in kit |
| Notable hotspots | tasks empty-vs-error · BA auth envelope · validation details shape · account-errors vs login |

## Recommendations

1. **P1 — Fix tasks (and comments) load errors** (F1): treat `isError` before empty; add Vitest/RTL case that mock failed `apiFetch` shows retry, not empty copy.
2. **P2 — BA auth UX map** (F2): share status→catalog helper with login/magic/forgot/reset; never toast raw `HTTP 401` to end users.
3. **P2 — Validation details SSoT** (F3→F4): migrate remaining routes to `parseOrThrow`; then optional FE field mapping from `ApiError.details.fieldErrors`.
4. **P2/P3 — Throw AppError at boundaries** (F5): presign config + R2 failure wrap; keep 5xx scrub.
5. **P3 hygiene batch:** dashboard notes count (F6); mutation toast locale (F7); document beforeLoad error policy (F9); optional React boundary (F8).
6. **Keep:** single `onError` + `toApiErrorBody`, AuthGate 401 vs hard-error split, mcp fail-closed whoami, audit best-effort + log, no client stacks.

## Scope notes

- Read-only audit; no application code changes.
- Package internals (`@kit/core`, `@kit/api-client`, `@kit/mcp`) cited only as contract evidence for app behavior.
- Better Auth response shape is upstream; kit choice to proxy raw BA is intentional (ADR-0002) — F2 is **UX mapping**, not a claim that BA must become AppError.
- Queue ack-on-error is demo policy (F10), not a production SLA claim.
- Cross-ref: security `web-mcp.md` (credentials/envelope assumptions); code-smells `apps.md` (fat pages that host error UI).
)
