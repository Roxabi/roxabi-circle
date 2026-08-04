# Recipe L1 — In-app changelog (Nouveautés)

**Status:** shipping in kit dogfood (`example-web`) · GH [#107](https://github.com/go-silex/silex-boilerplate/issues/107) · Spark **#100**  
**Package:** **no** (`@gosilex/patchlog` stays park — DR-B8-03 L2 only)

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
6. **Never** dual-edit kit zones to configure product notes (`config/zero-edit-zones.json`).

See also: [`docs/playbooks/start-product.md`](../playbooks/start-product.md) · [`docs/product-consumer-contract.md`](../product-consumer-contract.md).

## Out of L1

- D1 / admin CMS / draft-publish workflows  
- Shared package until ≥2 products need the same CRUD (L2 unpark)  
- GIF recording in CI (`validate:full`) — local scripts only if you port the Metalyde pattern  

## Park pointer

Live SSoT: [`docs/park-decisions-b8.md`](../park-decisions-b8.md) — DR-B8-03 **L1 shipping** · L2 package still park.
