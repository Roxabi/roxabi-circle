# Release GIFs engine (local tooling)

Generic Playwright + ffmpeg pipeline extracted from the Metalyde pattern.

**Not** a workspace package `@gosilex/*`. **Not** in CI / `validate:full`.

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

## Product usage

1. Import from monorepo root: `import { recordClip, runAuthSetup } from '../../../tooling/release-gifs/index.mjs'`
2. Write **your** scenarios (selectors + flows) in the product app.
3. Point `outDir` at product `artifacts/release-gifs/` (gitignored).
4. Optionally copy `*-share.gif` → `public/release-gifs/` and set `gifSrc` on release notes.

Kit dogfood: `apps/example-web/scripts/setup-release-gifs.mjs` + `record-release-gifs.mjs`.

See [`docs/recipes/changelog-l1.md`](../../docs/recipes/changelog-l1.md) §V2.
