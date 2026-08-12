# Axial Drift — Structural

**Date:** 2026-08-12  
**Axis:** ADR-0001 (packages compose apps; product domain never under `packages/**`)  
**Machine baseline:** import-boundary 0 · banlist OK · extract-dry-run OK (see [`machine-baseline.md`](./machine-baseline.md))  
**Scope:** Structural smells *beyond* the gate — reverse deps, sibling purity, duplicates, gate gaps, workspace dep directions.

## Summary

Primary axis is **healthy**. No package sources import apps (workspace name or relative). Pure incubating packages (`@kit/flows`, `@kit/tasks`, `@kit/comments`) stay leaf-level (no `@kit/*` deps). Allowed package edges form a thin stack: `types` ← `core` / `api-client` ← `auth` ← `mcp`. Apps compose packages through public `"."` exports only (no deep `@kit/pkg/src/...` forking found).

Residual structural risk is **process-layer**, not reverse-dep:

1. **R5** (routes ↛ repos) is documented as unproven by the gate and **already violated once** in `example-api` (`routes/me.ts`).
2. The import-boundary gate has deliberate blind spots (tests skipped, no package-sibling allowlist, no `package.json` dep direction, file-wide exemptions).
3. **Compose-by-copy migrations** (auth dual SQL; flows/tasks package sketches vs applied app SQL) create drift surface for product consumers.
4. **Audience / visibility** duplicated between `@kit/tasks` and `@kit/comments` by design (cycle avoidance) — small N×M seed if a third package needs the same types.

No P0 reverse-dep or product-in-packages leak found in this pass.

## Findings

