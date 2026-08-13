# Type Safety — example-web (P7)

**Domain:** Type Safety  
**Partition:** `apps/example-web`  
**Date:** 2026-08-12  
**Scope:** TanStack Router / Query / Form, Zod, casts, search/params, API response typing  
**Out of scope (package-owned):** `@kit/api-client` `return data as T` implementation internals (noted only as boundary consumers inherit)

## Summary

`example-web` is in **good shape for a kit SPA dogfood**: TypeScript **strict**, **zero** explicit `any` / `as any` / `@ts-expect-error` / `@ts-ignore` in app source, Router **Register** is wired in `main.tsx`, and auth forms (login, magic, forgot/reset, change-password, profile, create-note) consistently use Zod via TanStack Form `validators.onSubmit` + `safeParse`. Gaps cluster around **route hook discipline** (`useSearch` / `useParams` with `strict: false` + assertion instead of `from:`), **forms that skip Zod** (tasks create, admin user create, invite, items edit, org create), and the systemic **trust-the-server** pattern of `apiFetch<T>` with hand-rolled response types (no runtime parse). No P0 type holes found; residual risk is P1 on path/param wrongness and silent shape drift on gate-critical `/api/me`.

## Findings

| ID | Severity | File | Finding | Evidence | Recommendation |
|----|----------|------|---------|----------|----------------|
| F1 | P1 | `src/routes/org-members.tsx` | **Params bypass typed route tree** — `useParams({ strict: false }) as { orgId: string }` forces `orgId: string` even when missing | L59: `const { orgId } = useParams({ strict: false }) as { orgId: string }`. Route is registered as `path: 'orgs/$orgId/members'` under `/app` in `routeTree.tsx` L189–192. Cast erases `undefined` and Register inference. | Prefer `useParams({ from: '/app/orgs/$orgId/members' })` (or `getRouteApi(...)`). Fail closed if `!orgId` before queries. |
| F2 | P1 | `src/routes/reset-password.tsx`, `src/routes/invite-accept.tsx` | **Search params re-asserted with `strict: false`** despite `validateSearch` on the same routes | Both pages: `useSearch({ strict: false }) as { … }`. `routeTree.tsx` already validates token/error/next (L76–80) and invitationId (L87–89). Login page correctly uses `useSearch({ from: '/login' })` (login.tsx L28). | Use `useSearch({ from: '/reset-password' })` / `from: '/invite/accept'`. Drop the `as` casts; let validateSearch return types flow. |
| F3 | P1 | `src/lib/api.ts` + all `apiFetch<T>` call sites (esp. `lib/auth.ts` `MeResponse`) | **Generic response typing is compile-time only** — no Zod/`safeParse` at JSON boundary; wrong API shape still typechecks | `apiFetch<T>` wraps kit client that returns `data as T`. App defines parallel types (`MeResponse`, `Note`, `TaskRow`, `AdminUser`, `KeyMeta`, …) without schemas. Gates (`isPlatformActor`, `canManageMembers`) trust `me.data` shape. | Keep generics for DX; for **gate-critical** payloads (`/api/me`, mint key) add optional `apiFetchParse(path, schema)` or shared wire Zod in `@kit/types` / app `schemas`. At minimum document “FE types are optimistic”. |
| F4 | P2 | `src/routes/tasks-create-dialog.tsx` | **Task create form has no Zod validators**; visibility narrowed by cast | L37–51: `useForm` with only `defaultValues` + `onSubmit`; L99: `v as 'internal' \| 'shared'`. HTML `required` only on title. `@kit/tasks` already exports `createTaskInputSchema` / `TASK_VISIBILITIES` (package not in web deps). | Add local Zod (or depend on `@kit/tasks` pure schemas for title/desc/visibility). Parse Select value with `z.enum` instead of cast. |
| F5 | P2 | `src/routes/items.tsx` | **Edit form unvalidated**; create schema local + weak field mapping | Create: local `createSchema` (L46–54) with binary `{ form: m.errValidation }` only (L113–114) — no fieldErrors. Edit form (L123–129): **no `validators`**. | Move create+edit schemas to `lib/schemas.ts`; map Zod fieldErrors like notes/login; validate edit label/description max lengths. |
| F6 | P2 | `src/routes/admin/users.tsx`, `src/routes/org-members.tsx`, `src/components/org-switcher.tsx` | **Admin/invite/org create forms skip TanStack Form + Zod** | Admin create: raw `useState` + `onSubmit` email trim check (users L109–114); `platformRole` via `e.target.value as '' \| 'staff' \| 'super_admin'` (L143). Invite: `type="email"` + `email.trim()` only (org-members L246–248). Org create: manual `name.trim()` (org-switcher L96–105). | Prefer TanStack Form + Zod (`z.string().email()`, role `z.enum`, platform role enum). Guard select `onChange` with enum parse. |
| F7 | P2 | `src/components/login-magic-form.tsx`, `src/routes/forgot-password.tsx` | **429 detection uses structural cast instead of `ApiError`** | Both: `e instanceof Error && 'status' in e && (e as { status: number }).status === 429`. `ApiError` already has `.status`; `account-errors.ts` already models BA non-envelope HTTP via message parse. | Use `e instanceof ApiError && e.status === 429` (or shared helper). Align with `changePasswordErrorMessage` / `isUnauthorized`. |
| F8 | P2 | Domain response types across routes | **Hand-rolled DTO unions are too wide / duplicated** — loses FE exhaustiveness | `Member.role: string` (org-members L38); `AdminUser.platformRole: string \| null` (users L25) vs `PlatformRole` in auth.ts; task comments `visibility: string` (tasks L84, tasks-comments-panel L4) vs `'internal' \| 'shared'` on TaskRow; duplicate `OrgRow` in admin/orgs + admin/users. | Centralize app DTO types (or Zod-inferred) in `lib/*` or `@kit/types`. Reuse `PlatformRole` / org role unions where server contract is fixed. |
| F9 | P2 | `src/routes/login.tsx` | **Post-auth navigation via untyped `href`** | L38, L75: `navigate({ href: target })` where `target` is `string` from `safeInviteReturnPath` / `defaultHomePath`. Bypasses Router path literals and search typing. | Prefer typed `to` when path is `/app` or `/admin`; keep `href` only for allowlisted invite return paths (already sanitized). |
| F10 | P2 | `src/routeTree.tsx` login `validateSearch` | **Search `next` is typed as free string** — safety is deferred to call sites | L58–62: only checks `typeof search.next === 'string'`. Open-redirect hardening is in `safeInviteReturnPath` / `safePostAuthPath` (good) but not in validateSearch; raw `next` still flows to LoginMagicForm callback URL builder. | Optionally narrow in validateSearch by running `safeInviteReturnPath`/`safePostAuthPath` so invalid next never enters search type / UI. |
| F11 | P3 | `src/components/auth-gates.tsx` | **Redundant cast after narrowing** | L96–101: after `if (unauth \|\| !me.data) return null`, still `me.data as MeResponse`. `OrgProvider` accepts `MeResponse \| undefined`. | Pass `me.data` without cast. |
| F12 | P3 | `src/lib/theme.tsx` | **Redundant cast on already-narrow return** | `applyTheme` returns `'dark' \| 'light'`; L50/53 cast `as 'light' \| 'dark'`. | Drop cast; type `applyTheme` return explicitly if needed. |
| F13 | P3 | `src/lib/api.ts` | **i18n bridge uses double assertion** | L36–40: `Object.keys(...) as ErrorCodeName[]` then `m[key] as string` then `as Partial<Record<ErrorCodeName, string>>`. Keys are controlled by `CODE_TO_MSG` map so runtime-safe but noisy. | Build messages with a typed loop over `ErrorCodeName` tuple or `satisfies`. |
| F14 | P3 | `src/routes/notes.tsx` (table filter) | **Column value cast** | L153: `row.getValue('body') as string \| undefined` inside filter for typed `Note` column. | Prefer `row.original.body` (typed) or `info.getValue()` in cell path; avoid `getValue` cast. |
| F15 | P3 | `src/lib/org-role.ts` | **Union narrowing via cast** | After `instanceof Map`, L27: `nameByKey as Readonly<Record<string, string>>`. | Use discriminant helper or separate overloads; cast is low risk. |
| F16 | P3 | Non-null assertions after length guards | **`!` on known non-empty arrays** | `org-context.tsx` L56 `orgs[0]!.id`; `org-members.tsx` L137 `roleItems[0]!.value`; `app-shell.tsx` theme order. | Prefer `const first = orgs[0]; if (first) …` for consistency; current uses are guarded. |

