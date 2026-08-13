# Test Quality — T3 example-web

**Domain:** Test Quality  
**Partition:** T3 — `apps/example-web/**/*.{test,spec}.{ts,tsx}` + Playwright/e2e scripts  
**Date:** 2026-08-12  
**Scope:** unit/component tests, design-system e2e, auth / org shells / i18n contracts  
**Out of scope (other partitions):** package unit (T1), example-api IDOR/RBAC (T2), monorepo coverage strategy synthesis (T4)

## Summary

`example-web` tests are **helper- and contract-first**, which matches the documented T2 SPA policy (low global floors **10/10/20/12**, raise only via risk-mapped suites). **CP-FE-CRED** (`credentials: 'include'`), **CP-I18N** (FR/EN key parity + non-empty + no demo passwords), auth **persona helpers** (`defaultHomePath` / `canManageMembers`), **AuthGate** loading/401/hard-error, **OrgProvider** storage validity, invite open-redirect (**`safeInviteReturnPath`**), account error maps, Zod form schemas (password paths), and **CP-UI-CONTRACT** (Base UI overlays unit + local Chromium e2e) are in good shape.

Gaps cluster on **composition that products will copy**: **`PlatformGate` has zero tests** despite dual `/admin` + `beforeLoad` defense; **`safePostAuthPath` is untested** while magic-link `callbackURL` depends on it; **no component/route tests** for password/magic login, forgot/reset, invite-accept, sign-out fail-closed, org-switcher, or **`X-Org-Id` header attachment**. E2E proves BA cookie login **via `page.evaluate(fetch)`**, not form UX, and is **local-only** (by design). No P0 false-security claims; residual is **P1 coverage holes on shell/open-redirect helpers** and **P2 untested auth/org UI composition**.

## Findings

