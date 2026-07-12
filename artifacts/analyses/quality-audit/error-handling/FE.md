# Error Handling — FE

**Partition:** `apps/example-web/**`, `packages/ui/**` (error-related: Toaster, FieldError, test capture)  
**Date:** 2026-07-12  
**Focus:** ApiError mapping · Query `onError` · ErrorBoundary · swallowed errors · 401 handling · toast paths · fieldErrors / i18n  
**Out of scope:** BE Hono/`AppError` (→ `error-handling/BE.md`), product `share-*` (absent), MCP  
**Refs:** AGENTS.md §F (Frontend), `apps/example-web/src/lib/api.ts`, `lib/auth.ts`, `main.tsx`, route mutations, `packages/ui` Sonner + Field

## Summary

Frontend error handling is a **partial kit demo**, not yet the AGENTS §F spine. Strengths: a single `apiFetch` with `credentials: 'include'`, a real `ApiError` class mapped from nested `{ error: { code, message }, requestId }`, mutation-level Sonner toasts, and an `AuthGate` that boots unauthenticated users to `/login`. Unit tests cover envelope → `ApiError` and non-JSON HTTP failures.

Gaps vs SSoT (and vs a copy-paste template for `share-web`):

1. **No `apiErrorToMessage` / code → i18n map** — toasts use `String(e)` or raw `e.message`; `ErrorCode` never drives UI copy; `fieldErrors` ignored.  
2. **No global QueryClient error policy** — only per-mutation `onError`; queries (notes, health, me) have **no** shared toast / 401 handler.  
3. **401 incomplete** — `isUnauthorized` is **dead**; mid-session 401 on notes/keys/email does **not** clear cache + redirect; `AuthGate` treats **any** `useMe` error (incl. 502 / network) as “go to login”.  
4. **Silent query failures look like empty success** — notes list with `isError` falls through to “No notes yet”; dashboard note count becomes `0`.  
5. **No ErrorBoundary / route `errorComponent`** — render throws → blank React tree; no ShipFast-style support CTA.  
6. **`packages/ui` is presentation-only** for errors (Toaster + FieldError) — correct package boundary, but the app never owns a shared mapper either.

**Bottom line:** **P0: 0.** Highest practical risks for kit clones are **false-empty UI on query failure**, **missing global 401 → logout path**, and **ad-hoc toast strings** that skip codes / `requestId` / validation field maps.

## Findings

