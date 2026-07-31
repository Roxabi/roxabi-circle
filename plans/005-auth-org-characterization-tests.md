# Plan 005: Characterization tests (AuthGate/org/schemas) + fail-closed `useOrgContext`

> **Executor instructions**: Prefer small, high-signal tests over coverage %. Update `plans/README.md` when done.
>
> **Drift check**:
> ```bash
> git diff --stat 3ae7932..HEAD -- \
>   apps/example-web/src/components/app-shell.tsx \
>   apps/example-web/src/lib/org-context.tsx \
>   apps/example-web/src/lib/auth.ts \
>   apps/example-web/src/lib/schemas.ts
> ```
> Prefer running **after plan 003** so AuthGate retry / invite helpers exist to test.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: MED (orgContext throw can break mis-mounted call sites)
- **Depends on**: plans/003-invite-and-query-error-ux.md
- **Category**: tests | tech-debt
- **Planned at**: commit `3ae7932`, 2026-07-31

## Why this matters

Critical FE multi-tenant paths (AuthGate, PlatformGate, org picker storage, login schemas) have **almost no** automated FE coverage. Coverage floor is intentionally 10% (`vitest.config.ts`) — the fix is **named contracts**, not vanity %. `useOrgContext` currently **no-ops** outside provider (empty orgs + noop setter), unlike `useLocale` which throws — silent multi-tenant bugs.

## Current state

- Tests that exist: `lib/api.test.ts`, `lib/auth.test.ts` (helpers only), `lib/i18n.test.ts`, `lib/health.test.ts`, `messages.contract.test.ts`, `routes/design-system.overlays.test.tsx`
- `AuthGate` / `PlatformGate`: `apps/example-web/src/components/app-shell.tsx` ~409-490
- `useOrgContext` fail-open: `lib/org-context.tsx` ~72-82
- `useLocale` throw exemplar: `lib/locale.tsx` ~51-54
- Schemas: `lib/schemas.ts` (`loginSchema`, reset/invite schemas)
- Test env: happy-dom, setup `src/test/setup.ts` (jest-dom only)
- Exemplar pure tests: `lib/auth.test.ts`

## Commands you will need

| Purpose | Command | Expected |
|---------|---------|----------|
| All web tests | `bun run --filter @gosilex/example-web test` | exit 0 |
| Typecheck | `bun run --filter @gosilex/example-web typecheck` | exit 0 |
| Grep call sites | `grep -rn "useOrgContext" apps/example-web/src` | only under AuthGate/OrgProvider |

## Scope

**In scope:**
- `apps/example-web/src/lib/org-context.tsx` (+ optional `useOrgContextOptional` if needed)
- New tests:
  - `apps/example-web/src/lib/org-context.test.tsx` (or `.ts`)
  - `apps/example-web/src/lib/schemas.test.ts`
  - `apps/example-web/src/lib/auth.test.ts` (extend: `canManageMembers`, `isUnauthorized`)
  - `apps/example-web/src/components/auth-gates.test.tsx` (or colocate) for AuthGate/PlatformGate
- Minimal export split **only if required** to test gates without mounting full sidebar (e.g. export gates from same file — prefer testing via imports of existing exports `AuthGate`, `PlatformGate`)

**Out of scope:**
- Raising coverage floors in `vitest.config.ts`
- Full `app-shell` chrome tests (theme, nav, logout network)
- Playwright CI
- Plan 006 polish

## Git workflow

- Branch: `test/fe-w4-auth-org-characterization`
- Commit: `test(example-web): AuthGate org-context schemas contracts` + `fix(web): fail-closed useOrgContext`
- No push unless asked

## Steps

### Step 1: Extend pure auth helper tests

In `auth.test.ts`, add cases for:

- `isUnauthorized` — `ApiError` 401 true; 403/500 false; non-ApiError false
- `canManageMembers` — owner/admin true; member/reader false; missing org false

Pattern: existing `me()` factory in that file.

**Verify**: filter test file passes.

### Step 2: Schema unit tests

Create `schemas.test.ts`:

- `loginSchema` accepts valid email+password; rejects empty password / bad email
- `resetPasswordSchema` (or equivalent names in `schemas.ts`) mismatch confirm fails; short password fails

Read actual exports from `schemas.ts` before writing — do not invent schema names.

### Step 3: Org context fail-closed + tests

1. Grep all `useOrgContext` usages — must be under `OrgProvider` (AuthGate wraps AppShell).
2. Change `useOrgContext` to **throw** if context null (match `useLocale` message style).
3. If any legitimate optional use exists, add `useOrgContextOptional` returning null context — **only if grep finds a need**; otherwise throw only.

Tests with happy-dom:

- Provider with me orgs → activeOrgId selection + localStorage key `gosilex.activeOrgId` (read actual `STORAGE_KEY` in file)
- Invalid stored id resets
- Outside provider → throw

**Verify**: full web test suite green.

### Step 4: AuthGate / PlatformGate RTL (minimal)

Create tests that wrap:

- `QueryClientProvider` + memory/static router **or** test gates by mocking `useMe` module

Preferred approach (least flaky):

1. Mock `../lib/auth` `useMe` via `vi.mock`
2. Render `AuthGate` with a child marker text
3. Cases:
   - `isLoading` → shows loading UI (`m.loading` or skeleton)
   - 401 / unauth → eventually navigates or renders null + navigate mock called with `/login`
   - hard error → shows `loadFailed` and retry if plan 003 added it
   - success → children visible (and OrgProvider present: child that calls `useOrgContext` does not throw)

PlatformGate:

- non-platform me → redirect/toast path (read live `PlatformGate` implementation; mock navigate)

Use `@testing-library/react` already in package.json.

If router mocking is too heavy after two attempts: STOP and ship steps 1–3 only; mark 005 partial DONE with note — **do not** invent a flaky 200-line harness.

### Step 5: Gates

```bash
bun run --filter @gosilex/example-web typecheck
bun run --filter @gosilex/example-web test
```

## Test plan (summary)

| File | Cases |
|------|--------|
| `auth.test.ts` | isUnauthorized, canManageMembers matrix |
| `schemas.test.ts` | login/reset validation |
| `org-context.test.tsx` | provider, storage, throw outside |
| `auth-gates.test.tsx` | AuthGate load/unauth/error/success; PlatformGate deny |

## Done criteria

- [ ] `useOrgContext` throws outside provider (or optional API documented)
- [ ] New/extended unit tests pass for auth helpers + schemas + org-context
- [ ] AuthGate characterization tests exist **or** documented STOP with steps 1–3 shipped
- [ ] Full `example-web` test + typecheck exit 0
- [ ] No coverage floor change
- [ ] `plans/README.md` 005 → DONE (or DONE with note if gates skipped)

## STOP conditions

- Throwing `useOrgContext` breaks a legitimate call site outside provider — introduce optional hook, re-run tests; if still broken, stop and report call site.
- RTL + TanStack Router setup exceeds ~2 hours without green test — ship pure tests only and report.
- Plan 003 not merged and AuthGate still has no retry — still test current hard-error UI; do not re-implement 003 here.

## Maintenance notes

- Reviewer: ensure mocks don’t test only the mock; assert user-visible text/roles.
- Next: pin these files in `docs/testing.md` inventory if operator wants (docs optional).
- Do **not** raise floors until these contracts stay green for a sprint.
