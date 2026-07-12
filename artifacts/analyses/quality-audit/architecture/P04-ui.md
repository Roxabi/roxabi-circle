# Architecture — P4 ui

**Date:** 2026-07-12  
**Partition:** `packages/ui/**`  
**Scope:** component kit boundaries, Base UI / shadcn structure, no product domain, export surface, coupling to apps, a11y architecture notes  
**Excluded:** `node_modules/`, `coverage/` HTML noise (summary JSON used for metrics)  
**Refs:** ADR-0001, AGENTS.md §C / §B / §G, `components.json` (`base-nova`), goal B4 / D7

## Summary

`@gosilex/ui` is a **healthy, extractable shadcn Base UI kit**: style pin is official `base-nova` with `@base-ui/react` primitives for interactive chrome (Button, Dialog, Sheet-as-Dialog, Menu, Tooltip, Input, Avatar, ScrollArea, Separator, Badge/Sidebar via `useRender`), CVA for variants, CSS-variable theme in `globals.css`, and **zero product-share domain** (banlist-clean; only package name `@gosilex/ui`). Public surface is a single barrel (`src/index.ts`) plus dual CSS export paths. Coupling is one-way (`example-web` → ui); packages ↛ apps; no workspace deps on other `@gosilex/*`.

Main architecture gaps: **(1)** `sidebar.tsx` is a **god module** (~686 LOC) that concentrates layout, cookie persistence, keyboard shortcut, and mobile Sheet; **(2)** mixed primitive fidelity — several “shell” components (Card, Table, Label, Textarea, Field layout, Skeleton) are plain DOM + Tailwind, not Base UI (acceptable for presentational shells, but AGENTS “Base UI default” can be misread as 100%); **(3)** a11y is **inherited from Base UI** for overlays/menus, but chrome strings are **hardcoded English**, Biome a11y rules are **turned off** for `components/ui/**`, and there is no axe/contract a11y suite beyond Base UI context traps; **(4)** apps dual-import `sonner` / `lucide-react` beside the kit; **`shadcn` CLI lives in runtime `dependencies`** with no source import; **(5)** AGENTS kit list includes **Form** which is intentionally not in package (TanStack Form stays in apps + Field) — doc drift only. No P0 boundary breaks; kit is ready for extract as long as consumers pull styles + Tailwind `@source` pattern.

## Findings