| ID | Severity | File | Finding | Evidence | Recommendation |
|----|----------|------|---------|----------|----------------|
| F1 | **P1** | `src/components/auth-gates.tsx` · `auth-gates.test.tsx` | **`PlatformGate` / BO shell gate untested** | `PlatformGate` redirects non-platform actors to `/app` + toast (`auth-gates.tsx` L11–41). Admin layout also gates in `routeTree.tsx` `beforeLoad` (`!isPlatformActor` → `/app`, L207–215) then wraps `AuthGate`+`PlatformGate`. Suite only covers **`AuthGate`** (loading, 401→login, hard-error retry, happy children) — **0 cases** for staff allow / client-only deny / loading. Pure helpers for the same decision are unit-tested (`auth.test.ts` persona matrix). | Add `PlatformGate` RTL cases: (1) `platformRole: staff\|super_admin` renders children; (2) client-only `me` → `navigate({ to: '/app' })` + forbidden copy; (3) loading skeleton. Optional thin test that `AdminGate` still aliases `PlatformGate`. Do **not** pretend this replaces API authorization. |
| F2 | **P1** | `src/lib/safe-return-path.ts` · `safe-return-path.test.ts` · `login-magic-form.tsx` | **`safePostAuthPath` has no unit tests** (invite sibling fully covered) | `safeInviteReturnPath` has allow/deny/open-redirect/traversal matrix (`safe-return-path.test.ts`). **`safePostAuthPath`** (L25–42: allow `/app`, `/admin`, `/login`, `/invite/accept` + query; reject `//`, schemes, `..`) is **never imported in tests**. Call sites: magic `callbackURL` (`login-magic-form.tsx` L12–16: `safePostAuthPath(next) ?? safeInviteReturnPath(next)`); security audit already flagged this (web-mcp F7). Password login only uses invite path (`login.tsx` `postLoginTarget`). | Extend `safe-return-path.test.ts` with full matrix for `safePostAuthPath` (allow `/app`, `/app/notes`, `/admin`, `/admin/…`, `/login`, invite+query; reject `//evil`, schemes, `..`, `/settings`, empty). Prefer table-driven cases shared with invite helper. |
| F3 | **P1** | Auth UX surface vs tests | **Auth mode matrix is schema/helper only — no component/route tests for dogfood auth flows** | AGENTS auth matrix: password, magic link, forgot/reset, API key (MCP). Present tests: Zod (`login`/`forgot`/`reset`/`changePassword`/`profileName` in `schemas.test.ts`); **`magicLinkSchema` absent**; `account-errors` for change-password/profile API map; **no** RTL for `LoginPage`, `LoginMagicForm`, `ForgotPasswordPage`, `ResetPasswordPage`, invite redirect, or form submit → `apiFetch` path. E2E signs in with **raw** `fetch('/api/auth/sign-in/email')` inside `page.evaluate` (`e2e-design-system.mjs` L140–156), **not** the password form. | Minimum: (1) pure unit for `magicCallbackURL` / `postLoginTarget` (extract if needed) with next allowlist cases; (2) RTL magic form: invalid email validation + 429 toast path; (3) optional invite-accept: missing id, unauth → `/login?next=…`. Keep e2e scoped (CP-E2E = overlays); do not grow into product E2E. |
| F4 | **P2** | `src/lib/auth.ts` `signOutAndClearSession` | **Sign-out fail-closed contract untested** | Docstring L42–45: throws if server revoke fails; callers must not navigate as signed-out. Used by `app-shell` logout (L104–111: catch → error toast, no navigate). **Zero tests** for success (POST + invalidate/remove `me`) or throw-on-failure. | Unit-test with mock `apiFetch` + QueryClient: ok path removes `meQueryKey`; non-ok throws and leaves cache (or documents invalidate-before-throw order). |
| F5 | **P2** | `src/components/auth-gates.test.tsx` | **AuthGate unauth path incomplete** (`!data` without 401) | Production: `unauth = isUnauthorized(error) \|\| (!isError && !data)` (L53). Tests cover **ApiError 401** only. No case for settled query with `data: undefined` / empty session without error object. Happy path does not assert **`OrgProvider` + `AppShell`** wrap (only child text). | Add unauth without `ApiError`; optionally spy that children mount under org context when ok (probe `useOrgContext`). |
| F6 | **P2** | `src/lib/schemas.ts` · `schemas.test.ts` | **`magicLinkSchema` (and `createNoteSchema`) missing from schema suite** | `magicLinkSchema` exported L14–16 and used by magic form validators; `createNoteSchema` L40–43 used by notes. `schemas.test.ts` covers login/forgot/reset/changePassword/profileName only. | Add magicLink email accept/reject (parity with forgot). Optional createNote title/body bounds if notes remain kit dogfood. |
| F7 | **P2** | Org shell composition | **Org switcher / members visibility / tenant headers untested** | Covered: `OrgProvider` storage (empty/valid/invalid id), `orgRoleLabel`, `canManageMembers`. **Uncovered:** `OrgSwitcher` create + optimistic `me` merge (`org-switcher.tsx` L53–77); app-shell **members nav** gated by `canManageMembers` (`app-shell.tsx` L101–102, L182–184); **`X-Org-Id`** on keys/tasks (`keys.tsx` L56/71, `tasks.tsx` L58). No empty-orgs provider case (L51–53 clears active id). | (1) OrgProvider: `orgs: []` → `activeOrgId` null; (2) small pure helper or fetch mock asserting `X-Org-Id` equals active org when listing/minting keys; (3) optional AppShell probe: reader role hides members link, owner shows it. Server IDOR remains API-owned. |
| F8 | **P2** | `src/lib/locale.tsx` · `i18n.test.ts` | **i18n runtime provider under-tested vs catalog contract** | Strong: `messages.contract.test.ts` (non-empty, key parity, no demo passwords) + `i18n.test.ts` default FR + sample `login` strings + releases `pickLocalized`. Weak: **`LocaleProvider`** persist (`kit.locale`), invalid storage fall-back, `setLocale` updates `document.documentElement.lang` / `m` — **no tests**. `apiErrorToMessage` catalog path only asserts **UNAUTHORIZED** (`api.test.ts` L25–36), not full `CODE_TO_MSG` map (`api.ts` L14–23). | RTL: mount provider, `setLocale('en')`, assert stored key + `m.login`; reject garbage localStorage → FR. Optionally table-test each `ErrorCodeName` → message key with a minimal catalog stub. |
| F9 | **P2** | `scripts/e2e-design-system.mjs` · `docs/testing.md` | **CP-E2E is intentionally narrow; auth dogfood is not browser-proven via UI** | E2E: health poll → evaluate BA sign-in → `/admin/design-system#overlays` → dropdown/dialog/sheet + Base UI console filter. **Local only** (`test:e2e:design-system` / `test:e2e:ci`); not in `validate:full` / GHA. Docs: **does not prove** dual-auth, IDOR, org RBAC, a11y. Login form, magic, invite, org switch, members never hit. | Keep scope (avoid product E2E bloat). If raising dogfood bar: one optional local scenario “password form → land `/admin` as staff” **or** rely on unit F1–F3. Do not put flaky e2e into pre-push without ADR. |
| F10 | **P3** | `src/lib/modules.ts`, `app-shell` `isNavActive`, routes | **Demo CRUD / modules / nav chrome lack any tests** (acceptable under T2 floors if contracts hold) | No tests for `useModules` / `isModuleOn` / `getModuleState`; notes/items/tasks/admin pages; `isNavActive` exact-match homes (`app-shell.tsx` L54–58). Coverage floors explicitly low (`vitest.config.ts` L9–15). | Do not chase % on showcase pages. Add tests only when a page encodes **kit contract** (e.g. module enable UI) or a bug repeats. Prefer extracting pure helpers (`isNavActive`) if tested. |
| F11 | **P3** | `src/routes/design-system.overlays.test.tsx` vs e2e | **Unit overlay suite reimplements patterns, not the full `DesignSystemPage`** | Unit mounts isolated Dropdown/Dialog/Sheet/Tooltip trees; e2e hits live admin design-system route. Page-level wiring (sections, i18n labels, admin gate) not unit-tested. | Acceptable dual layer for CP-UI-CONTRACT. If page refactors break section IDs, e2e is SSoT; keep unit for Base UI traps without full stack. |

