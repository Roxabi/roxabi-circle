# Plan 001: Ship route boot fix (TanStack id+path) + Vite host bind

> **Executor instructions**: Follow step by step. Run every verification. If a STOP condition hits, stop and report — do not improvise. Update `plans/README.md` status when done (unless a reviewer maintains the index).
>
> **Drift check (run first)**:
> ```bash
> git diff --stat 3ae7932..HEAD -- apps/example-web/src/routeTree.tsx apps/example-web/vite.config.ts
> ```
> If files changed beyond the intended W0 fix, re-read live files before editing.

## Status

- **Priority**: P0
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: bug | dx
- **Planned at**: commit `3ae7932`, 2026-07-31

## Why this matters

TanStack React Router throws at boot if a route sets both `id` and `path`. That left `#root` empty → **black page** on `http://localhost:5173/`. Separately, Vite could bind only `[::1]`, so `http://127.0.0.1:5173` (default e2e BASE) refused connections. Without this plan, later e2e and manual QA are unreliable.

## Current state

- `apps/example-web/src/routeTree.tsx` — route tree. Pathless layout correctly uses `id: 'authed'` only. **Bug (on `3ae7932`)**: layout routes used both:
  - `id: 'client-app'` + `path: '/app'`
  - `id: 'admin'` + `path: '/admin'`
- Worktree may **already** contain the fix (remove those `id`s). Confirm with `git diff`.
- `apps/example-web/vite.config.ts` — proxy `/api` and `/health` → `127.0.0.1:8787`. May already have `host: true`.
- Error observed in headless Chrome: `Error: Route cannot have both an 'id' and a 'path' option.`

**Convention:** path routes → `path` only; pathless layouts → `id` only (TanStack Router).

## Commands you will need

| Purpose | Command | Expected on success |
|---------|---------|---------------------|
| Typecheck web | `bun run --filter @gosilex/example-web typecheck` | exit 0 |
| Unit tests web | `bun run --filter @gosilex/example-web test` | exit 0 |
| Lint (optional scoped) | `bunx biome check apps/example-web/src/routeTree.tsx apps/example-web/vite.config.ts` | exit 0 |

## Scope

**In scope:**
- `apps/example-web/src/routeTree.tsx`
- `apps/example-web/vite.config.ts`

**Out of scope:**
- `apps/example-api/scripts/seed-local.ts` (unrelated worktree change)
- Any invite/e2e/security work (plans 002–004)
- `packages/ui`

## Git workflow

- Branch: `fix/fe-w0-route-boot-vite-host` (or repo feature convention)
- Commit style (examples from log): `fix(example-web): …` / `feat(web): …`
- Example message: `fix(example-web): remove route id+path clash; bind Vite host`
- Do **not** push/PR unless operator asks.

## Steps

### Step 1: Confirm or apply routeTree fix

Ensure `appLayoutRoute` and `adminLayoutRoute` have **`path` only** (no `id`). Keep `authedLayoutRoute` as pathless with **`id: 'authed'` only**.

Target shape:

```ts
const appLayoutRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/app',
  // NO id
  beforeLoad: async ({ context }) => { /* unchanged */ },
  component: () => (/* unchanged */),
})

const adminLayoutRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/admin',
  // NO id
  beforeLoad: async ({ context }) => { /* unchanged */ },
  component: () => (/* unchanged */),
})
```

Optional one-line comment is fine:
`// TanStack Router: do not set both id and path on the same route.`

**Verify**:
```bash
grep -n "id: 'client-app'\|id: \"client-app\"\|id: 'admin'" apps/example-web/src/routeTree.tsx || true
```
→ no matches for those layout ids. `id: 'authed'` may still appear once.

### Step 2: Confirm or apply Vite `host: true`

In `apps/example-web/vite.config.ts` `server` block, set:

```ts
server: {
  host: true, // IPv4 + IPv6 so localhost and 127.0.0.1 both work
  port: 5173,
  proxy: { /* keep existing /api and /health */ },
},
```

**Verify**:
```bash
grep -n "host:" apps/example-web/vite.config.ts
```
→ shows `host: true` (or equivalent that binds 0.0.0.0).

### Step 3: Automated gates

```bash
bun run --filter @gosilex/example-web typecheck
bun run --filter @gosilex/example-web test
bunx biome check apps/example-web/src/routeTree.tsx apps/example-web/vite.config.ts
```
→ all exit 0.

### Step 4: Manual smoke (if API+web already running; else start briefly)

With `cd apps/example-api && bun run dev` and `cd apps/example-web && bun run dev`:

```bash
curl -sS -o /dev/null -w "%{http_code}\n" http://127.0.0.1:5173/
curl -sS -o /dev/null -w "%{http_code}\n" http://localhost:5173/
```
→ both `200`.

Optional headless: open `/login` and assert body text contains `Se connecter` or `Bienvenue` (no pageerror `id` and a `path`).

## Test plan

- No new unit tests required (boot config + router options).
- Regression is covered by plan **002** e2e once SPA boots.

## Done criteria

- [ ] Neither `/app` nor `/admin` layout routes set both `id` and `path`
- [ ] Vite server has host bind suitable for `127.0.0.1`
- [ ] `bun run --filter @gosilex/example-web typecheck` exit 0
- [ ] `bun run --filter @gosilex/example-web test` exit 0
- [ ] Only in-scope files changed for this plan
- [ ] `plans/README.md` row 001 → DONE

## STOP conditions

- TanStack version in lockfile requires a different route API (unlikely) — stop and report package version.
- Removing `id` breaks typed route references elsewhere (grep fails typecheck) — stop; do not invent pathless wrappers without reporting.
- Operator forbids commit of partial worktree with other dirty files — stage **only** the two in-scope paths.

## Maintenance notes

- Reviewer: confirm no leftover `id` on path routes; keep pathless `authed` pattern as the exemplar.
- Future routes: never add `id` when `path` is set.
- Deferred: not-found component (optional polish, plan 006 or later).
