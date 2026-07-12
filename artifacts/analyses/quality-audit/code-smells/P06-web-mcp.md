# Code Smells — P6

**Date:** 2026-07-12  
**Partition:** `apps/example-web/**`, `apps/mcp-example/**`  
**Focus:** god routes (design-system), DRY i18n, dead code, large components  
**Excluded:** `node_modules/`, `coverage/` (metrics only)

## Summary

`example-web` is a **small, readable SPA** except for one clear outlier: **`routes/design-system.tsx` (~657 source LOC / 534 instrumented lines)** is a **god route** — a single `DesignSystemPage` owning foundations through page templates. Product routes (`dashboard`, `notes`, `keys`, `login`, `settings`) stay under the ~80–220 LOC band and are fine as demos. **i18n is half-DRY:** type-safe FR/EN catalogs + contract tests are solid, but product surfaces leak **hardcoded English** (`keys` Bearer card, dashboard Email/Mailpit), locale switchers are **triplicated**, and one catalog key (`copyKey`) is unused. Dead surface is real but small (`home.tsx` shim, `isUnauthorized`, unused router `queryClient` context). `mcp-example` is thin (~59 LOC) with a **triple allowlist** DRY smell, not a size problem.

**No P0.** Main kit-template debt: split the design-system catalog and close i18n holes before `share-web` copies these patterns.

## Findings

| ID | Severity | File | Finding | Evidence |
|----|----------|------|---------|----------|
| SMELL-P6-001 | P1 | `apps/example-web/src/routes/design-system.tsx` | **God route / god component — design-system catalog.** | Coverage: **534** instrumented lines (largest module in app; threshold ~**400**). Source ~**657** LOC. Single export `DesignSystemPage` (~L127–657) owns TOC + 7 sections (foundations, buttons, forms, feedback, overlays, data, templates) + local state for dialog/sheet. Local helpers `Section` / `DemoBox` are tiny; the **page itself** is the long function (>80 LOC). Fine as admin demo, **anti-pattern as product-route template**. |
| SMELL-P6-002 | P1 | `routes/keys.tsx:77–88`; `routes/dashboard.tsx:99–106` | **Hardcoded EN UI outside catalogs — breaks FR default.** | Keys card: `"Bearer"`, `"Authorization: Bearer sk_…"`, MCP/cookie prose in English only. Dashboard: `"Email"`, `"Mailpit"`. With `defaultLocale = 'fr'`, FR users still see EN islands. Catalogs already cover `sendEmail` / `keysDesc` nearby — copy was never keyed. |
| SMELL-P6-003 | P1 | `design-system.tsx` (mixed) vs `messages/{fr,en}.ts` | **Partial i18n on design-system chrome; bulk demo copy hardcoded EN.** | TOC/section titles mostly use `m.ds*` / templates reuse `m.login*` etc., but section descriptions (`"Variants + sizes…"`, `"Input, Textarea…"`), DemoBox titles (`"Color tokens"`, `"Button"`), toast strings, dialog/sheet body, table headers remain literal EN. No policy (document “component gallery is EN-only” **or** key the chrome). Inconsistent with product-route i18n discipline. |
| SMELL-P6-004 | P2 | `lib/auth.ts:24–26` | **Dead export: `isUnauthorized`.** | Defined and exported; **zero** call sites under `example-web` (AuthGate uses `me.isError` / missing data only). Dead helper trains incomplete 401 handling (also no global Query `onError`). |
| SMELL-P6-005 | P2 | `routes/home.tsx` | **Dead compatibility shim.** | Sole content: re-export `DashboardPage as HomePage` with `@deprecated`. `routeTree.tsx` imports `./routes/dashboard` only — **no** import of `home`. Noise for extract/template. |
| SMELL-P6-006 | P2 | `main.tsx:20–23`; `routeTree.tsx` | **Dead router context wiring.** | `createRouter({ routeTree, context: { queryClient } })` never consumed: no `createRootRouteWithContext`, no `beforeLoad`/`loader` using context. Composition smell + dead API surface. |
| SMELL-P6-007 | P2 | `notes.tsx:55,65`; `keys.tsx:29`; `dashboard.tsx:37` | **Duplicated mutation error toast (`String(e)`).** | Four identical `onError: (e) => toast.error(m.error, { description: String(e) })`. No shared `toastApiError` / `apiErrorToMessage`; bypasses `ApiError.code` mapping. DRY + error UX debt (see ARCH-P06-007). |
| SMELL-P6-008 | P2 | `app-shell.tsx:148–164`; `login.tsx:72–88`; `settings.tsx:58–74` | **Locale switcher triplicated.** | Same FR/EN button pair (variant by `locale === 'fr'\|'en'`, `setLocale`) in shell header, login card, settings card. Settings uses full labels (`Français`/`English`); shell/login use `FR`/`EN`. Extract `LocaleToggle` (or settings-only + shell). |
| SMELL-P6-009 | P2 | `app-shell.tsx:83–87`; `dashboard.tsx:24–32`; `notes.tsx:42–45` | **Duplicated query definitions / ad-hoc keys.** | `['health']` + `queryFn` in shell **and** dashboard; `['notes']` in dashboard **and** notes. Only `meQueryKey` centralized (`lib/auth.ts`). Risk of key drift; inconsistent response typing (`health` shape differs slightly). |
| SMELL-P6-010 | P2 | `mcp-example/src/index.ts:20–28` | **Triple allowlist coupling (DRY).** | (1) `REGISTERED_TOOL_NAMES` (2) `assertExactKitTools([...])` (3) equality vs package `MCP_TOOL_NAMES`. After assert, the JSON.stringify equality is **redundant** if assert already enforces exact kit set. Registration SSoT intent is good; three lists/checks is over-coupled. |
| SMELL-P6-011 | P2 | `components/app-shell.tsx` (~301 LOC) | **Multi-concern shell module (borderline large).** | One file: `NavItem`, `ThemeCycleButton`, `ShellChrome`, `AppShell`, `PageHeader`, `AdminGate`, `AuthGate`. Under 400 LOC god threshold but **7 exports** / mixed chrome + authz UX. Gates share `queueMicrotask(navigate)` pattern. Prefer split `gates.tsx` / `page-header.tsx` when product grows — not urgent alone. |
| SMELL-P6-012 | P3 | `messages/fr.ts` + `en.ts` (`copyKey`) | **Dead catalog key.** | `copyKey: 'Copier' / 'Copy'` defined; keys UI uses icon-only copy button **without** `m.copyKey` (no aria-label from catalog). Contract tests keep the orphan forever. |
| SMELL-P6-013 | P3 | `design-system.tsx:84–125` | **Local UI primitives only used once — OK, but inflate god file.** | `Section` + `DemoBox` live inside the god route. Splitting into `routes/design-system/*.tsx` (or `components/ds/*`) would cut SMELL-P6-001 without changing UX. |
| SMELL-P6-014 | P3 | `theme.tsx` / `locale.tsx` | **Near-duplicate preference provider pattern.** | Both: `STORAGE_KEY`, `readStored` try/catch, `createContext` + throw-if-missing hook, `useState` + `useCallback` set + `localStorage`. Acceptable kit demo; micro-factory only if a third pref appears. |
| SMELL-P6-015 | P3 | `notes.tsx` (~220 LOC) | **Largest product route after DS — multi-dialog CRUD in one page.** | Create dialog + delete confirm + table + form in one component. Acceptable for demo; split dialogs if product notes grow. Not god-file size. |
| SMELL-P6-016 | P3 | `mcp-example/src/index.ts:45–50` | **Inline ternary descriptions in registration loop.** | `description: name === 'ping' ? '…' : '…'` — fine at 2 tools; table `{ name, description, execute }` would scale cleaner (same as host-factory direction). |

