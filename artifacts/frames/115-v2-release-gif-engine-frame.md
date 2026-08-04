---
title: "V2 — Release GIF engine (local, from Metalyde)"
issue: 115
status: approved
tier: F-lite
date: 2026-08-04
---

## Problem

L1 changelog UI is live (avatar → `/app/changelog`, optional `gifSrc`) but operators still have no **kit-owned** local pipeline to record share GIFs. Metalyde has a solid but **monolithic** Playwright+ffmpeg recorder (~900 lines) mixed with product scenarios — products cannot reuse the engine without copy-paste.

## Who

- **Primary:** Kit maintainers dogfooding release notes with GIFs; product builders recording demos offline.
- **Secondary:** Clients watching GIFs in-app (consume assets only).

## Constraints

- Local only — **not** in `validate:full` / GHA.
- **No** workspace package `@gosilex/*` for this tooling.
- Engine under `tooling/release-gifs/`; product scenarios stay app-owned.
- Extract generic layers from Metalyde (cursor, ffmpeg, auth factory, recordClip); improve config, CLI filter, no password in hint files.
- Kit ports: web `:5173`, API `:8787`; BA sign-in; refuse prod hosts.
- System prereq: Chromium + `ffmpeg`/`ffprobe`.
- Parent residual: Spark #163 · L1 #100/#107 done.

## Out of Scope

- CI / pre-push gate for GIFs.
- D1 / CMS / L2 `@gosilex/patchlog` package.
- In-repo Metalyde refactor (product follow-up).
- Large multi-MB GIF commits without size policy (prefer generate + optional copy).

## Premise Validity

**Success in 6 months:** Products record share GIFs via kit engine + own scenarios; changelog pages show demos without dual-editing kit content paths.

**Failure in 6 months:** Each product still maintains a 700+ line fork of Metalyde scripts, or GIFs never ship because there is no documented local pipeline.

**Simplest alternative:** Document “copy Metalyde scripts into product.”
**Why not simplest:** No kit dogfood, no shared cursor/ffmpeg fixes, drift across products.

## Complexity

**Tier: F-lite** — tooling + thin example-web scripts + docs; single domain; architecture already fixed in issue body.

Signals: clear V2.1–V2.4 slices; Metalyde as prior art; L1 gifSrc hook ready.