| ID | Severity | File | Finding | Evidence |
|----|----------|------|---------|----------|
| ARCH-P4-001 | — | `packages/ui/**` | **Positive: no product domain leakage.** | Grep of share/artifact/slug/private_key product tokens under `packages/ui` → only package name `@gosilex/ui`. Banlist targets include `packages`; design is generic admin shell. ADR-0001 / extract dry-run aligned. |
| ARCH-P4-002 | — | `components.json`; component imports | **Positive: shadcn engine pin is Base UI (`base-nova`), not Radix/legacy.** | `"style": "base-nova"`, `"rsc": false`, aliases under `src/`. Primitives: `@base-ui/react/button`, `dialog`, `menu`, `tooltip`, `input`, `avatar`, `scroll-area`, `separator`; Badge/Sidebar use `@base-ui/react/use-render` + `merge-props`. Closes historical W7 (CVA-only pin) for interactive core. |
| ARCH-P4-003 | — | `package.json` exports; apps imports | **Positive: dependency direction & kit purity.** | No `dependencies` on other `@gosilex/*`. Peers: `react`/`react-dom` ^19. Consumers: only `apps/example-web` (`package.json` workspace dep + imports). Zero `apps/*` imports from ui. |
| ARCH-P4-004 | — | `src/index.ts`; design-system route | **Positive: single public barrel + demo consumption.** | Barrel re-exports 18 component modules + `useIsMobile` + `cn`. `example-web` routes (dashboard, notes, keys, login, settings, design-system) and `app-shell` compose package only via `@gosilex/ui` — no deep path imports into package internals. |
| ARCH-P4-005 | P2 | `src/components/ui/sidebar.tsx` | **God module: Sidebar owns layout system, cookie, shortcut, mobile sheet.** | ~686 LOC / ~544 instrumented lines (coverage summary). Exports 25 symbols (`Sidebar*` + `useSidebar`). Writes `document.cookie` (`SIDEBAR_COOKIE_NAME`, lines 17–18, 74–75), global `keydown` Ctrl/Cmd+B (86–96), composes Sheet/Tooltip/Button/Input. Largest file in package by far; high change-blast radius and 0% line coverage in package tests. |
| ARCH-P4-006 | P2 | Presentational components vs AGENTS “Base UI default” | **Split fidelity: interactive = Base UI; shells = raw DOM + CVA/Tailwind.** | **Base UI-backed:** button, dialog, sheet, dropdown-menu, tooltip, input, avatar, scroll-area, separator, badge (`useRender`), sidebar (partial). **DOM shells:** `card.tsx`, `table.tsx`, `label.tsx`, `textarea.tsx`, `skeleton.tsx`, `field.tsx` (layout wrappers + `role="group"` / `role="alert"`), `sonner.tsx` (Sonner lib). Correct shadcn pattern for non-behavior shells, but marketing/docs should say “Base UI for behavior primitives + styled shells” to avoid false completeness claims. |
| ARCH-P4-007 | P2 | Hardcoded EN chrome in package | **A11y/i18n architecture: SR-only and default chrome strings not localizable.** | `dialog.tsx:62,95` `"Close"`; `sheet.tsx:67` `"Close"`; `sidebar.tsx:185–186` `"Sidebar"` / `"Displays the mobile sidebar."`; `sidebar.tsx:257,269,272` `"Toggle Sidebar"`. AGENTS default UI language FR + `@gosilex/i18n` P1 — kit forces English for critical screen-reader labels unless apps fork components or pass children (close button is internal to DialogContent/SheetContent). |
| ARCH-P4-008 | P2 | `biome.json` override + missing a11y tests | **Biome a11y disabled for entire `packages/ui/src/components/ui/**`; no axe suite.** | Override turns off `a11y.noLabelWithoutControl`, `a11y.useSemanticElements`, plus correctness/suspicious rules (including `noDocumentCookie` for sidebar). Package tests are **Base UI contract traps** only (`dialog-sheet.test.tsx`, `dropdown-menu.test.tsx`) + `cn` unit test — no role/name/focus-order assertions for Label/Field/Table. Architecture relies on upstream Base UI + manual design-system smoke. |
| ARCH-P4-009 | P2 | `package.json` deps; app imports of `sonner` | **Toast dual surface: kit owns `Toaster` only; apps import `toast` from `sonner` directly.** | `sonner.tsx` exports `Toaster` only. `example-web` imports `toast` from `'sonner'` in app-shell, notes, keys, login, dashboard, design-system. Coupling: second app must know Sonner API + peer version alignment with package’s `sonner` dep. Prefer re-export `toast` from `@gosilex/ui` (or document “Toaster from kit, toast from sonner peer”). Same pattern for `lucide-react` icons (apps import icons freely — OK) but version is package dependency, not peer. |
| ARCH-P4-010 | P2 | `package.json` | **`shadcn` CLI package is a runtime dependency with zero source imports.** | `"shadcn": "^4.13.0"` under `dependencies`; grep `from 'shadcn'` in `src` → none. Used by script `ui:add` only. Inflates install graph for consumers of the kit; should be `devDependency` (or root tooling). |
| ARCH-P4-011 | P3 | `src/components/ui/{sidebar,avatar,tooltip,sheet,dropdown-menu}.tsx`; `sonner.tsx` | **RSC `'use client'` directives (and broken sonner form) in a Workers SPA kit.** | Next-style `'use client'` on interactive files; `sonner.tsx` has `;('use client')` after imports (no-op expression, not a directive). Harmless for Vite SPA but signals copy-paste from Next/shadcn templates and confuses readers about RSC support (`components.json` already `"rsc": false`). |
| ARCH-P4-012 | P3 | AGENTS §C vs package surface | **Doc drift: Form listed in kit; package has Field, not Form.** | AGENTS: “Button, Input, Field, Dialog, Sheet, Sidebar, Toast, Dropdown, Table shell, Form”. Package: Field* + Table + Toaster; **no Form** primitive. Correct architectural choice (TanStack Form in apps + Field presentation) under A8, but AGENTS overclaims. ShipFast assets (favicon/OG) also not in package — app/docs territory. |
| ARCH-P4-013 | P3 | `apps/example-web/src/index.css`; package CSS exports | **Style consumption requires app-side Tailwind v4 `@source` of package sources.** | App: `@import "@gosilex/ui/styles.css"` + `@source "../../../packages/ui/src/**/*.{ts,tsx}"`. Package exports `./styles.css` and `./globals.css` → same file. Extract/docs must ship this pattern; without `@source`, utility classes in components purge. Intentional monorepo CSS architecture, not a bug — residual extract risk. |
| ARCH-P4-014 | P3 | `sidebar.tsx` cookie write | **UI preference cookie lacks Secure/SameSite attributes (non-session).** | `document.cookie = \`${SIDEBAR_COOKIE_NAME}=${openState}; path=/; max-age=...\`` only. Not auth cookie; still inconsistent with AGENTS cookie table and disabled Biome `noDocumentCookie`. Prefer `localStorage` or explicit cookie options helper if multi-subdomain SPA appears. |
| ARCH-P4-015 | P3 | `src/hooks/use-mobile.ts` | **`useIsMobile` collapses `undefined` → `false` on first paint.** | State starts `undefined`, return is `!!isMobile` → false until effect. Mobile-first layout may flash desktop sidebar structure before Sheet path. Acceptable SPA residual; SSR would need matchMedia/bootstrap. |
| ARCH-P4-016 | P3 | Barrel export volume | **Wide `export *` surface (~90+ symbols) from one entry.** | Full re-export of every Sidebar/Dialog/Field/Table/Dropdown subcomponent. Good DX for shadcn consumers; tree-shaking depends on bundler + `export *`. No subpath exports (e.g. `@gosilex/ui/button`) for selective import — optional future polish. |
| ARCH-P4-017 | P3 | `package.json` build / source exports | **Source-path exports only (`./src/index.ts`); `build: echo ok`.** | Same monorepo pattern as other kit packages (P1). Fine for Bun workspace; publish/extract as npm package needs real emit or consumer transpile. |
| ARCH-P4-018 | — | Tests + `docs/testing.md` T2 | **Positive: contract-oriented tests match declared UI strategy.** | CP-UI-CONTRACT: MenuGroupContext trap + open Dialog/Sheet/Tooltip without Base UI context errors. Floors T2 20%/10% global; coverage ~22% lines matches intentional “don’t chase Button coverage”. Design-system smoke lives in `example-web` (composition proof). |