### Non-findings (healthy)

| Area | Assessment |
|------|------------|
| Product routes size | `login` ~145, `dashboard` ~147, `keys` ~93, `settings` ~100 — all well under thresholds. |
| mcp-example size | Prod `index.ts` ~**59** LOC; no god file. |
| Long functions (excl. DS) | No product-route function approaches 80 LOC of dense logic; JSX dominates. |
| Deep nesting | Max ~3 (conditional render chains); no pyramid of doom. |
| Domain leakage | No share-product strings in either app (banlist-friendly). |
| i18n type safety | FR is `Messages` SSoT; EN assigned as `Messages`; contract test key parity + non-empty. `lib/i18n.ts` ~12 LOC clean. |
| api client size | `api.ts` ~47 LOC — focused. |
| Magic numbers | Mild (`30_000` health poll, `10_000` staleTime, toast positions) — named constants optional. |
| Naming | Aligns AGENTS (TanStack, PageHeader, meQueryKey, REGISTERED_TOOL_NAMES). |

## Metrics

| Metric | Value |
|--------|------:|
| Apps in partition | **2** |
| example-web prod TS/TSX modules (src, excl. tests) | **16** |
| mcp-example prod modules | **1** (`src/index.ts`) |
| Files analyzed (src + tests + scripts + package configs, excl. node_modules) | **~28** |
| Max file LOC (source) | **~657** (`design-system.tsx`) |
| Max instrumented lines (coverage summary) | **534** (`design-system.tsx`) |
| Next largest instrumented | **229** (`app-shell.tsx`) · **176** (`notes.tsx`) · **122** (`login.tsx`) · **121** (`dashboard.tsx`) |
| God files (>400 LOC) | **1** (`design-system.tsx`) |
| Functions >80 LOC (dense UI trees) | **1** (`DesignSystemPage`) |
| Issues total | **16** |
| P0 | **0** |
| P1 | **3** |
| P2 | **8** |
| P3 | **5** |
| Dead modules / dead exports | **3** (`home.tsx`, `isUnauthorized`, router context unused) |
| Dead i18n keys | **1** (`copyKey`) |
| Hardcoded EN product islands | **≥2** (keys Bearer card, dashboard Email/Mailpit) |
| Locale switcher copies | **3** |
| Repeated mutation `onError` toast | **4** |
| Ad-hoc query keys (non-`me`) | **2** (`health`, `notes`) duplicated |
| i18n catalog keys | **~69** (`Messages` fields) |
| mcp-example allowlist checks | **3** (list + assert + equality) |
| Nested depth max | **~3** |