### Non-findings (healthy — no issue ID)

| Area | Assessment |
|------|------------|
| **CP-FE-CRED** | `api.test.ts` asserts `credentials: 'include'` on `apiFetch`; nested error envelope → `ApiError`. Aligns with docs seam 3. |
| **CP-I18N** | `messages.contract.test.ts` + TS `en: Messages` from `fr`; `i18n:check` path documented. Not semantic/security review (as docs state). |
| **Auth helpers (S1)** | `hasPlatformRole`, `isPlatformActor`, `isClientOnly`, `defaultHomePath`, `isUnauthorized`, `canManageMembers` covered with persona matrix (KitRole admin alone ≠ BO). |
| **AuthGate session UX** | Loading, 401 navigate login, hard-error + retry + login CTA, happy children — solid component baseline. |
| **Org context storage** | First org default, keep valid `kit.activeOrgId`, reset invalid id, throw outside provider. |
| **Open redirect (invite)** | Strong pure tests on `safeInviteReturnPath` (protocol-relative, schemes, traversal, non-invite paths). |
| **Account error copy** | change-password vs profile maps do not cross-contaminate; 401/403/429/400 covered. |
| **Org role labels** | System keys + custom Map/Record + no false “Member” fallback for unknown. |
| **CP-UI / CP-E2E** | Unit overlays + local Playwright design-system smoke; intentional non-CI. |
| **Schema happy/negative** | Login/forgot/reset/change-password/profile Zod edge cases present. |
| **No snapshot theater** | Suites assert behaviour/contracts, not brittle UI snapshots. |
| **Test env** | happy-dom + RTL + jest-dom setup; router/auth mocked cleanly in AuthGate suite. |

## Inventory (tests present)

