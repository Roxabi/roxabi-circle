# Template — product release GIFs

Copy the kit pattern:

1. Engine: monorepo `tooling/release-gifs/` (or vendor a copy).
2. Product scripts: `setup-release-gifs.mjs` + `record-release-gifs.mjs` + **your** scenarios.
3. Env: `PLAYWRIGHT_BASE_URL`, demo credentials, `RECORD_ONLY`.
4. Output: `artifacts/release-gifs/` (gitignore) → optional `public/release-gifs/` + `gifSrc`.

See [`docs/kit/recipes/changelog-l1.md`](../../recipes/changelog-l1.md) §V2 and kit dogfood under `apps/example-web/scripts/kit/`.