**Inventory (prod surface):**

```text
apps/example-web/src/
  main.tsx                    (~52)
  routeTree.tsx               (~68)
  components/app-shell.tsx    (~301)   multi-export shell + gates
  lib/api.ts                  (~47)
  lib/auth.ts                 (~31)    isUnauthorized dead
  lib/i18n.ts                 (~12)
  lib/locale.tsx              (~49)
  lib/theme.tsx               (~76)
  messages/fr.ts · en.ts      (~70 keys each)
  routes/design-system.tsx    (~657)   GOD
  routes/notes.tsx            (~220)
  routes/login.tsx            (~145)
  routes/dashboard.tsx        (~147)
  routes/settings.tsx         (~100)
  routes/keys.tsx             (~93)
  routes/home.tsx             (~2)     DEAD SHIM

apps/mcp-example/src/
  index.ts                    (~59)
  index.test.ts
  scripts/stdio-smoke.mjs
```

## Recommendations

1. **P1 — Split design-system (SMELL-P6-001 / 013)**  
   - Extract per-section modules: e.g. `routes/design-system/{foundations,buttons,forms,feedback,overlays,data,templates}.tsx` + thin page composer.  
   - Keep `Section`/`DemoBox` in `components/ds/` or co-located.  
   - Target: no route file >~200 LOC; page function only composes sections.  
   - Do **not** use this file as the model for product feature routes.

2. **P1 — Close product i18n holes (SMELL-P6-002)**  
   - Add keys for Bearer card + dashboard email/Mailpit (FR/EN).  
   - Optional lint/ban: no raw user-facing string literals in `routes/**` except design-system (if declared EN-gallery).  
   - Wire `m.copyKey` as `aria-label` on copy button **or** delete the key (SMELL-P6-012).

3. **P1/P2 — Design-system i18n policy (SMELL-P6-003)**  
   - Either document “gallery labels/token names stay EN (dev tool)” and only translate chrome (`m.designSystem*`, TOC), **or** move remaining section descriptions into `ds*` keys. Avoid mixed half-i18n without a written rule.

4. **P2 — Delete dead surface (SMELL-P6-004/005/006)**  
   - Remove `home.tsx` or stop exporting until needed.  
   - Use `isUnauthorized` in a global Query/mutation 401 path, or delete.  
   - Either wire router context (`createRootRouteWithContext` + `beforeLoad` auth) or drop `context: { queryClient }` until loaders exist.

5. **P2 — DRY helpers (SMELL-P6-007/008/009)**  
   - `toastApiError(e, m)` mapping `ApiError` → code/message.  
   - `LocaleToggle` component used by shell/login/settings.  
   - `healthQueryKey` / `notesQueryKey` + shared `queryFn` factories next to `meQueryKey`.

6. **P2 — MCP allowlist (SMELL-P6-010)**  
   - Keep one app-local `REGISTERED_TOOL_NAMES`; call a **single** kit assert (exact or banlist). Drop redundant equality if `assertExactKitTools` already encodes `MCP_TOOL_NAMES`.  
   - Longer-term: package `createStdioKitServer` (architecture) removes host loop smell.

7. **P3 — Optional shell split / notes dialogs**  
   - Only when adding product routes: split gates from chrome; extract note dialogs. Prefer not to churn for cosmetics.

## Residual risks

| Risk | Notes |
|------|--------|
| Template copy of god design-system | Next engineer pastes “one big route = feature” into `share-web`. Mitigate with split + AGENTS note “catalog ≠ feature route”. |
| FR default violated in demos | Stakeholders dogfood FR and see EN — kit credibility hit, not runtime bug. |
| Dead `isUnauthorized` | Signals unfinished 401 UX; easy to ship product without centralized session expiry. |
| Query key drift | Invalidate `['notes']` vs typo `['note']` silent stale UI — classic React Query smell. |
| mcp triple lock | Product MCP cannot reuse package helpers without forking exact-tool law (also ARCH-P03/P06). |
| Coverage | Routes/shell ~0% instrumented coverage — smells unguarded by tests (test-quality domain). DS overlays test does not load the god page. |
| app-shell multi-export | Not a hard smell today; becomes god when more nav chrome + notifications land. |

**Overall code-smell score for P6:** **good** for mcp-example and product routes; **weak** on design-system god-file and i18n DRY. Treat P1 items as **pre-product-web cleanup**; P2 as small hygiene PRs.
