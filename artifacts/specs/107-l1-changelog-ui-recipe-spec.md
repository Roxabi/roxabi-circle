---
title: "L1 — Changelog UI recipe (example-web, not package)"
description: "App-owned releases content + avatar menu page in example-web; no package; dual-catalogue ownership."
type: spec
status: approved
issue: 107
tier: F-lite
date: 2026-08-04
---

## Context

- **Source:** `artifacts/frames/107-l1-changelog-ui-recipe-frame.md` (approved, F-lite)
- **Issue:** [GH #107](https://github.com/go-silex/silex-boilerplate/issues/107) · Spark **#100** (unpark L1)
- **Park SSoT:** DR-B8-03 in `docs/park-decisions-b8.md` — L1 recipe shipping; **L2 package still park**
- **Prior art:** Metalyde local GIF scripts (`extern-client-metalyde/scripts/record-release-gifs.mjs`) — tooling only, not in-app UI

## Intent

**Solve:** Kit has no client-facing “Nouveautés” surface. Products either skip in-app release notes or would dual-edit kit / share one CHANGELOG (merge conflicts + zero-edit DENY). Unpark residual of B8 without inventing a package.

**Why now:** Explicit product ask (avatar → page + GIF pattern); Spark #100 body rewritten; GH issue linked.

## Goal

Connected user opens **Nouveautés** from the avatar menu, sees ≥1 demo release (title, date, bullets, optional GIF), content lives **only** under the web app tree, and a short recipe documents kit vs product ownership so forks never share a changelog file with upstream.

## Users

- **Primary:** Kit dogfooders / product builders copying the pattern into `apps/<product>-web`
- **Secondary:** End users reading notes; operators recording optional share GIFs offline

## Expected Behavior

1. User is signed in (app shell).
2. Avatar menu includes **Nouveautés** (FR) / **What's new** (EN) above logout.
3. Click → `/app/changelog` (auth layout; unauthenticated → existing login redirect).
4. Page shows releases **newest first**: version badge, localized title, ISO date (locale display), bullet list, optional GIF if `gifSrc` set.
5. Empty list is valid (empty state copy) but dogfood ships ≥1 demo release.
6. Product clone: copy page + content module pattern into **product** app paths only; never edit `packages/*` for notes.

## Data Model & Consumers

### Release entry (app-owned, static)

```ts
// Conceptual type — live in apps/example-web/src/content/releases/
type Release = {
  /** stable id / filename stem, e.g. "2026-08-04-kit-demo" */
  id: string
  /** display version, e.g. "0.1.0" */
  version: string
  /** calendar date YYYY-MM-DD (sort key) */
  date: string
  title: { fr: string; en: string }
  bullets: { fr: string[]; en: string[] }
  /** optional public URL path, e.g. "/release-gifs/demo.gif" */
  gifSrc?: string
}
```

**Storage decision (L1):** TypeScript module(s) under `apps/example-web/src/content/releases/` (e.g. `index.ts` exporting `releases: Release[]` + individual entries). Rationale: same pattern as i18n catalogs; typecheck without Vite MD pipeline; zero runtime fetch.

Products may later switch to MD/JSON in their own tree — recipe notes that; kit dogfood does not require MD parser.

**Not stored:** D1, R2 for notes (GIF binary optional under `apps/example-web/public/release-gifs/`).

| Consumer | Fields | When |
|---|---|---|
| Changelog page | all | render list |
| Avatar menu | — (link only) | nav |
| Recipe doc | ownership paths | product start |
| GIF scripts (P1) | paths only | local record |

### Ownership (invariant)

```text
Kit dogfood     → apps/example-web/src/content/releases/*
Product client  → apps/<product>-web/.../releases/*   (only)
Kit dev notes   → optional root CHANGELOG.md / GH Releases (not this UI)
```

## Breadboard

| ID | Affordance | Handler | Data |
|----|------------|---------|------|
| U1 | Avatar menu item Nouveautés | `NavUser` child `DropdownMenuItem` → `navigate({ to: '/app/changelog' })` | locale label from messages |
| U2 | Changelog page shell | `ChangelogPage` under app layout | `useLocale` |
| U3 | Release list | map `getReleases()` sorted by `date` desc | `Release[]` |
| U4 | Release card | version, title[locale], date, bullets[locale], optional `<img>`/`<video>` gif | single `Release` |
| U5 | Empty state | copy when `releases.length === 0` | messages |
| N1 | Route register | `createRoute` path `/app/changelog` parent `appLayoutRoute` | `routeTree.tsx` |
| N2 | Page title in shell | `pageTitle()` branch for `/app/changelog` | messages |
| S1 | Content module | export typed releases | `src/content/releases/` |
| S2 | i18n keys | `navChangelog`, page title/desc, empty | `messages/fr.ts` + `en.ts` |
| D1 | Recipe doc | ownership + copy steps | `docs/playbooks/` or `docs/recipes/changelog-l1.md` |
| D2 | Park pointer amend | DR-B8-03 row: L1 shipping · L2 park | `docs/park-decisions-b8.md` |
| T1 | Unit test | sort order + locale field pick | vitest |
| G1 | GIF scripts (P1 optional) | setup + record Playwright local | `scripts/` or `docs/templates/release-gifs/` |

## Slices

| # | Slice | Demo | IDs |
|---|-------|------|-----|
| **V1** | Content + page + avatar + i18n + route + park/recipe docs | Login → avatar → Nouveautés → see demo release FR/EN | U1–U5, N1–N2, S1–S2, D1–D2, T1 |
| **V2** | Optional GIF pipeline (local only) | Script records or placeholder GIF on card | G1, U4 gif |

**V1 is the merge bar.** V2 may ship same PR if cheap, else follow-up — not blocking DoD of #107/Spark #100.

## Edge Cases

| Case | Handling |
|------|----------|
| Unauthenticated hit `/app/changelog` | Existing `appLayout` / auth redirect (same as `/app/settings`) |
| Missing locale string on a release | Fallback: prefer `fr` then `en` then `id` (document in code comment) |
| Invalid `date` | Keep entry; sort invalids last; no throw |
| Broken `gifSrc` | Image `onError` hide or placeholder alt; page still usable |
| Product merges upstream | Product content paths untouched → no conflict |
| Someone adds `packages/patchlog` | Out of scope — reject in review (DR-B8-03 L2) |

## Success Criteria

- [ ] **AC1:** Signed-in user reaches `/app/changelog` from avatar menu item (FR/EN label).
- [ ] **AC2:** Page lists ≥1 demo release with version, date, title, ≥1 bullet for current locale.
- [ ] **AC3:** Release data lives under `apps/example-web` only (not `packages/*`).
- [ ] **AC4:** No new workspace package / no D1 schema / no admin CRUD for releases.
- [ ] **AC5:** Recipe doc states dual-catalogue ownership (kit dogfood vs product paths).
- [ ] **AC6:** `docs/park-decisions-b8.md` DR-B8-03 reflects L1 shipping; L2 package still park.
- [ ] **AC7:** Unauthenticated access does not render the page without auth (redirect/login).
- [ ] **AC8:** `bun run typecheck` + targeted example-web tests green for new code.
- [ ] **AC9 (V2 optional):** Local GIF setup/record script documented; **not** in `validate:full` / CI.

## Non-goals (explicit)

- `@gosilex/patchlog`, D1, CMS, GH Releases scraper
- Shared kit↔product changelog file
- GIF as CI gate
- Staff-only vs client visibility matrix (all authed users see same list in L1)

## Test plan (minimal)

| Layer | What |
|-------|------|
| Unit | `getReleases` sort desc; locale picker fallback |
| Manual / e2e optional | Avatar → page smoke local (not CI) |
| Doc | Recipe path greppable; park table updated |

## Open questions

none — package decision, path ownership, and route surface locked by issue + frame.
