# Recipe L1 — In-app changelog (Nouveautés)

**Status:** shipping in kit dogfood (`example-web`) · GH [#107](https://example.com/kit/issues/107)  
**Package:** **no** (`@kit/patchlog` stays park — DR-B8-03 L2 only)

## Goal

Show clients what changed after a release, inside the product shell (avatar → page), without dual-editing the kit and without merge conflicts on `git merge upstream`.

## Ownership (anti-conflit)

```text
Kit dogfood     → apps/example-web/src/content/releases/*
Product client  → apps/<product>-web/src/content/releases/*   (or equivalent under apps/<product>-*)
Kit dev notes   → optional root CHANGELOG.md / GitHub Releases (not the client UI source)
```

| Do | Don’t |
|----|--------|
| Put **client-facing** notes only under the **product** app tree | Append to a shared kit `CHANGELOG.md` from the product |
| Copy the page + `getReleases` pattern into `apps/<product>-web` | Patch `packages/*` or `apps/example-*` for métier copy |
| Keep kit demo releases generic | Ship product métier strings in the kit |

**One file = one owner.** Kit writes kit dogfood. Product writes product. Never both on the same path.

## Kit reference (dogfood)

| Piece | Path |
|-------|------|
| Data | `apps/example-web/src/content/releases/index.ts` |
| Helpers | `apps/example-web/src/lib/releases.ts` |
| Page | `apps/example-web/src/routes/changelog.tsx` |
| Route | `/app/changelog` in `routeTree.tsx` (auth layout) |
| Menu | `NavUser` child in `app-shell.tsx` |
| i18n | `navChangelog`, `changelogTitle`, `changelogDesc`, `changelogEmpty` |

## Product copy steps

1. Create `apps/<product>-web/src/content/releases/` with your `Release` entries (FR-first titles/bullets).
2. Copy or re-implement `getReleases` / locale pick (tiny helpers — no package required).
3. Add a route under your authed shell (e.g. `/app/changelog`).
4. Add an avatar menu item via existing `NavUser` `children`.
5. Optional: put GIF assets under `apps/<product>-web/public/release-gifs/` and set `gifSrc`.
6. **Never** dual-edit kit zones to configure product notes (`config/kit/zero-edit-zones.json`).

See also: [`docs/kit/playbooks/start-product.md`](../playbooks/start-product.md) · [`docs/kit/product-consumer-contract.md`](../product-consumer-contract.md).

## Out of L1

- D1 / admin CMS / draft-publish workflows  
- Shared package until ≥2 products need the same CRUD (L2 unpark)  
- GIF recording in CI (`validate:full`) — **no**; use §V2 local engine  

## Park pointer

Live SSoT: [`docs/kit/park-decisions-b8.md`](../park-decisions-b8.md) — DR-B8-03 **L1 shipping** · L2 package still park.

## V2 — Local release GIFs (optional)

**Status:** kit engine + dogfood scripts · GH [#115](https://example.com/kit/issues/115)  
**Not** in CI / `validate:full`. **Not** a workspace package.

### Ownership

| Piece | Owner |
|-------|--------|
| Engine (`tooling/release-gifs/`) | kit (shared Node tooling) |
| Kit scenarios (`apps/example-web/scripts/kit/*release-gifs*`) | kit dogfood only |
| Product scenarios + `public/release-gifs/*` | product app |

### Prereqs

1. `bun run db:migrate && bun run db:seed`
2. API `apps/example-api` → `:8787` · web `apps/example-web` → `:5173`
3. Chromium (Playwright or `CHROME_PATH`)
4. System **ffmpeg** + **ffprobe**

### Commands (kit)

```bash
bun run --filter @kit/example-web setup:release-gifs
# → artifacts/release-gifs/.auth-demo.json + agent-browser.hint.json (no password)

bun run --filter @kit/example-web record:release-gifs
# RECORD_ONLY=02-changelog bun run --filter @kit/example-web record:release-gifs
# → artifacts/release-gifs/*-share.gif
```

### Wire into changelog UI

```bash
mkdir -p apps/example-web/public/release-gifs
cp artifacts/release-gifs/*-02-changelog-share.gif apps/example-web/public/release-gifs/
# set gifSrc: '/release-gifs/<filename>' on a Release in src/content/releases/
```

Large GIFs: prefer gitignore + generate locally; only commit small demos if needed.

### Product copy

1. Import engine from `tooling/release-gifs/index.mjs` (or copy the folder into the product monorepo).
2. Write product-only scenarios (selectors + flows).
3. Point `outDir` at product `artifacts/release-gifs/`.
4. Never dual-edit kit `example-web` scenarios for métier demos.

Engine details: [`tooling/release-gifs/README.md`](../../../tooling/release-gifs/README.md).