| File | Focus | ~cases |
|------|--------|--------|
| `src/lib/api.test.ts` | ApiError envelope, `apiErrorToMessage`, `apiFetch` credentials + errors | 6 |
| `src/lib/auth.test.ts` | Platform/client persona, 401 detect, manage-members | 4 |
| `src/components/auth-gates.test.tsx` | **AuthGate only** | 4 |
| `src/lib/org-context.test.tsx` | OrgProvider storage / throw | 4 |
| `src/lib/org-role.test.ts` | Role label map | 5 |
| `src/lib/safe-return-path.test.ts` | **safeInviteReturnPath only** | 4 |
| `src/lib/schemas.test.ts` | Auth-ish Zod (no magic/note) | 8 |
| `src/lib/account-errors.test.ts` | Password/profile error i18n maps | 6 |
| `src/messages/messages.contract.test.ts` | FR/EN catalog contract | 3 |
| `src/lib/i18n.test.ts` | default FR sample keys | 1 |
| `src/lib/health.test.ts` | Env banner visibility | 2 |
| `src/lib/releases.test.ts` | Changelog sort + locale pick | 8 |
| `src/routes/design-system.overlays.test.tsx` | Base UI overlay contracts | 2 |
| **E2E** `scripts/e2e-design-system.mjs` (+ root `test:e2e:ci`) | BA cookie via evaluate + DS overlays | local smoke |

**Not covered by any `*.test.*`:** `PlatformGate`, `safePostAuthPath`, `signOutAndClearSession`, `LoginPage` / magic / forgot / reset / invite-accept routes, `OrgSwitcher`, `AppShell` chrome, `modules.ts`, keys/tasks `X-Org-Id`, admin pages, notes/items/tasks UI.

## Metrics

- **Files reviewed:** 13 Vitest suites under `apps/example-web/src/**/*.test.{ts,tsx}`; e2e `scripts/e2e-design-system.mjs` + root `scripts/e2e-ci.sh` refs; source: `auth-gates`, `auth`, `api`, `safe-return-path`, `schemas`, `locale`, `org-context`, `org-switcher`, `app-shell`, `login`, `login-magic-form`, `invite-accept`, `keys`/`tasks` headers, `routeTree`, `messages/*`, `vitest.config.ts`, `docs/testing.md` CP-\* rows  
- **Issues:** **P0=0 · P1=3 · P2=6 · P3=2**  
- **Coverage floors (intentional T2):** statements/lines **10%**, branches **20%**, functions **12%**  
- **E2E in `validate:full` / GHA:** **no** (local CP-E2E only)  
- **Notable hotspots:**  
  1. `auth-gates.tsx` — PlatformGate untested BO UX gate  
  2. `safe-return-path.ts` — `safePostAuthPath` blind spot for magic-link redirects  
  3. Auth forms + invite-accept — dogfood matrix without component tests  
  4. Multi-tenant FE composition (`OrgSwitcher`, `X-Org-Id`)  

## Recommendations

1. **P1 — Close gate/open-redirect unit holes first:** `PlatformGate` RTL + full `safePostAuthPath` matrix (highest kit-dogfood / security-adjacent ROI; pure or already-mocked seams).  
2. **P1 — Auth composition smoke without full E2E:** extract/test `postLoginTarget` / `magicCallbackURL`; add magic schema + one magic-form validation test; invite-accept unauth→login `next` if cheap.  
3. **P2 — Session lifecycle:** `signOutAndClearSession` fail-closed unit; AuthGate empty-session unauth.  
4. **P2 — Org tenant FE contracts:** empty org list; assert `X-Org-Id` on at least one org-scoped client path (keys or tasks); optional members-nav visibility.  
5. **P2 — LocaleProvider:** storage + `lang` + catalog switch; broaden `apiErrorToMessage` code map if error UX is considered kit contract.  
6. **P3 — Keep T2 floor discipline:** do not raise global % by rendering design-system/admin CRUD; only add risk-mapped contracts. Leave CP-E2E local-only unless ADR moves e2e into CI.  
7. **Keep green (do not regress):** CP-FE-CRED credentials include; messages FR/EN parity; AuthGate 401/hard-error; org storage validity; invite open-redirect matrix; account-errors separation; design-system overlay unit + local e2e.

## Scope notes

- Read-only audit; suites not re-executed in this pass (structure/evidence from source + prior vitest results cache presence).  
- API dual-auth / IDOR / cookie flags are **T2 / security example-api** — not re-scored here except as “FE must not claim them.”  
- Product e2e and a11y matrix are explicitly non-goals per `docs/testing.md`.  
- Cross-ref: security `web-mcp.md` F7 (`safePostAuthPath` untested); architecture P7 low coverage floor; type-safety notes on forms without Zod are product-code quality, not re-listed as test findings except magic schema omission.