## Metrics

| Metric | Value |
|--------|------:|
| Source component modules | **19** (`components/ui/*.tsx` excl. tests) |
| Support modules | **3** (`lib/utils.ts`, `hooks/use-mobile.ts`, `styles/globals.css`) |
| Test modules | **4** (`utils.test`, `dialog-sheet.test`, `dropdown-menu.test`, + setup/capture helpers) |
| Public export entrypoints | **3** (`.` barrel, `./styles.css`, `./globals.css`) |
| Barrel re-export modules | **20** lines in `index.ts` (18 components + hook + cn) |
| Approx. instrumented LOC (coverage total lines) | **1623** |
| Largest file | **sidebar.tsx ~686 LOC / 544 lines** |
| God files (>400 LOC) | **1** (sidebar) |
| Workspace deps | **0** |
| External runtime deps (package) | `@base-ui/react`, CVA, clsx, tailwind-merge, lucide-react, sonner, tw-animate-css, fontsource Geist, **shadcn (CLI)** |
| Peer deps | react 19, react-dom 19 |
| Consumer apps | **1** (`example-web` only) |
| Package → app imports | **0** |
| Product-domain hits in package | **0** |
| Components with `@base-ui/react/*` import | **11** files |
| Pure DOM / third-party shell components | **7** (card, table, label, textarea, skeleton, field, sonner) |
| Coverage lines (summary) | **~22%** (T2 intentional) |
| Issues by severity | **P0: 0** · **P1: 0** · **P2: 6** · **P3: 7** · positives tracked separately |

### Inventory

```text
packages/ui/
  package.json · components.json · tsconfig.json · vite.config.ts · vitest.config.ts
  src/
    index.ts
    lib/utils.ts · utils.test.ts
    hooks/use-mobile.ts
    styles/globals.css
    test/setup.ts · capture-errors.ts
    components/ui/
      avatar · badge · button · card · dialog · dialog-sheet.test
      dropdown-menu · dropdown-menu.test · field · input · label
      scroll-area · separator · sheet · sidebar · skeleton
      sonner · table · textarea · tooltip
```

### Coupling sketch

```text
@base-ui/react ──► packages/ui (primitives + useRender)
CVA/clsx/twMerge ──► packages/ui (variants)
sonner/lucide     ──► packages/ui (Toaster icons)  AND  apps/example-web (toast + icons)
packages/ui ──exports──► apps/example-web only
packages/ui ──styles──► example-web index.css (@import + @source)
packages/ui ──↛── apps product / other @gosilex packages
```

### A11y architecture (notes)