| ID | Severity | File | Finding | Evidence |
|----|----------|------|---------|----------|
| ERR-FE-001 | **P1** | `apps/example-web/src/main.tsx` · mutations | **No global TanStack Query error / 401 policy.** `QueryClient` only sets `staleTime` / `refetchOnWindowFocus`. No `QueryCache`/`MutationCache` `onError`, no default `mutations.onError` / `queries.onError`. AGENTS §F: “TanStack Query onError global + toast”; “401 → clear session → login”. Each mutation re-implements toast; queries get zero user-facing error feedback. | ```11:18:apps/example-web/src/main.tsx``` · no `defaultOptions.mutations` / cache handlers |
| ERR-FE-002 | **P1** | `routes/notes.tsx` · `routes/dashboard.tsx` | **Query failures rendered as empty success.** Notes: only `isLoading` vs `data` length; **no `notes.isError` branch** → failed fetch shows `m.empty` (“No notes yet”) + create CTA. Dashboard: `(notes.data?.notes.length ?? 0)` → **0** on error; health uses offline badge when `!data?.ok` (OK-ish) but notes KPI is misleading. No toast, no retry CTA, no `requestId`. | ```42:45:apps/example-web/src/routes/notes.tsx``` · ```94:107:apps/example-web/src/routes/notes.tsx``` · ```72:77:apps/example-web/src/routes/dashboard.tsx``` |
| ERR-FE-003 | **P1** | `lib/auth.ts` · `components/app-shell.tsx` · mutations | **401 handling incomplete and over-broad.** (a) `isUnauthorized` exported but **never used**. (b) Mid-session `ApiError` 401 on create/delete/mint/email only toasts — **no** `removeQueries(me)` / navigate login. (c) `AuthGate` redirects on **any** `me.isError` (network/5xx/malformed), not only 401 — users bounced to login when API is down. (d) `useMe` has `retry: false` (good); other queries use default retries and may thrash 401. | ```15:26:apps/example-web/src/lib/auth.ts``` · ```271:300:apps/example-web/src/components/app-shell.tsx``` · mutation `onError` sites |
| ERR-FE-004 | **P1** | `lib/api.ts` · routes · messages | **No `apiErrorToMessage` / ErrorCode → UI mapping; toast path is raw `String(e)`.** AGENTS §F Frontend: `ApiError` + `apiErrorToMessage` / toast / field errors. App has class only. Mutations: `toast.error(m.error, { description: String(e) })` → e.g. `ApiError: Unauthorized` (name + message), **not** stable i18n by `code`, **no** `requestId` for support. Login shows `${e.code}: ${e.message}` (English server message + code dump). Catalog has only generic `error: 'Erreur'/'Error'`. | ```5:18:apps/example-web/src/lib/api.ts``` · ```55:65:apps/example-web/src/routes/notes.tsx``` · ```29:29:apps/example-web/src/routes/keys.tsx``` · ```37:37:apps/example-web/src/routes/dashboard.tsx``` · ```50:55:apps/example-web/src/routes/login.tsx``` |
| ERR-FE-005 | **P2** | `main.tsx` · `routeTree.tsx` | **No React ErrorBoundary and no TanStack Router `errorComponent`.** Provider tree: Theme / Locale / Query / Tooltip / Router / Toaster only. Uncaught render errors (null deref, bad child) white-screen the SPA with no recovery UI or support CTA (ShipFast-style mailto). Same gap noted ARCH-P06-020; owned here as error-contract. | ```39:51:apps/example-web/src/main.tsx``` · `routeTree` root = bare `<Outlet />` |
| ERR-FE-006 | **P2** | `routes/notes.tsx` · `routes/login.tsx` · forms | **`VALIDATION_ERROR` / `fieldErrors` never mapped to form fields.** Login/notes use TanStack Form without client Zod; on 400 API body, toast/global message only (or login FieldError with code dump). `@gosilex/ui` `FieldError` supports `errors?: { message? }[]` but app never feeds API `details.fieldErrors`. AGENTS: “Forms map fieldErrors”. | notes create `onError` toast only · login `setError` string · `packages/ui/.../field.tsx` FieldError API unused for API errors |
| ERR-FE-007 | **P2** | `lib/api.ts` · AGENTS §F | **`ApiError` shape incomplete vs kit sketch; envelope edge cases.** Class has `status, code, message, requestId, details` but **not** full `body` / typed `code: ErrorCodeName`. Non-envelope HTTP errors become bare `Error('HTTP N')` — lose status on typed path for `isUnauthorized` (instanceof fails). Malformed JSON on ok=false without `error.code` → generic `HTTP status` (OK) but no structured recovery. Empty body + !ok same. | ```5:46:apps/example-web/src/lib/api.ts``` · tests cover nested + HTML 502 only |
| ERR-FE-008 | **P2** | mutation `onError` ×4 · SMELL-P6-007 | **Duplicated toast handlers; no shared `toastApiError`.** Identical `onError: (e) => toast.error(m.error, { description: String(e) })` on notes create/delete, keys mint, dashboard email. Login is a third pattern (instanceof + FieldError). Clone risk: every new mutation invents another variant. | notes 55/65, keys 29, dashboard 37 |
| ERR-FE-009 | **P2** | `routes/login.tsx` | **Non-`ApiError` login failures: FieldError only, no toast.** Network/`HTTP 502` path: `setError(String(e))` without `toast.error` — inconsistent with mutation UX and easy to miss if FieldError scrolls out of view. | ```49:56:apps/example-web/src/routes/login.tsx``` |
| ERR-FE-010 | **P2** | `components/app-shell.tsx` AuthGate | **AuthGate returns `null` during redirect** — brief blank flash; no “session expired” toast; no distinction loading vs unauthorized vs server error copy (always navigate login). Residual UX of ERR-FE-003. | ```276:298:apps/example-web/src/components/app-shell.tsx``` |
| ERR-FE-011 | **P3** | `components/app-shell.tsx` logout | **Logout swallows all API errors intentionally** then clears client cache + navigates. Correct fail-open for “leave session”, but **no log / toast if logout failed** (cookie may remain; next visit might still be authed until me succeeds). Acceptable demo; product should at least toast warn on non-401 failure. | ```89:98:apps/example-web/src/components/app-shell.tsx``` |
| ERR-FE-012 | **P3** | `routes/keys.tsx` copy | **Clipboard `writeText` unhandled rejection.** `onClick={() => void copy()}`; no try/catch — secure-context / permission failures = unhandled promise rejection, no user feedback (success toast only on happy path). | ```32:36:apps/example-web/src/routes/keys.tsx``` · ```66:66:apps/example-web/src/routes/keys.tsx``` |
| ERR-FE-013 | **P3** | `lib/theme.tsx` · `lib/locale.tsx` | **localStorage read/write bare `catch { /* ignore */ }`.** Intentional private-mode resilience; residual: no fallback messaging if prefs never persist. Non-security swallow. | theme 27–29, 62–64 · locale 19–21, 35–37 |
| ERR-FE-014 | **P3** | `lib/api.ts` · toasts | **`requestId` never surfaced in UI error feedback.** Available on `ApiError.requestId` and health success card only. Support / debug for failed mutations has no correlation id in toast description. | ApiError ctor · toast sites omit `e.requestId` |
| ERR-FE-015 | **P3** | tests · routes | **No FE tests for error UX paths.** Covered: `ApiError` map + `apiFetch` reject. **Absent:** AuthGate 401 vs 5xx, mutation toast content, notes `isError` UI, login FieldError, global handler (none), ErrorBoundary. Route coverage ~0% in summary elsewhere. | `lib/api.test.ts` only for error client |
| ERR-FE-016 | **P3** | `packages/ui` | **UI kit has no error-mapping helpers (by design) but also no documented Error page shell.** Exports Toaster + FieldError only. App must own mapper; neither app nor package provides reusable “error page + support CTA” composition AGENTS/ShipFast list. `capture-errors.ts` is **test-only** runtime contract capture — not product error handling. | `packages/ui/src/index.ts` · `sonner.tsx` · `field.tsx` · `test/capture-errors.ts` |

