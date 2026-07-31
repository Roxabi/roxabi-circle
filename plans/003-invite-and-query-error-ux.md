# Plan 003: Invite return-URL (allowlisted) + error/loading UX

> **Executor instructions**: Follow step by step. Security-sensitive: open-redirect rules are mandatory. Update `plans/README.md` when done.
>
> **Drift check**:
> ```bash
> git diff --stat 3ae7932..HEAD -- \
>   apps/example-web/src/routes/invite-accept.tsx \
>   apps/example-web/src/routes/login.tsx \
>   apps/example-web/src/components/app-shell.tsx \
>   apps/example-web/src/routes/admin/orgs.tsx \
>   apps/example-web/src/routes/admin/modules.tsx \
>   apps/example-web/src/routes/org-members.tsx \
>   apps/example-web/src/messages/fr.ts \
>   apps/example-web/src/messages/en.ts
> ```

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: MED (redirect handling) — mitigated by allowlist
- **Depends on**: plans/001-ship-route-boot-vite-host.md
- **Category**: bug
- **Planned at**: commit `3ae7932`, 2026-07-31

## Why this matters

1. **Invite accept** redirects logged-out users to `/login` **without** preserving `invitationId`. Login always goes to `defaultHomePath` — invite flow is broken unless the user re-opens the email (comment in code acknowledges this; product email still points at `/invite/accept?invitationId=`).
2. Hard `/api/me` errors show **infinite loading** on invite page and a **dead-end** AuthGate (no retry).
3. Admin org/module (and members) lists treat query errors as empty success.
4. Sidebar health badge shows **offline** while health is still loading.

## Current state

### Invite (`apps/example-web/src/routes/invite-accept.tsx`)

```ts
// ~18-24
if (isUnauthorized(me.error) || (!me.data && !me.isError)) {
  // After login user re-opens invite link (accept URL in email)
  void navigate({ to: '/login' })
}
// ~56-61
if (me.isLoading || !me.data) {
  return (/* m.loading forever on isError */)
}
```

### Login (`apps/example-web/src/routes/login.tsx`)

- On success: `navigate({ to: defaultHomePath(meAfter) })` — no return path.
- Already-session `useEffect`: same `defaultHomePath`.

### AuthGate (`apps/example-web/src/components/app-shell.tsx` ~472-478)

- Hard error: title `m.error` + `m.loadFailed` only — no retry button, no login link.

### Health badge (`app-shell.tsx` ~262-267)

```tsx
{health.data?.ok ? m.online : m.offline}
```

### Admin lists exemplar bug (`admin/orgs.tsx` ~48-54)

- Loading → skeleton; else empty vs list; **no** `isError` branch.
- **Good pattern** to copy: `apps/example-web/src/routes/notes.tsx` ~116-130 (`isError` + `m.loadFailed` + `m.retry` + `refetch`).

### i18n

- `m.retry`, `m.loadFailed`, `m.login` already exist in `messages/fr.ts` + `en.ts` and contract test.
- Add keys only if needed (e.g. `inviteLoginToAccept` optional).

### Security rule (non-negotiable)

Post-login `next` / return path:

- Must be a **relative** path starting with `/`
- Must **not** start with `//`
- Must match an **allowlist**. For this plan, allowlist is **invite accept only**:

```text
^/invite/accept(?:\?.*)?$
```

Reject everything else → fall back to `defaultHomePath(me)`.

Do **not** implement a generic open `?next=` for arbitrary app routes in this plan.

## Commands you will need

| Purpose | Command | Expected |
|---------|---------|----------|
| Typecheck | `bun run --filter @gosilex/example-web typecheck` | exit 0 |
| Tests | `bun run --filter @gosilex/example-web test` | exit 0 |
| i18n contract | `bun run i18n:check` | exit 0 |
| Lint touch | `bunx biome check apps/example-web/src` | exit 0 (or fix only in-scope) |

## Scope

**In scope:**
- `apps/example-web/src/routes/invite-accept.tsx`
- `apps/example-web/src/routes/login.tsx`
- `apps/example-web/src/lib/auth.ts` and/or new small helper e.g. `lib/safe-return-path.ts` (prefer pure function + unit test)
- `apps/example-web/src/components/app-shell.tsx` (AuthGate hard-error + health badge only)
- `apps/example-web/src/routes/admin/orgs.tsx`
- `apps/example-web/src/routes/admin/modules.tsx`
- `apps/example-web/src/routes/org-members.tsx` (error states on list queries)
- `apps/example-web/src/messages/fr.ts`, `en.ts` (if new keys)
- Unit test file for allowlist helper (e.g. `lib/safe-return-path.test.ts`)

**Out of scope:**
- Backend invite email URL format
- Open generic post-login redirect for all pages
- Split of `app-shell.tsx`
- AlertDialog / Select polish (plan 006)
- `useOrgContext` throw (plan 005)

