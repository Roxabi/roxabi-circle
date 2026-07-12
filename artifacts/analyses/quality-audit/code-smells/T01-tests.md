# Code Smells — T (tests)

**Date:** 2026-07-12  
**Partition:** all `packages/**/*.{test,spec}.{ts,tsx}` + `apps/**/*.{test,spec}.{ts,tsx}`  
**Focus:** giant test files, duplication, brittle selectors, copy-paste fixtures  
**Excluded:** `node_modules/`, `coverage/`, prod sources (except helpers imported by tests), product `share-*` (absent)

## Summary

The kit has **17** Vitest modules (~**1.1k** LOC of tests). Most package unit tests are **short, focused, and healthy** (`core`, `auth`, `mcp`, `types`, `email`, `utils`). The only near-god **test file** is **`apps/example-api/src/app.test.ts` (~398 LOC)** — multi-concern integration suite with **login/cookie ceremony copy-pasted ~7 times** and a residual **scratch-file helper** tied to a goal session path. Cross-layer **Base UI overlay fixtures** are duplicated between `packages/ui` contract tests and `apps/example-web` design-system overlays, including a **local `captureErrors` clone**. UI assertions mostly use roles where interactive; several **text-only** and **error-message regex** checks are mildly brittle. **No P0.** Main debt: extract API test helpers + collapse overlay fixture N×M before more product routes land.

## Findings

