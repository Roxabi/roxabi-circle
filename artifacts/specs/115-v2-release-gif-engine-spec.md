---
title: "V2 — Release GIF engine (local, from Metalyde)"
description: "Generic Playwright+ffmpeg release GIF engine + example-web dogfood scenarios; no CI."
type: spec
status: approved
issue: 115
tier: F-lite
date: 2026-08-04
---

## Context

- **Source:** `artifacts/frames/115-v2-release-gif-engine-frame.md` (approved)
- **Issue:** [GH #115](https://github.com/go-silex/silex-boilerplate/issues/115) · Spark **#163**
- **Parent L1:** #107 / PR #113 / Spark #100 — changelog page + `gifSrc?` already live
- **Prior art:** `extern-client-metalyde/scripts/{setup,record}-release-gifs*.mjs`

## Intent

**Solve:** No reusable local pipeline to record share GIFs for in-app changelogs; Metalyde solution is product-coupled monolithe.

**Why now:** L1 shipped `gifSrc` surface; product ask for Metalyde-quality demos without forking 900 lines per app.

## Goal

Developer with seed + api + web + chromium + ffmpeg can run kit setup/record scripts, produce ≥1 `*-share.gif` locally, optionally copy to `public/release-gifs/` and reference via `gifSrc` — with engine reusable by products that only write their own scenarios.

## Users

- Kit maintainers (dogfood)
- Product builders (copy engine pattern + own demos)

## Expected Behavior

1. Read `docs/recipes/changelog-l1.md` §V2 for prereqs and commands.
2. `bun run` (or filter) `setup:release-gifs` → writes storageState under `artifacts/release-gifs/` (gitignored blobs).
3. `record:release-gifs` → runs selected scenarios → `artifacts/release-gifs/*-share.gif` (+ webm).
4. Optional copy into `apps/example-web/public/release-gifs/`; demo `Release.gifSrc` points there when file exists.
5. Product: import/copy `tooling/release-gifs/*`, write product scenarios only.

## Data Model & Consumers

### Engine config (conceptual)

```ts
type ReleaseGifConfig = {
  baseURL: string
  outDir: string
  statePath: string
  email: string
  password: string
  postLoginPath?: string
  extraCookies?: { name: string; value: string }[]
  forbiddenHostSubstrings?: string[]
  viewport?: { width: number; height: number }
}
```

### Scenario plugin

```ts
type Scenario = {
  id: string           // e.g. "01-notes"
  startPath: string    // e.g. "/app/notes"
  demo: (page, helpers: { moveClick }) => Promise<void>
}
```

| Consumer | What |
|----------|------|
| setup script | auth-setup factory |
| record script | recordClip + scenarios |
| Changelog page | existing gifSrc (no API change required) |
| Recipe | human operators |

## Breadboard

| ID | Affordance | Handler | Data |
|----|------------|---------|------|
| E1 | cursor-init | inject init script | DOM cursor |
| E2 | ffmpeg-gif | webm→palette→gif | files |
| E3 | auth-setup | BA POST sign-in + storageState | cookies |
| E4 | record-core | recordClip, moveClick, ensureAuth | config |
| K1 | setup-release-gifs.mjs | kit defaults :5173 demo user | e2e env |
| K2 | record-release-gifs.mjs | load scenarios, RECORD_ONLY | out dir |
| K3 | scenarios kit | notes + changelog | Playwright locators |
| K4 | package.json scripts | setup/record | example-web |
| D1 | recipe §V2 | prereqs + product ownership | md |
| D2 | gitignore artifacts/release-gifs | blobs | git |
| C1 | optional gifSrc wire | release demo entry | content/releases |

## Slices

| # | Slice | Demo |
|---|-------|------|
| **V2.1** | Engine `tooling/release-gifs/` | Node import smoke / dry config refuse prod |
| **V2.2** | Kit setup + record + scenarios | Local: produce ≥1 share.gif |
| **V2.3** | public + gifSrc (if practical) | Page shows image when asset present |
| **V2.4** | Recipe + template notes | Product path documented |

V2.1+V2.2+V2.4 = merge bar. V2.3 best-effort (no huge binaries forced in git).

## Edge Cases

| Case | Handling |
|------|----------|
| ffmpeg missing | Exit non-zero + install hint |
| App down | Setup health check fails like Metalyde/e2e |
| Prod URL | Refuse (forbidden substrings) |
| No storageState | Auto-run setup once |
| RECORD_ONLY empty/unknown | Error list known scenario ids |
| Broken gifSrc | Existing L1 onError hide |
| Password in agent hint | **Do not** write password to hint JSON |

## Success Criteria

- [ ] **AC1:** `tooling/release-gifs/` exports auth setup, recordClip, webmToGif, cursor helpers (or clear module map).
- [ ] **AC2:** example-web setup script creates storageState without password in hint file.
- [ ] **AC3:** example-web record script documents how to produce ≥1 GIF locally (prereqs listed).
- [ ] **AC4:** ≥1 kit scenario (notes or changelog) implemented.
- [ ] **AC5:** Recipe §V2: engine vs product scenarios; not in CI.
- [ ] **AC6:** No new `@gosilex/*` package; no validate:full/CI job for GIFs.
- [ ] **AC7:** Forbidden prod hosts guard on setup+record.
- [ ] **AC8 (soft):** gifSrc on demo release when public asset exists, or explicit doc “generate then set gifSrc”.

## Non-goals

CI gate · Metalyde in-repo refactor · CMS · multi-product shared scenarios in kit

## Test plan

| Layer | What |
|-------|------|
| Unit/smoke | Config refuse-prod; maybe pure path helpers without browser |
| Manual | setup + record once (evidence in PR notes) |
| Doc | recipe greppable |

## Open questions

none — layout fixed in issue body (`tooling/release-gifs/` + thin scripts).