## Git workflow

- Branch: `fix/fe-w2-invite-error-ux`
- Commits: logical units OK (`fix(web): invite return path`, `fix(web): query error states`)
- Conventional commits; no push unless asked

## Steps

### Step 1: Pure allowlist helper

Add something like:

```ts
// apps/example-web/src/lib/safe-return-path.ts
/** Returns path if allowlisted relative invite-accept URL; else null. */
export function safeInviteReturnPath(candidate: unknown): string | null {
  if (typeof candidate !== 'string') return null
  const t = candidate.trim()
  if (!t.startsWith('/') || t.startsWith('//')) return null
  // Reject protocol-relative and absolute
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(t)) return null
  try {
    const u = new URL(t, 'http://local.invalid')
    if (u.pathname !== '/invite/accept') return null
    // preserve query (invitationId)
    return `${u.pathname}${u.search}`
  } catch {
    return null
  }
}
```

Unit tests (table-driven):

| input | expected |
|-------|----------|
| `/invite/accept?invitationId=abc` | same |
| `/invite/accept` | `/invite/accept` |
| `//evil.com` | null |
| `https://evil.com` | null |
| `/app` | null |
| `/invite/accept/../admin` | null (pathname not exactly `/invite/accept`) |
| empty / undefined | null |

**Verify**: `bun run --filter @gosilex/example-web test -- src/lib/safe-return-path.test.ts` → pass.

### Step 2: Invite page → login with `next`

When redirecting unauthenticated users from invite-accept:

```ts
const next = `/invite/accept?invitationId=${encodeURIComponent(invitationId)}`
void navigate({
  to: '/login',
  search: { next }, // wire via route validateSearch
})
```

Also handle `me.isError && !isUnauthorized`: show error + retry (`me.refetch`) + link to login (with same `next`), **not** infinite spinner.

### Step 3: Login route search + post-login navigation

- Extend `loginRoute` in `routeTree.tsx` **or** read search with `useSearch({ strict: false })` consistently:
  - `next?: string`
- On successful login **and** on “already logged in” effect:
  1. `const safe = safeInviteReturnPath(next)`
  2. if safe → `navigate({ to: safe })` — for TanStack, may need `href` navigate or parse path+search; if `to` typing is strict, use `navigate({ href: safe })` if supported, or `window.location.assign(safe)` **only** after allowlist (still relative).
  3. else → `defaultHomePath(me)`

**Verify typecheck** after wiring.

### Step 4: AuthGate hard-error UX

Replace dead-end hard error with:

- Message `m.loadFailed`
- Button `m.retry` → `me.refetch()`
- Secondary link/button to `/login` (optional clear: invalidate me queries like logout light)

### Step 5: Health badge loading state

```tsx
{health.isLoading
  ? m.loading // or a short “…” if loading is too noisy in badge
  : health.data?.ok
    ? m.online
    : m.offline}
```

Prefer not flashing offline: loading ≠ offline.

### Step 6: Admin / members query errors

Mirror `notes.tsx` error UI for:

- `admin/orgs.tsx` orgs query
- `admin/modules.tsx` modules query  
- `org-members.tsx` members + invitations queries (any list that currently falls through to empty)

### Step 7: Gates

```bash
bun run --filter @gosilex/example-web typecheck
bun run --filter @gosilex/example-web test
bun run i18n:check
```

## Test plan

- **Required:** unit tests for `safeInviteReturnPath` (open-redirect cases).
- Manual (if servers up): open `/invite/accept?invitationId=x` logged out → login → land back on invite page with same id (accept may 404 if id fake — page should still show accept UI, not home).
- Plan 005 will add AuthGate RTL; not required here unless easy.

## Done criteria

- [ ] Unauthenticated invite → login carries allowlisted `next`
- [ ] Login rejects non-allowlisted `next` (unit tests prove)
- [ ] Invite page shows error UI on non-401 me failure
- [ ] AuthGate hard-error has retry
- [ ] Admin orgs/modules (and members lists) show error+retry on `isError`
- [ ] Health badge does not show offline while `isLoading`
- [ ] typecheck + web tests + i18n:check exit 0
- [ ] `plans/README.md` 003 → DONE

## STOP conditions

- TanStack Router cannot express `href`/search navigation without large route typing rewrite — stop with minimal repro; do not cast blindly across the app.
- Allowlist helper would need backend changes — stop (should not).
- Fix appears to require editing `packages/ui` — stop.

## Maintenance notes

- Reviewer: **focus on open-redirect tests** and that `/app` is rejected as `next`.
- Expanding allowlist later (e.g. `/app/notes`) needs explicit product decision + tests — not drive-by.
- Deferred: shared `requireSession` helper for all `beforeLoad` (ARCH-03) — only if you already touch routeTree for login search; optional micro-cleanup, not required.