| ID | Severity | File | Finding | Evidence |
|----|----------|------|---------|----------|
| SMELL-T01-001 | P1 | `apps/example-api/src/app.test.ts` (~398 LOC) | **Giant multi-concern integration test file (at ~400 LOC threshold).** | Single module owns health/errors, dual auth (session + sk_), notes D1/R2 CRUD, cookie Secure policy, CORS origin, IDOR, and unit-style `getSecret`/`useSecureCookie` checks. **12** `it(...)` across **2** `describe` blocks. Same smell flagged as SMELL-P5-015; as **T partition** it is the only file approaching god-test size. Split by concern (`app.health.test.ts`, `app.auth.test.ts`, `app.notes.test.ts`, `session-env.test.ts`) when next scenarios land. |
| SMELL-T01-002 | P1 | `apps/example-api/src/app.test.ts` | **Login + cookie setup copy-pasted (N× ceremony, no helper).** | Pattern `createApp()` + `createMemoryEnv()` + `POST /api/auth/login` with `DEMO_EMAIL`/`DEMO_PASSWORD` + `set-cookie` `.split(';')[0]` appears in **≥6** tests (login→me, mint key, notes CRUD, Secure cookie, IDOR A, wrong-password seed). ~8–15 LOC each; cookie extraction uses `!` non-null assert in **≥3** sites (L154, L199, L351, L375). Extract `loginAsDemo(app, env, which?) → { cookie, subject }` (and optional `mintApiKey`). |
| SMELL-T01-003 | P1 | `apps/example-api/src/app.test.ts:8–17` | **Scratch I/O fixture with hard-coded goal session path.** | `SCRATCH = process.env.SCRATCH \|\| '/tmp/grok-goal-c818b205ecce/implementer'` + `writeScratch` with silent `catch`. Used only for health/error artifacts (L30–34, L53). Residue of goal implementer, not kit DX; other machines get opaque `/tmp/grok-goal-…` dirs. Prefer remove (tests already assert) or pure `os.tmpdir()` without session id. Same as SMELL-P5-016. |
| SMELL-T01-004 | P2 | `packages/ui/.../dropdown-menu.test.tsx` · `apps/example-web/.../design-system.overlays.test.tsx` | **Near-identical DropdownMenu Group+Label fixture across package and app.** | Both render Open/Dropdown trigger, `DropdownMenuGroup` + Label `"Actions"`, items Copy/Settings, Separator, destructive Delete; click trigger; assert `findByText('Actions')`. Package uses local components + `captureRuntimeErrors`; web re-imports `@gosilex/ui` and local `captureErrors`. **N×M:** product overlays re-prove package contracts. Prefer package-only contract + thin app smoke (or shared fixture export under `packages/ui/test`). |
| SMELL-T01-005 | P2 | `packages/ui/.../dialog-sheet.test.tsx` · `design-system.overlays.test.tsx` | **Dialog / Sheet / Tooltip controlled trees duplicated.** | Package: three tests for controlled Dialog, Sheet, Tooltip+Provider. Web: one stacked test with Dialog title `"Dialog reference"`, Sheet `"Sheet reference"`, Tooltip `"Tip"`/`Help` — same structure as package (`open onOpenChange`, Header/Title/Description/Footer). Value is mostly **duplicate contract coverage**, not app route wiring (page not mounted). |
| SMELL-T01-006 | P2 | `design-system.overlays.test.tsx:36–57` · `packages/ui/src/test/capture-errors.ts` | **Error-capture helper copy-pasted in app test instead of shared util.** | Web defines local `captureErrors` (window `error` + `console.error` + try/catch → `string[]`). Package already has richer `captureRuntimeErrors` → `Error[]` + `assertNoBaseUiContractErrors`. Web only reuses `assertNoPageContractErrors` (near-clone of package assert regex). Extract shared capture to `@gosilex/ui/test` or a tiny test util package; app imports it. |
| SMELL-T01-007 | P2 | `packages/db/src/index.test.ts:13–50` · `apps/example-api/src/test/memory-env.ts` | **D1-from-SQLite shim fixture triplicated in ecosystem (test path).** | `d1FromSqlite` in db package test (~38 LOC: prepare/bind/run/all/raw/first + batch/exec) structurally clones `makeStatement`/`makeD1` in `memory-env` (~50 LOC) and seed CLI (SMELL-P5-004). Each new package/app test re-invents the D1 shape. Promote one test export (`@gosilex/db/test` or tooling) — memory-env adds migrations + R2; db test needs minimal table only. |
| SMELL-T01-008 | P2 | `packages/storage/src/index.test.ts:4–26` · `memory-env` R2 | **In-memory R2 map fixtures duplicated (lighter).** | `memoryBucket()` Map put/get/delete/keys vs `makeR2()` in memory-env (put/get/delete + `_keys`). Acceptable isolation (package vs app), but third consumer should share a tiny double. Not blocking alone. |
| SMELL-T01-009 | P3 | UI tests (`dialog-sheet`, `dropdown-menu`, `design-system.overlays`) | **Text-content selectors where roles exist (mild brittleness).** | Asserts on `getByText('Title'|'Sheet title'|'Actions'|'Copy'|'Dialog reference'|'Sheet reference')` instead of `getByRole('heading'|'menuitem'|'dialog', { name })`. Interactive paths correctly use `getByRole('button', { name })`. Copy renames break tests without semantic change; Base UI may map roles (menu/dialog) more stably. |
| SMELL-T01-010 | P3 | `dropdown-menu.test.tsx:30` · `capture-errors.ts` · `browser-errors.ts` | **Brittle regex matching on third-party runtime error message strings.** | Failure test: `/MenuGroupContext\|Menu\.Group\|RadioGroup/i`. Assert helpers: `/Base UI\|MenuGroupContext\|DialogRootContext\|must be used within\|TooltipProvider…/`. Vendor message renames → false green or red. Prefer asserting thrown type / known error code if Base UI exposes one; keep regex as secondary. |
| SMELL-T01-011 | P3 | `packages/auth/src/keys.test.ts:40–64` | **Copy-paste session secret + sign payload fixture ×3.** | Same `const secret = 'test-secret-at-least-32-characters!!'` and near-identical `signSession({ sub: 'u1', email: 'a@b.c', exp: … })` in signs/verifies, rejects bad signature, rejects expired. Extract `const FIXTURE = { secret, payload(exp) }`. Small file (~68 LOC) — clean-up only. |
| SMELL-T01-012 | P3 | `apps/example-api/src/app.test.ts` (cookie lines) | **Cookie header parsing via `split(';')[0]` + `!`.** | Works for single `Set-Cookie` today; brittle if Hono emits multiple cookies or attributes reorder. Prefer a tiny `firstCookiePair(setCookie: string \| null)` helper with explicit null fail. |
| SMELL-T01-013 | P3 | Package unit tests (email, types, utils, i18n) | **Thin smoke tests (not smells of duplication — coverage thinness).** | `email` 1 it, `types` 1 it, `utils` 1 it, `i18n` 1 it, `mcp-example` 2 its. Not giant/duplicative; flag only as **residual risk** for Test Quality domain (CP / floors), not DRY smells. |
| SMELL-T01-014 | P3 | `apps/mcp-example/src/index.test.ts` · `packages/mcp/src/index.test.ts` | **Allowlist assertion overlap (intentional SSoT belt).** | Package tests `assertExactKitTools` / banlist; app re-asserts `REGISTERED_TOOL_NAMES === MCP_TOOL_NAMES` + `assertExactKitTools`. Mild duplication; valuable as registration SSoT guard. Keep; do not expand third copy. |

### Non-findings (healthy)

| Area | Assessment |
|------|------------|
| God test files (>400 LOC) | **0** strictly over; **1** at threshold (`app.test.ts` ~398). |
| Package unit size | All package tests **≤~80 LOC** except structural helpers inside db test. |
| Fake timers / network flakiness | **None** observed — no `vi.useFakeTimers`, no real network in unit tests. |
| Snapshot abuse | **0** snapshot / `toMatchSnapshot` usage. |
| Product-domain fixtures in kit tests | **None** — storage/mcp banlist tests construct `share` names carefully; notes use `demo/` prefix. |
| Selector strategy (interactive) | Button clicks use **roles + accessible name** (good). |
| Shared setup files | `packages/ui` + `example-web` `test/setup.ts` only import jest-dom — lean, no god setup. |
| seed-db.test.ts | Focused idempotent/reset (~38 LOC); good model for split app suites. |
| api.test.ts (web) | Clear ApiError + fetch mock isolation; no fixture bloat. |
| messages.contract.test.ts | Catalog loop is DRY (`assertCatalog`); not copy-paste per key. |