### Positive signals (no finding ID)

| Area | Assessment |
|------|------------|
| **`any` / suppressions** | No `any`, `as any`, `@ts-expect-error`, `@ts-ignore` in `src/**`. |
| **TS config** | Extends kit `tsconfig.base` with `strict: true`; app `noEmit` + Vite client types. |
| **Router Register** | `main.tsx` L63–67: `declare module '@tanstack/react-router' { interface Register { router: typeof router } }` — enables typed `to` / `from` when used. |
| **validateSearch present** | login / reset-password / invite-accept all validate search shape in `routeTree.tsx`. |
| **Auth forms + Zod** | `lib/schemas.ts` + login, magic, forgot, reset, change-password, profile, create-note; field-level error mapping; unit tests in `schemas.test.ts`. |
| **Query keys** | Stable `as const` keys (`meQueryKey`, `modulesQueryKey`, keys/org scoped keys). |
| **Error typing** | `ApiError` instanceof checks in auth gates, Query retry, session 401 path. |
| **Open-redirect** | Runtime allowlists in `safe-return-path.ts` (tested) for invite/post-auth paths. |

## Metrics

- **Files reviewed:** ~45 app source files under `apps/example-web/src` (routes, components, lib, messages, routeTree, main) + package.json/tsconfig; tests consulted only for contract/schema coverage
- **Issues:** P0=0 · **P1=3** · **P2=7** · **P3=6**
- **Explicit `any` / `as any`:** 0
- **`@ts-expect-error` / `@ts-ignore`:** 0
- **`strict: false` route hooks:** 3 sites (org-members params, reset-password search, invite-accept search)
- **Forms with Zod validators:** login, magic, forgot, reset, change-password, profile, notes create, items create (weak), design-system demo
- **Forms without Zod:** task create, items edit, admin user create, org invite, org create (switcher)
- **`apiFetch<T>` call sites:** ~25+ (all compile-time only)
- **Notable hotspots:**
  1. Route hooks not using `from:` (F1–F2)
  2. Response DTO optimism / gate surface `/api/me` (F3, F8)
  3. Tasks + admin/invite form validation gaps (F4–F6)