### Non-findings (healthy)

| Area | Assessment |
|------|------------|
| Cookie credentials | `apiFetch` always `credentials: 'include'` — required for session + error auth paths. |
| Nested envelope parse | `body?.error?.code` → `ApiError`; unit-tested with UNAUTHORIZED. |
| Non-JSON error body | Throws `HTTP ${status}` after JSON parse fail on !ok — no silent null. |
| Invalid JSON on 200 | Throws `Invalid JSON response` — no false success parse. |
| Content-Type on body | Sets `application/json` when body present. |
| `useMe` retry | `retry: false` avoids login-storm on 401 for session probe. |
| Logout fail-open | Clear client session even if API logout fails — correct for “user wants out”. |
| localStorage prefs | Swallow is correct for Safari private / quota. |
| Mutation success toasts | create/delete/mint/email success feedback present. |
| AdminGate forbidden | Explicit forbidden copy + redirect (not silent) for non-admin design-system. |
| `packages/ui` boundary | No domain error codes / ApiError in UI package — extract-clean. |
| Toaster wired | Root `ThemedToaster` with richColors + theme from provider. |
| FieldError a11y | `role="alert"` on FieldError for login inline error. |

### Error flow (current)

```text
fetch via apiFetch
        │
        ├─ !ok + nested { error.code } → throw ApiError(status, body)
        ├─ !ok + other body           → throw Error(`HTTP ${status}`)
        ├─ ok + invalid JSON          → throw Error('Invalid JSON…')
        └─ network                    → fetch rejection (bare TypeError)
                │
                ▼
  ┌─────────────┴──────────────┐
  │                            │
useQuery (me/notes/health)   useMutation / login try-catch
  │                            │
  ├ me: AuthGate               ├ mutations: toast.error(String(e))
  │   any isError → /login     ├ login ApiError: FieldError + toast(message)
  │   (no toast, no code)      └ login other: FieldError only
  ├ notes: empty UI on error
  └ health: offline badge
                │
                ▼
  No ErrorBoundary · No QueryCache.onError · No apiErrorToMessage
```

### Throw / catch inventory (FE scope)

| Location | Pattern | Verdict |
|----------|---------|---------|
| `apiFetch` JSON parse | catch → rethrow typed Error | OK |
| `apiFetch` !ok | ApiError or HTTP Error | OK spine; incomplete mapping (ERR-FE-004/007) |
| login `onSubmit` | try/catch ApiError vs other | Partial (ERR-FE-009) |
| mutation `onError` ×4 | toast `String(e)` | UX weak / DRY (ERR-FE-004/008) |
| logout | bare catch → still clear + navigate | OK intentional (ERR-FE-011 residual) |
| theme/locale storage | bare catch ignore | OK (ERR-FE-013) |
| keys `copy` | no catch on clipboard | P3 (ERR-FE-012) |
| AuthGate / AdminGate | no catch; branch on query state | Over-broad 401 (ERR-FE-003) |
| form `void handleSubmit` | floating promise | Depends on Form internals; residual risk |
| `main` root missing | throw `root missing` | OK boot assert |
| useTheme/useLocale | throw if no provider | OK dev contract |
| design-system test capture | window error listeners | Test-only OK |
| `packages/ui` capture-errors | test harness | Not product path |