| ID | Severity | File | Finding | Evidence | Recommendation |
|---|---|---|---|---|---|
| S-01 | **P1** | `apps/example-api/src/routes/me.ts` | **R5 layer leak:** route imports repos directly (ADR-0001 secondary axis: routes → services → repos). Gate explicitly does **not** enforce R5. | L6–7: `import * as platformRolesRepo from '../repos/platform-roles'` · `import * as usersRepo from '../repos/users'` while other routes (orgs, tasks, notes…) stay on services. AGENTS: routes “ne peut pas” → repos direct. | Move `GET /api/me` reads into a service (e.g. `services/user-shell` / `me`); keep route as HTTP + guards only. Optional: extend import-boundary with R5 for `apps/*/src/routes/**` → `**/repos/**`. |
| S-02 | **P1** | `scripts/check-import-boundaries.ts` | **Gate gaps vs claimed structural bar.** Proves R1–R4 only; known non-claims match residual risk. | Header L11–13 + `docs/testing.md` CP-IMPORT: no R5; skips `*.test.ts`/`*.spec.ts` (`isSourceFile` L54); no package-sibling purity graph; no `package.json` dep direction; exemptions skip **entire importer file** (L413); dynamic non-literal imports invisible. | Keep honesty in docs (already good). Priority hardeners: (a) R5 for example-api routes; (b) optional allowlist of package→package edges; (c) warn on `package.json` workspace deps without source edge (or reverse). Do **not** treat green CP-IMPORT as full layering proof. |
| S-03 | **P2** | `packages/comments/src/audience.ts` (+ `visibility.ts`) | **Intentional twin of `@kit/tasks` Audience/visibility** to avoid package cycles — structural duplication. | Comment L1: “Mirror of @kit/tasks Audience — kept local to avoid package cycles.” Visibility helpers parallel (`canView*` / `filter*ForAudience` / `canSet*Visibility`) nearly isomorphic. | Acceptable for 2 packages. If a third consumer needs AudiencePort, extract `@kit/audience` (or tiny shared types in `@kit/types`) **once** — three-strikes rule (ADR-0001). Do not make `comments` depend on `tasks` (wrong direction). |
| S-04 | **P2** | `packages/flows/migrations/0001_flows_plans_runs.sql` vs `apps/example-api/migrations/0012_flows_plans_runs.sql` | **Package SQL sketch ≠ applied SSoT** — consumers can fork the wrong file. | Package sketch: `created_at`/`updated_at` as **text**; header says OUT OF DATE. Applied 0012: **integer ms** + composite UNIQUE/FK. Tasks/comments package migrations similarly marked SKETCH. | Keep banners loud (already). Prefer CI check: package sketch header must contain `SKETCH` / `NOT applied`; optional diff-allowlist. Product playbook: “copy from `apps/example-api/migrations` dogfood, not package sketch.” |
| S-05 | **P2** | `packages/auth/migrations/*` ↔ `apps/example-api/migrations/0005–0007*` | **Auth migrations are real dual-copy** (compose-by-copy), not sketch-only — drift risk higher than flows. | ADR-0002: “Apply BA migrations (`packages/auth/migrations/*` composed into app migrations).” Package exports `./migrations/*`. App re-hosts as numbered D1 chain. Dual SSoT without automated sync. | Prefer single source: either app copies from package via scripted compose on generate, or document “package is canonical, app must match hash.” Lightweight: checksum gate package SQL ↔ app slices. |
| S-06 | **P2** | `packages/mcp/src/schemas.ts` vs `apps/example-web/src/lib/auth.ts` | **Parallel `MeResponse` shapes** (MCP subset Zod vs web TS type) — not a package reverse-dep, but dual wire contract. | MCP: `meResponseSchema` subject (+ optional authMethod/requestId) for whoami. Web: fuller `MeResponse` (orgs, platformRole, email…). Documented “not full HTTP API SSoT.” | OK while MCP only needs subject. If more fields shared, promote wire types to `@kit/types` or OpenAPI-derived shared schema. Do not put SPA-only fields into `@kit/mcp`. |
| S-07 | **P3** | `apps/example-api/src/lib/rate-limit.ts` | **Platform helper still app-local** (`assertRateLimit` D1). AGENTS lists `@kit/rate-limit` as P1 package. Not N×M yet (single deployable). | Used from routes + services (auth, invite, mint, email, admin-users). Solid D1 implementation — ready for promote when 2nd app. | Leave until second product/API needs it (three-strikes). When promoting: pure-ish helper + ports for DB; keep CF Rate Limiting binding as escape hatch (comment already notes). |
| S-08 | **P3** | `apps/*/vitest.config.ts` | **Relative escape into `packages/config`** instead of workspace package export. | `import { makeCoverage } from '../../packages/config/vitest-coverage.mjs'`. `@kit/config` `exports` only `./tsconfig.base.json` — **not** the coverage helper. Gate does not flag apps→packages. | Export `./vitest-coverage.mjs` from `@kit/config` and import `@kit/config/vitest-coverage` (or similar) so tooling follows the same compose axis as runtime packages. |
| S-09 | **P3** | `packages/ui/src/components/app-sidebar.tsx` | **Sample product chrome (Acme Inc / shadcn demo data) lives under kit package.** Example-web mostly composes primitives + `NavUser`, not full `AppSidebar` demo graph. | Hardcoded `data.teams` / Acme Inc L23+. Exported from package `index.ts`. | Treat as design-system block sample: either demote to story-only / design-system route data in **app**, or keep clearly marked sample and ensure products never ship Acme strings. Low axial risk. |
| S-10 | **P3** | Cross-package access helpers | **Parallel thin role helpers** in `@kit/flows` and `@kit/tasks` (`canAdmin*`, owner/admin lists). | `flows/src/access.ts` vs `tasks/src/access.ts` — similar orgRole/platformRole patterns, independent constants. | Fine for incubating modules. Share only if matrices converge; prefer `@kit/auth` org-role helpers as SSoT for hierarchy, module packages for domain gates. |
| S-11 | — | packages/** | **Clean: packages ↛ apps.** | Grep: no `apps/` paths under packages sources; no `@kit/example-*` imports from packages. Relative `../../apps` absent. | Keep CP-IMPORT as primary machine bar. |
| S-12 | — | apps + packages | **Clean: no deep forking of `@kit/*` internals** (`@kit/foo/bar` source imports). | Grep `@kit/[^'"]+/` in `*.{ts,tsx}`: zero matches. Apps use public package roots only. | Maintain `exports["."]` discipline; avoid adding wildcard `exports["./*"]` unless intentional. |
| S-13 | — | package graph | **Clean sibling dependency direction.** | Workspace deps only: `core→types`, `api-client→types`, `auth→core`, `mcp→auth`. Leaf: flows, tasks, comments, db, storage, email, i18n, ui, config, types. No flows↔mcp edge. | Any new package→package edge needs ADR or ≥2 call sites; protect pure runners (flows/tasks/comments). |
| S-14 | — | apps wrappers | **Clean thin composition (not forks).** | `example-api` `middleware/require-auth.ts` wires `createRequireAuth` + ports; `example-web` `lib/api.ts` wraps `@kit/api-client` with i18n; `session-env.ts` delegates cookie name to `@kit/auth`. No local `class AppError`. | Keep app files as ports/adapters; promote only when second app copies logic. |

## Metrics

| Metric | Value |
|---|---|
| Packages scanned (`packages/*` with package.json) | 14 (`api-client`, `auth`, `comments`, `config`, `core`, `db`, `email`, `flows`, `i18n`, `mcp`, `storage`, `tasks`, `types`, `ui`) |
| Apps scanned | 3 (`example-api`, `example-web`, `mcp-example`) |
| Package → app source imports | **0** |
| Deep `@kit/*/…` source imports | **0** |
| Allowed package→package workspace edges | **4** (`core→types`, `api-client→types`, `auth→core`, `mcp→auth`) |
| Pure leaf packages (no `@kit/*` dep) | flows, tasks, comments, db, storage, email, i18n, ui, config, types |
| Routes with direct `repos/` import | **1** file (`routes/me.ts`; 2 repo modules) |
| Intentional type mirrors (Audience/visibility) | tasks ↔ comments |
| Migration dual surfaces | auth (compose-copy); flows/tasks/comments (sketch vs applied) |
| import-boundary exemptions active | **0** (`tools/import-boundary-exemptions.txt` comments only) |
| Machine baseline (Wave 0) | import-boundary 0 · banlist OK · extract-dry-run OK |

### Package dependency direction (workspace)

```text
@kit/types          (leaf)
@kit/core         → types
@kit/api-client   → types
@kit/auth         → core
@kit/mcp          → auth
@kit/flows        (leaf · pure)
@kit/tasks        (leaf · pure)
@kit/comments     (leaf · pure)
@kit/db | storage | email | i18n | ui | config  (leaf)

apps/example-api  → auth, core, db, email, comments, flows, storage, tasks, types
apps/example-web  → api-client, auth, i18n, types, ui
apps/mcp-example  → mcp
```

No upward edges (packages → apps). No cycles.

### Gate vs reality (check-import-boundaries)

| Rule | Enforced? | Reality in tree |
|---|---|---|
| R1 packages ↛ apps (workspace name) | Yes | Clean |
| R2 packages ↛ apps (relative) | Yes | Clean |
| R3 example-web ↛ example-api | Yes | Clean |
| R4 example-web ↛ `cloudflare:workers` / email | Yes | Clean |
| R5 routes ↛ repos | **No** | **1 leak** (`me.ts`) |
| Package sibling allowlist | **No** | Currently OK by convention |
| `package.json` dep without import / reverse | **No** | Deps match source edges today |
| Test-only illegal edges | **No** (tests skipped) | Unmeasured |
| Deep internal forking | **No** (not a rule) | Clean by inspection |

## Recommendations

### Do now (cheap, high signal)

1. **Fix S-01:** move `routes/me.ts` repo usage behind a service — restores AGENTS layer story and removes the only live R5 counterexample.
2. **Treat CP-IMPORT as partial:** when claiming “structural green,” cite R1–R4 only; link this file for R5 + migration dual-copy residuals.

### Next (medium)

3. **Optional R5 gate** in `check-import-boundaries.ts` (or sibling script): fail `apps/*/src/routes/**` importing `../repos` or `**/repos/**`.
4. **Migration hygiene:** checksum or banner CI for package sketches; document product copy path = applied example-api migrations.
5. **Audience extraction trigger:** only if a third package needs staff/external — avoid premature `@kit/audience`.

### Later / non-blocking

6. Promote `@kit/rate-limit` when a second Worker app copies D1 rate-limit.
7. Export vitest coverage helper via `@kit/config` (S-08).
8. Package-sibling edge allowlist when incubating graph grows (flows must not gain `@kit/mcp` without ADR-0005 D6 evidence).

### Residual risks (honest)

- Machine green **≠** no layering debt (R5, app-local platform helpers, SQL dual SSoT).
- Product forks that apply **package sketch SQL** for flows will get wrong timestamp types (documented but easy to miss).
- File-wide exemptions, if ever used, can hide new illegal edges in the same file.
- Semantic N×M (retry/authz logic duplicated across services) is **out of scope** for this structural pass — hand off to semantic/domain agents.

**Verdict:** Structural axial drift is **low**. Axis holds; residual issues are secondary-layer enforcement and dual-copy artifacts, not reverse package/app coupling.