## Recommendations

1. **P1 — Fix route typing discipline:** replace every `useSearch({ strict: false }) as …` / `useParams({ strict: false }) as …` with `from: '<registered path>'` (mirror login). Guard missing `orgId` before enabling queries.
2. **P1 — Document or harden API boundary:** either accept “trust Worker + dual Zod on server” as kit policy in `docs/testing.md` / consumer recipe, or add parse-on-read for `MeResponse` (and optionally mint-key / membership payloads).
3. **P2 — Close form/Zod gaps on dogfood CRUD:** TaskCreateDialog, items edit, admin create user, invite email, org create — same pattern as notes/login (`safeParse` + fieldErrors). Prefer `z.enum` over select casts.
4. **P2 — Prefer `ApiError` for status branches** in magic/forgot (drop structural cast); reuse `account-errors` helpers if useful.
5. **P2 — Deduplicate DTO types** (`OrgRow`, role/visibility unions) and avoid `string` where the server contract is closed.
6. **P3 — Hygiene:** drop redundant casts (AuthGate, theme, notes filter), typed ErrorCode message map, prefer non-`!` access after guards.
7. **Keep:** no `any`, Register module, Zod on auth forms, `safe-*` return paths, Query key `as const`, strict TS.

## Hunt checklist (this partition)

| Check | Result |
|-------|--------|
| Explicit `any` / `as any` | Clean |
| `@ts-expect-error` / `@ts-ignore` | Clean |
| Untyped / loosely typed search params | **Issues** F2, F10 — validateSearch yes; consumers cast |
| Untyped / asserted path params | **Issue** F1 |
| Form / Zod gaps | **Issues** F4–F6; auth path solid |
| Query typing | Generics present; **runtime gap** F3 |
| TanStack Router type safety | Register OK; **from: underused** F1–F2, F9 |
| Non-null assertions without guard | Mostly guarded (F16 P3) |
| Unsafe casts (`as` narrowing) | Present but mostly low severity except route hooks |