## Metrics

| Metric | Value |
|--------|------:|
| Files analyzed (prod FE error-relevant) | **~18** — `api`, `auth`, `main`, `routeTree`, `app-shell`, routes (login/notes/keys/dashboard/settings/design-system smoke), messages, locale/theme; ui: sonner, field, index, capture-errors |
| Test files consulted | `lib/api.test.ts`, design-system overlays test (runtime contract), ui capture-errors |
| Issues | **16** total · **P0: 0** · **P1: 4** · **P2: 6** · **P3: 6** |
| `ApiError` class | **1** (app-local only) |
| `apiErrorToMessage` | **0** |
| Global QueryClient `onError` | **0** |
| ErrorBoundary / router `errorComponent` | **0** |
| Mutation `onError` toast sites | **4** (all `String(e)`) |
| Login dedicated catch | **1** |
| Bare / intentional swallows | logout · localStorage×4 · (api rethrows) |
| `isUnauthorized` call sites | **0** (dead) |
| Query UI with `isError` branch | **0** (AuthGate uses isError for redirect only) |
| fieldErrors → form map | **0** |
| Toast includes `requestId` | **0** |
| FE tests of error UX | **0** (client unit only) |
| packages/ui product error helpers | **0** (Toaster + FieldError presentation only) |

## Recommendations

1. **P1 — Global Query policy (`main.tsx`):**  
   - `QueryCache`/`MutationCache` or `defaultOptions.mutations.onError` / `queries.onError` → `toastApiError`.  
   - On `isUnauthorized(err)`: `queryClient.clear()` (or remove `me` + sensitive keys) → `navigate({ to: '/login' })` + optional “session expired” toast.  
   - Set `queries.retry` policy: e.g. no retry on 401/403/404; limited on 5xx.

2. **P1 — Query error UI:** for `notes` (and any list), branch `isError` → destructive alert + retry (`refetch`), **never** empty-success. Dashboard KPIs: show “—” / error badge when query failed.

3. **P1 — `apiErrorToMessage(err, m)`:** map `ErrorCode` → FR/EN catalog keys; fallback generic; append short `requestId` in description for support. Use everywhere (mutations, login, global handler). Prefer `err instanceof ApiError ? err.message : …` over `String(e)`.

4. **P1 — AuthGate precision:** redirect to login **only** on 401 (via `isUnauthorized(me.error)`); on other errors show “API unavailable / retry” shell instead of login bounce.

5. **P2 — ErrorBoundary:** root React boundary + optional route `errorComponent` with support CTA (mailto) and reload; log `error` + `requestId` if available.

6. **P2 — Validation:** on `VALIDATION_ERROR`, read `details.fieldErrors` into TanStack Form field meta / `FieldError errors={…}`; keep toast for non-field errors only.

7. **P2 — Harden `ApiError`:** store `body`; type `code` as `ErrorCodeName | string`; helper `toApiError(unknown)` so bare `HTTP 401` and network errors normalize for `isUnauthorized` / messaging.

8. **P2 — DRY:** single `toastApiError(e, m)` used by mutations; delete per-site copies.

9. **P3 — Clipboard / logout / requestId:** try/catch copy + toast fail; optional logout failure toast; always put `requestId` in error toast description when present.

10. **P3 — Tests:** AuthGate 401 vs 502; notes isError UI; `apiErrorToMessage` unit; mutation onError mock toast; optional ErrorBoundary smoke.

## Residual risks / not covered

- BE message leakage (`AppError.internal` config strings) still appears in FE toast if mapped as raw `message` (→ BE ERR-BE-001 + FE ERR-FE-004).  
- Better Auth client swap may change cookie/error shapes — not present yet.  
- CSP / HTML artefact sandbox errors (product M0+) — N/A in example-web.  
- Concurrent mutation races after 401 redirect — not exercised.  
- Sonner queue limits / a11y live regions — presentation only.  
- Overlap: ARCH-P06-006/007/020, SMELL-P6-004/007 — findings restated here for **error-domain ownership**.  
- `packages/ui` Base UI runtime contract tests are quality gates, not user-facing error handling.  
- E2E Playwright absent for full login-fail / session-expire flows (P1 roadmap).
