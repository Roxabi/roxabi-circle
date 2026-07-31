# Plan 004: Strip password-reset token from URL + feedback pathname-only

> **Executor instructions**: Security hygiene plan. No secret values in commits/logs. Update `plans/README.md` when done.
>
> **Drift check**:
> ```bash
> git diff --stat 3ae7932..HEAD -- \
>   apps/example-web/src/routes/reset-password.tsx \
>   apps/example-web/src/routeTree.tsx \
>   packages/feedback/src/react/FeedbackButton.tsx
> ```

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: plans/001-ship-route-boot-vite-host.md (soft — independent of 002/003)
- **Category**: security
- **Planned at**: commit `3ae7932`, 2026-07-31

## Why this matters

1. **Reset password** keeps the one-time token in the address bar (`?token=…`) for the whole form lifetime → history, screenshots, shoulder-surfing.
2. **Feedback FAB** posts `location.pathname + location.search` to the report endpoint → any sensitive query on authed routes is forwarded to Spark. Reset/invite pages are outside AuthGate today, but this is a durable footgun for kit consumers.

## Current state

### Reset (`apps/example-web/src/routes/reset-password.tsx`)

```ts
const search = useSearch({ strict: false }) as { token?: string; error?: string }
const token = search.token?.trim() ?? ''
// submit uses `token` from search; never stripped from URL
```

Route search validation in `routeTree.tsx` ~67-70 keeps `token` and `error`.

### Feedback (`packages/feedback/src/react/FeedbackButton.tsx` ~139-147)

```ts
page: typeof location !== 'undefined' ? location.pathname + location.search : '',
```

Wired from `apps/example-web/src/components/feedback-fab.tsx` (labels only; no page override).

**Out of scope here (rejected as P0):** SVG MIME allowlist, chart CSS, sk_ autofill (optional one-liner only if you already open `keys.tsx` — do not expand scope).

## Commands you will need

| Purpose | Command | Expected |
|---------|---------|----------|
| Typecheck web | `bun run --filter @gosilex/example-web typecheck` | exit 0 |
| Test web | `bun run --filter @gosilex/example-web test` | exit 0 |
| Test feedback | `bun run --filter @gosilex/feedback test` | exit 0 |
| Lint | `bunx biome check apps/example-web/src/routes/reset-password.tsx packages/feedback/src/react/FeedbackButton.tsx` | exit 0 |

## Scope

**In scope:**
- `apps/example-web/src/routes/reset-password.tsx`
- `apps/example-web/src/routeTree.tsx` only if needed for search cleanup navigation
- `packages/feedback/src/react/FeedbackButton.tsx`
- Optional tiny unit test if feedback package already tests page field (else skip)

**Out of scope:**
- Backend BA reset token generation
- CSP headers on SPA
- Feedback server MIME allowlist (package `form.ts`) unless you must for consistency — prefer client-only pathname change
- `keys.tsx` autofill attrs (unless freebie ≤5 lines)

## Git workflow

- Branch: `fix/fe-w3-reset-token-feedback-page`
- Commit: `fix(web): strip reset token from URL; feedback page path only`
- No push unless asked

## Steps

### Step 1: Capture token then strip URL

In `ResetPasswordPage`:

1. On mount, read `token` (and `error`) from search into React state or `useRef` + `useState`.
2. Immediately navigate/replace to the same route **without** `token` (and without other sensitive params). Keep `error` only if needed for UI, or map error once into state and strip both.

Preferred TanStack pattern:

```ts
const navigate = useNavigate()
const search = useSearch({ from: '/reset-password' }) // if typed; else strict:false
const [token, setToken] = useState('')

useEffect(() => {
  const t = search.token?.trim() ?? ''
  if (t) setToken(t)
  if (search.token || search.error) {
    void navigate({
      to: '/reset-password',
      search: {}, // or only non-sensitive leftovers
      replace: true,
    })
  }
}, [/* careful: don't loop */])
```

Submit must use **state token**, not live search.

If `useEffect` dependency loops: use a `useRef` stripped flag.

**Verify** (manual or playwright snippet): load `/reset-password?token=testtoken` → after paint, URL has no `token`; submitting still sends body token from state (can unit-test state logic if extracted).

### Step 2: Feedback page field = pathname only

In `FeedbackButton.tsx` submit builder:

```ts
page: typeof location !== 'undefined' ? location.pathname : '',
```

Do not send `location.search` or `location.hash`.

**Verify**:
```bash
grep -n "location.search" packages/feedback/src/react/FeedbackButton.tsx || true
```
→ no matches for page payload (search may still exist elsewhere — ensure not in FormData page field).

### Step 3: Gates

```bash
bun run --filter @gosilex/example-web typecheck
bun run --filter @gosilex/example-web test
bun run --filter @gosilex/feedback test
```

## Test plan

- Prefer a small pure helper if strip logic is non-trivial: `takeAndClearResetToken(search) → { token, cleanSearch }`.
- Manual: reset link flow still works against local API (token in email log / Mailpit when transport set).

## Done criteria

- [ ] After loading reset page with `?token=`, address bar no longer contains the token (replace navigation)
- [ ] Reset submit still uses captured token from state/ref
- [ ] Feedback `page` field is pathname only
- [ ] Web + feedback tests + web typecheck exit 0
- [ ] `plans/README.md` 004 → DONE

## STOP conditions

- BA requires token to remain in URL for its own client (unlikely with custom form) — stop and report.
- Stripping search breaks TanStack search typing across app — minimal local cast only; if route tree meltdown, stop.
- Need to change API contract of feedback backend — stop (should not).

## Maintenance notes

- Reviewer: ensure no double-submit race before token state is set.
- Follow-up rejected: SVG allowlist, CSP meta — separate tickets.
