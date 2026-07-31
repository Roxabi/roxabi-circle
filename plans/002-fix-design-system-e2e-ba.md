# Plan 002: Repair design-system e2e for Better Auth + admin path

> **Executor instructions**: Follow step by step. Verify each command. STOP if conditions hit. Update `plans/README.md` when done.
>
> **Drift check**:
> ```bash
> git diff --stat 3ae7932..HEAD -- apps/example-web/scripts/e2e-design-system.mjs docs/testing.md
> ```

## Status

- **Priority**: P0
- **Effort**: S
- **Risk**: LOW
- **Depends on**: plans/001-ship-route-boot-vite-host.md
- **Category**: tests | dx
- **Planned at**: commit `3ae7932`, 2026-07-31

## Why this matters

The only browser smoke for Base UI overlays still posts to **HMAC** `POST /api/auth/login`, which was **removed** (ADR-0002 Better Auth only). Live login is `POST /api/auth/sign-in/email`. The script also opens **`/design-system`** (legacy redirect) instead of **`/admin/design-system`**, and defaults `E2E_BASE_URL` to `127.0.0.1:5173` (needs plan 001 host bind). Result: kit “composition proof” is broken or false.

## Current state

- Script: `apps/example-web/scripts/e2e-design-system.mjs`
  - Lines ~48–55 (on `3ae7932`): `fetch('/api/auth/login', …)` with seed demo email/password
  - Line ~61: `page.goto(\`${BASE}/design-system#overlays\`)`
  - Defaults: `BASE = process.env.E2E_BASE_URL ?? 'http://127.0.0.1:5173'`, Chrome `/usr/bin/google-chrome`
- App login: `apps/example-web/src/routes/login.tsx` → `apiFetch('/api/auth/sign-in/email', …)`
- API: BA routes under `/api/auth/*`; no HMAC login handler
- Seed users (local only — do not invent new secrets):
  - `demo@gosilex.local` / kit demo password (platform super_admin via seed) — good for `/admin/*`
  - `staff@gosilex.local` also platform actor
- Package script: `bun run --filter @gosilex/example-web test:e2e:design-system` or root `bun run test:e2e:design-system`
- **Prerequisite processes**: API on `:8787`, web on `:5173`, D1 migrated+seeded

**ADR-0002:** browser session = Better Auth only; dual path is cookie **or** Bearer `sk_`, not HMAC.

## Commands you will need

| Purpose | Command | Expected |
|---------|---------|----------|
| E2E (API+web up) | `bun run --filter @gosilex/example-web test:e2e:design-system` | exit 0, no `E2E FAIL` |
| Grep legacy login | `grep -n "auth/login" apps/example-web/scripts/e2e-design-system.mjs` | no matches |

## Scope

**In scope:**
- `apps/example-web/scripts/e2e-design-system.mjs`
- Optionally `docs/testing.md` — one sentence if it still documents HMAC login for this smoke
- Optionally root/README quick-start line if it references the old path (only if clearly wrong)

**Out of scope:**
- GitHub Actions Playwright CI (deferred B7)
- Replacing `waitForTimeout` with full locator strategy (nice-to-have only if quick)
- Changing design-system page content
- API auth implementation

## Git workflow

- Branch: `fix/fe-w1-e2e-design-system-ba` (or stacked on 001)
- Commit: `fix(example-web): point design-system e2e at Better Auth sign-in`
- No push unless asked

## Steps

### Step 1: Switch login to Better Auth

In `e2e-design-system.mjs` `page.evaluate` login block:

- URL: `/api/auth/sign-in/email`
- Body: JSON `{ email, password }` (same seed user as today is fine if platform-capable)
- Keep `credentials: 'include'`
- Keep `content-type: application/json`
- Prefer Origin consistency: fetch from page origin (already true)

After login, optionally assert session before navigation:

```js
const me = await fetch('/api/me', { credentials: 'include' })
if (!me.ok) throw new Error(`me ${me.status}`)
```

**Verify** (static):
```bash
grep -n "sign-in/email\|auth/login" apps/example-web/scripts/e2e-design-system.mjs
```
→ has `sign-in/email`, no `auth/login`.

### Step 2: Navigate to admin design-system

Change goto target to:

```js
await page.goto(`${BASE}/admin/design-system#overlays`, { waitUntil: 'networkidle' })
```

(Legacy `/design-system` still redirects, but admin path is the real route and proves platform gate.)

If login user is not platform actor, e2e will redirect to `/app` — use `demo@gosilex.local` or `staff@gosilex.local` with their **seed** passwords already used in script/README (do not invent or log new secrets).

**Verify**: script contains `/admin/design-system`.

### Step 3: Document prerequisites in script header (short)

Header comment should state:

1. `bun run db:migrate && bun run db:seed` (or reset) once
2. `example-api` `bun run dev` → :8787
3. `example-web` `bun run dev` → :5173 (after plan 001, `127.0.0.1` works)
4. Chrome at `CHROME_PATH` (default `/usr/bin/google-chrome`)

### Step 4: Run e2e against live servers

Start API + web if not running, then:

```bash
bun run --filter @gosilex/example-web test:e2e:design-system
```

→ exit 0.

If Chrome missing: STOP and report; do not skip silently with fake pass.

### Step 5 (optional): docs touch

If `docs/testing.md` still says e2e uses `POST /api/auth/login`, update that one reference to `sign-in/email` + `/admin/design-system`. Do not rewrite entire testing doc.

## Test plan

- The e2e script **is** the test. No Vitest addition required.
- Cases implicitly covered: BA cookie set via proxy origin, platform access to design-system, overlay open without Base UI contract console errors.

## Done criteria

- [ ] Script uses `/api/auth/sign-in/email` only
- [ ] Script loads `/admin/design-system` (or hash overlays under that path)
- [ ] `grep auth/login apps/example-web/scripts/e2e-design-system.mjs` empty
- [ ] `bun run --filter @gosilex/example-web test:e2e:design-system` exit 0 with API+web up
- [ ] `plans/README.md` row 002 → DONE

## STOP conditions

- Plan 001 not done / SPA still black-screens — stop.
- Seed user cannot access `/admin` after BA login — stop; report user/role; do not weaken `PlatformGate`.
- Overlay selectors changed on design-system page — update selectors carefully; if page structure is gone, stop and report.
- No Chrome binary — stop (do not mark DONE).

## Maintenance notes

- Reviewer: confirm no regression to HMAC path; credentials stay seed-only.
- Follow-up: CI job for this script is **out of scope** (DIR-03 / B7).
- Specs under `artifacts/` may still mention old login path historically — do not bulk-edit artifacts unless operator asks.
