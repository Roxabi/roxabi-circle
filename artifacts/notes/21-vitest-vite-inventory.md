---
status: reference
normative: false
---

# #21 pre-bump inventory — vitest / vite / plugin-react

Generated: 2026-08-06T13:40Z
Pins target (plan): vitest+coverage-v8 ^4.1.10 · vite ^8.2.0 · @vitejs/plugin-react ^6.0.5

| path | field | today | target |
|------|-------|-------|--------|
| package.json (root) | devDependencies.@vitest/coverage-v8 | 3.2.7 | 4.1.10 |
| apps/example-api/package.json | devDependencies.vitest | ^3.2.0 | ^4.1.10 |
| apps/example-web/package.json | devDependencies.vitest | ^3.2.0 | ^4.1.10 |
| apps/example-web/package.json | devDependencies.vite | ^6.3.0 | ^8.2.0 |
| apps/example-web/package.json | devDependencies.@vitejs/plugin-react | ^4.5.0 | ^6.0.5 |
| apps/mcp-example/package.json | devDependencies.vitest | ^3.2.0 | ^4.1.10 |
| packages/api-client/package.json | devDependencies.vitest | ^3.2.0 | ^4.1.10 |
| packages/auth/package.json | devDependencies.vitest | ^3.2.0 | ^4.1.10 |
| packages/core/package.json | devDependencies.vitest | ^3.2.0 | ^4.1.10 |
| packages/db/package.json | devDependencies.vitest | ^3.2.0 | ^4.1.10 |
| packages/email/package.json | devDependencies.vitest | ^3.2.0 | ^4.1.10 |
| packages/i18n/package.json | devDependencies.vitest | ^3.2.0 | ^4.1.10 |
| packages/mcp/package.json | devDependencies.vitest | ^3.2.0 | ^4.1.10 |
| packages/storage/package.json | devDependencies.vitest | ^3.2.0 | ^4.1.10 |
| packages/types/package.json | devDependencies.vitest | ^3.2.0 | ^4.1.10 |
| packages/ui/package.json | devDependencies.vitest | ^3.2.0 | ^4.1.10 |
| packages/ui/package.json | devDependencies.vite | ^6.3.0 | ^8.2.0 |
| packages/ui/package.json | devDependencies.@vitejs/plugin-react | ^4.5.0 | ^6.0.5 |

## Config surface (no version change expected unless green fails)

- apps/example-api/vitest.config.ts
- apps/example-web/vite.config.ts
- apps/example-web/vitest.config.ts
- apps/mcp-example/vitest.config.ts
- packages/api-client/vitest.config.ts
- packages/auth/vitest.config.ts
- packages/core/vitest.config.ts
- packages/db/vitest.config.ts
- packages/email/vitest.config.ts
- packages/i18n/vitest.config.ts
- packages/mcp/vitest.config.ts
- packages/storage/vitest.config.ts
- packages/types/vitest.config.ts
- packages/ui/vite.config.ts
- packages/ui/vitest.config.ts
- packages/config/vitest-coverage.mjs
- scripts/test-coverage.sh

## Dual-major assert (post-install)

| package | lock majors |
|---------|-------------|
| vitest | 4.1.10 only (no 3.x) |
| @vitest/coverage-v8 | 4.1.10 only |
| vite | 8.2.0 only (no 6.x for kit) |
| @vitejs/plugin-react | 6.0.5 only |

**Result: DUAL_MAJOR_OK**

package.json: no leftover `vitest` ^3 / `vite` ^6 / coverage-v8 3.x.

## Coverage floor recalibration (Vitest 3 → 4)

Measured on same sources/tests (`origin/main` Vitest 3.2.7 vs this branch Vitest 4.1.10, provider v8).

| Package | Metric | Vitest 3 | Vitest 4 | Old floor | New floor |
|---------|--------|----------|----------|-----------|-----------|
| core | stmts | 83.7 | 69.44 | 75 | 68 |
| core | lines | 83.7 | 70.58 | 75 | 69 |
| core | branches | 92 | 68 | 70 | 66 |
| ui | stmts | 25.78 | 18.46 | 20 | 17 |
| ui | lines | 25.78 | 18.8 | 20 | 17 |
| ui | branches | 80.28 | 17.25 | 50 | 16 |
| ui | funcs | 63.33 | 24.47 | 40 | 23 |
| example-api | stmts | 84.55 | 79.87 | 80 | 78 |
| example-api | branches | 72.91 | 66.87 | 70 | 65 |
| example-web | funcs | 47.36 | 13.37 | 20 | 12 |

Unchanged floors elsewhere. Rationale: Vitest 4 v8 remapping changes statement/branch/function counting; floors stay just below measured so gates remain ratchet-like, not vacuous zero.

## Ship prep (T6)

### Pins landed
- vitest: `^4.1.10` (all workspaces)
- @vitest/coverage-v8: `4.1.10` (root)
- vite: `^8.2.0` (example-web + packages/ui)
- @vitejs/plugin-react: `^6.0.5` (example-web + packages/ui)

### Gates (post clean install)
- dual-major: OK
- typecheck: OK
- test:coverage: OK (floors recalibrated — see table above)
- build:kit: OK (Vite 8.2.0)

### Dependabot #4
- Close/supersede **before** merge of dedicated PR (plugin-react-only incomplete peers).
- Title shape: `chore(deps): wave3 vitest4 + vite8 + plugin-react`

### Config touch
- `packages/config/vitest-coverage.mjs`: `ignoreEmptyLines: true` (Vitest 3 parity)
- Floor recalibration in core, ui, example-api, example-web vitest configs only