| Layer | Behavior |
|-------|----------|
| Overlays / menus | Base UI Dialog/Menu/Tooltip: focus management, ARIA roles, dismiss — **primary a11y engine** |
| Forms | Presentational `Field*` + plain `Label`/`Input`/`Textarea`; association is caller responsibility (`htmlFor` / wrapping) |
| Errors | `FieldError` → `role="alert"` |
| Icon buttons | `sr-only` text present but **English-fixed** in package |
| Lint | Biome a11y **off** for ui components (registry noise control) |
| Tests | Contract (missing provider/group) not WCAG checklist |
| i18n | No package-level message API; FR default lives in `example-web` messages only |

## Recommendations

1. **Split or modularize Sidebar (ARCH-P4-005)**  
   - Extract cookie/storage adapter, keyboard shortcut, and `SidebarMenu*` vs chrome provider into smaller modules (still one public re-export surface).  
   - Add minimal contract tests: provider required, mobile Sheet path with `useIsMobile` mocked.

2. **Document Base UI fidelity matrix (ARCH-P4-006, ARCH-P4-012)**  
   - README / AGENTS: “behavior primitives = Base UI; layout shells = HTML + tokens.”  
   - Remove or reword **Form** from kit component list until a real shared Form primitive exists (likely never if TanStack Form stays app-side).

3. **Localizable chrome strings (ARCH-P4-007)**  
   - Accept `labels?: { close?: string; toggleSidebar?: string; … }` on DialogContent / SheetContent / Sidebar* **or** keep English defaults with documented override via `showCloseButton={false}` + app chrome.  
   - Align with future `@gosilex/i18n` without pulling i18n into ui day-one (avoid reverse domain coupling).

4. **Restore selective a11y gates (ARCH-P4-008)**  
   - Narrow Biome disable list (keep registry exceptions) rather than whole-folder a11y off if feasible.  
   - Add 1–2 axe or Testing Library role/name checks for Field+Label+Input and open Dialog title association (Title/Description slots already Base UI).

5. **Toast & CLI packaging hygiene (ARCH-P4-009, ARCH-P4-010)**  
   - Re-export `toast` from `@gosilex/ui` (or declare `sonner` as peer and document).  
   - Move `shadcn` to `devDependencies`.  
   - Consider `lucide-react` as peer if multiple apps pin icons.

6. **Clean template residue (ARCH-P4-011, ARCH-P4-014, ARCH-P4-015)**  
   - Drop ineffective `'use client'` / fix sonner directive noise for Vite-only kit.  
   - Prefer `localStorage` for sidebar state or full cookie attributes.  
   - Optional: return `boolean | undefined` from `useIsMobile` for callers that need SSR/hydration guards.

7. **Extract docs (ARCH-P4-013, ARCH-P4-017)**  
   - Document mandatory `@import "@gosilex/ui/styles.css"` + Tailwind v4 `@source` for package `src`.  
   - When packaging: dual CSS entry already good; consider `./button` subpaths only if bundle size becomes an issue.

## Residual risks

| Risk | Notes |
|------|--------|
| Sidebar cookie in multi-tenant / multi-host | Preference cookie path=/ may leak open/closed state across apps on same parent domain; low sensitivity. |
| Base UI major upgrades | shadcn registry + Base UI contracts (MenuGroupContext etc.) already needed defensive tests; upgrades can break silently without expanding contract suite. |
| Design-system page as pseudo-test | Much of “kit works” proof is visual/demo in `example-web`; package unit coverage sparse by design — regression risk if smoke/e2e not run. |
| App-local theme | ThemeProvider lives in `example-web` (`next-themes` not package dep); Toaster theme wired in app. Second SPA must reimplement theme glue. |
| Label/control association | Unenforced in kit; Biome off → easy to ship forms without names for AT. |
| Future product UI leakage | Risk is **apps** adding share-specific components **into** `packages/ui` — process gate (extract dry-run + banlist + review). Current package clean. |
| Font bundling | `@fontsource-variable/geist` imported from package CSS — all consumers get Geist; override requires CSS layer discipline. |
| Tree-shaking of barrel | Large Sidebar graph may pull into routes that only need Button if bundler fails on `export *` — monitor Vite/Rollup sideEffects if size matters. |

**Overall architecture score for P4:** strong kit boundary and Base UI pin; extract-ready with style contract; address Sidebar modularity, chrome i18n/a11y policy, and packaging (shadcn/sonner) before treating UI as “done for multi-app.”