## Metrics

| Metric | Value |
|--------|------:|
| Test modules (`*.{test,spec}.{ts,tsx}`) | **17** |
| Under `packages/` | **10** |
| Under `apps/` | **7** |
| Spec files (`*.spec.*`) | **0** |
| Approx. total test LOC | **~1,100–1,150** |
| Max test file LOC | **~398** (`apps/example-api/src/app.test.ts`) |
| Next largest | **~124** (`design-system.overlays.test.tsx`) · **~79** (`dialog-sheet.test.tsx`) · **~72** (`db/index.test.ts`) · **~69** (`api.test.ts`) · **~68** (`auth/keys.test.ts`) |
| God test files (>400 LOC) | **0** (1 at threshold) |
| Login ceremony copies in `app.test.ts` | **≥6** |
| Cross-layer Base UI overlay fixture pairs | **2** (dropdown + dialog/sheet/tooltip) |
| Local error-capture clones | **2** (`captureRuntimeErrors` vs `captureErrors`) |
| D1 SQLite shim variants (test ecosystem) | **≥2** in-repo tests (+ seed CLI) |
| `getByText` assertions (UI) | **~8** |
| `getByRole` / `findBy*` role-based | **~5** |
| Snapshot tests | **0** |
| Issues total | **14** |
| P0 | **0** |
| P1 | **3** |
| P2 | **5** |
| P3 | **6** |

**Inventory (absolute paths under workspace):**

```text
packages/
  auth/src/keys.test.ts                         (~68)
  core/src/errors.test.ts                       (~34)
  db/src/index.test.ts                          (~72)  # embeds d1FromSqlite fixture
  email/src/index.test.ts                       (~12)
  mcp/src/index.test.ts                         (~43)
  storage/src/index.test.ts                     (~61)  # embeds memoryBucket
  types/src/index.test.ts                       (~11)
  ui/src/lib/utils.test.ts                      (~10)
  ui/src/components/ui/dialog-sheet.test.tsx    (~79)
  ui/src/components/ui/dropdown-menu.test.tsx   (~61)
  ui/src/test/capture-errors.ts                 # helper (not counted as test module)
  ui/src/test/setup.ts

apps/
  example-api/src/app.test.ts                   (~398)  # giant + login paste
  example-api/src/seed/seed-db.test.ts          (~38)
  example-api/src/test/memory-env.ts            # helper
  example-web/src/lib/api.test.ts               (~69)
  example-web/src/lib/i18n.test.ts              (~11)
  example-web/src/messages/messages.contract.test.ts (~39)
  example-web/src/routes/design-system.overlays.test.tsx (~124)
  example-web/src/test/browser-errors.ts        # helper
  example-web/src/test/setup.ts
  mcp-example/src/index.test.ts                 (~20)
```

## Recommendations

1. **Split + helper-ize `app.test.ts` (SMELL-T01-001/002/003, P1)**  
   - Extract `test/helpers.ts`: `setupApp()`, `loginDemo(env, 'A'|'B')`, `authHeaders(cookie)`, drop `writeScratch` or gate behind env only.  
   - Split describes into files by domain so auth/notes/CORS grow independently.  
   - Keep IDOR + R2 prefix assertions as the high-value integration spine.

2. **Collapse Base UI fixture N×M (SMELL-T01-004/005/006, P2)**  
   - Keep contract tests in `packages/ui` as SSoT.  
   - Either delete redundant app overlay trees or mount real `DesignSystemPage` once for integration.  
   - Export `captureRuntimeErrors` / assert helpers from a single place; delete local `captureErrors`.

3. **Promote D1 (and optional R2) test doubles once (SMELL-T01-007/008, P2)**  
   - Aligns with SMELL-P5-004; reduces next-app clone cost for `share-api` tests.

4. **Harden selectors when touching UI tests (SMELL-T01-009/010, P3)**  
   - Prefer `getByRole('menuitem', { name: 'Copy' })`, `getByRole('heading', { name: '…' })`.  
   - Treat vendor message regex as secondary signal.

5. **Micro cleanups (SMELL-T01-011/012, P3)**  
   - Session secret constant in auth tests; cookie parse helper in API tests.

## Residual risks / not covered

- **Coverage floors, CP-\* gaps, mock-only tests** → Test Quality domain (T1/T2/T3), not this smells pass.  
- **E2E** (`scripts/e2e-design-system.mjs`, `stdio-smoke.mjs`) — not `*.{test,spec}.{ts,tsx}`; out of partition.  
- **Playwright** not present yet; no browser selector debt beyond RTL.  
- **Flaky CI / order dependence** not exercised here (read-only static audit).  
- **Product `share-*` tests** absent — re-audit when M0 lands.  
- Overlap with SMELL-P5-015/016 and architecture D1-shim findings is intentional; T report owns **test-file structure** view.
