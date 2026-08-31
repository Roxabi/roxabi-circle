# Release GIFs engine (local tooling)

Generic Playwright + ffmpeg pipeline extracted from the product pattern.

**Not** a workspace package `@kit/*`. **Not** in CI / `validate:full`.

## Modules

| File | Role |
|------|------|
| `config.mjs` | `normalizeConfig`, forbid prod-like hosts |
| `cursor-init.mjs` | Human-like demo cursor init script |
| `ffmpeg-gif.mjs` | webm → share GIF (`ffmpeg` / `ffprobe`) |
| `auth-setup.mjs` | Better Auth email sign-in → storageState |
| `record-core.mjs` | `recordClip`, `moveClick`, `ensureAuthState` |
| `index.mjs` | re-exports |

## Prereqs

- App running locally (kit: API `:8787` + web `:5173`)
- Seeded demo user
- Chromium (Playwright / system)
- System `ffmpeg` + `ffprobe`

**`PLAYWRIGHT_BASE_URL`:** hostname `localhost` (not `127.0.0.1` — Next hydrates poorly). Engine still *allows* `127.0.0.1` for Vite dogfood.

## Deliverable

The **GIF files on disk**, not the recorder script. After `record:*`, open each output (Read image). Done when:

- overlay **circle** (OS cursor hidden via `cursor: none`)
- **click** squash + ripple visible (≥ 1 frame; `clickHoldMs` ≥ 320)
- color = product accent (kit default purple) — not destructive red `#e11d48`
- stylesheet + `.is-click` (never rewrite `element.style.cssText` on every move)

Re-record after a cursor/CSS change. Uploading or committing the old file is the bug.

## Product usage

1. Import from monorepo root: `import { recordClip, runAuthSetup } from '../../../tooling/release-gifs/index.mjs'`
2. Write **your** scenarios (selectors + flows) in the product app.
3. Point `outDir` at product `artifacts/release-gifs/` (gitignored).
4. Optionally copy `*-share.gif` → `public/release-gifs/` and set `gifSrc` on release notes.

One-off (README embed, not changelog): same engine or a thin product script; `outDir` = the path the doc embeds. No new kit profile file.

Kit dogfood: `apps/example-web/scripts/kit/setup-release-gifs.mjs` + `record-release-gifs.mjs`.

See [`docs/kit/recipes/changelog-l1.md`](../../docs/kit/recipes/changelog-l1.md) §V2.
