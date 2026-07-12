# Code Smells — P4

**Date:** 2026-07-12  
**Partition:** `packages/ui/**`  
**Focus:** god components (sidebar), duplication, dead exports  
**Excluded:** `node_modules/`, `coverage/` HTML noise (summary JSON for metrics only)

## Summary

`@gosilex/ui` is a standard shadcn **Base UI (`base-nova`)** kit: most primitives are thin, readable wrappers (Button, Card, Input, Skeleton ≤ ~90 LOC). The partition’s debt is concentrated in **one god module** (`sidebar.tsx` ~686 LOC / 544 instrumented lines, 25 public exports) that also owns cookie persistence, keyboard shortcut, and mobile Sheet composition — with **zero package-level tests**. A large fraction of the barrel surface is **shadcn completeness dead code**: many Sidebar/Avatar/Dropdown/Field subcomponents and CVA `*Variants` helpers are exported but never imported by `example-web` (or only used inside the defining file). Meaningful DRY debt is **Dialog ⇄ Sheet** (parallel `@base-ui/react/dialog` stacks) and **Input ⇄ Textarea** (near-identical control chrome classes). No product-domain leakage. No P0; P1 is the god file + dead persistence half-implementation.

## Findings

| ID | Severity | File | Finding | Evidence |
|----|----------|------|---------|----------|
| SMELL-P4-001 | P1 | `packages/ui/src/components/ui/sidebar.tsx` | **God component / god file.** | **~686 LOC** (coverage: **544** instrumented lines). Single module defines context, provider, layout shell, rail, inset, group*, menu*, sub-menu*, skeleton, CVA variants, plus cookie write + global `keydown` Ctrl/Cmd+B. Exports **25** symbols. Largest file in package by ~3× next (`dropdown-menu` ~200 instrumented). Threshold god file ≈ 400 LOC — exceeded. Blast radius high; **0% line coverage** in package tests. |
| SMELL-P4-002 | P1 | `sidebar.tsx:17–18,63–75` | **Dead / half-implemented cookie persistence.** | `document.cookie = \`${SIDEBAR_COOKIE_NAME}=${openState}; path=/; max-age=…\`` on every `setOpen`, but **`SIDEBAR_COOKIE_NAME` is never read** monorepo-wide. State always starts from `defaultOpen` (default `true`). Cookie is write-only noise: privacy surface + false expectation of restored collapse. Prefer `localStorage` with read on mount **or** drop write until read is wired. |
| SMELL-P4-003 | P2 | `sidebar.tsx` export list vs `apps/example-web` | **Large dead export cluster (Sidebar).** | Consumer (`app-shell.tsx`) uses only: `Sidebar`, `SidebarContent`, `SidebarFooter`, `SidebarGroup`, `SidebarGroupContent`, `SidebarHeader`, `SidebarInset`, `SidebarMenu`, `SidebarMenuButton`, `SidebarMenuItem`, `SidebarProvider`, `SidebarTrigger`. **Never imported outside package:** `SidebarGroupAction`, `SidebarGroupLabel`, `SidebarInput`, `SidebarMenuAction`, `SidebarMenuBadge`, `SidebarMenuSkeleton`, `SidebarMenuSub`, `SidebarMenuSubButton`, `SidebarMenuSubItem`, `SidebarRail`, `SidebarSeparator`, `useSidebar` (hook only used internally). ~12/25 symbols are kit-completeness dead surface. |
| SMELL-P4-004 | P2 | Barrel + component exports vs apps | **Dead exports outside Sidebar (kit surface bloat).** | **Never used by apps:** `AvatarBadge`, `AvatarGroup`, `AvatarGroupCount`, `AvatarImage`; `CardAction`; `DialogClose`, `DialogOverlay`, `DialogPortal`, `DialogTrigger` (Portal/Overlay only internal); `DropdownMenuCheckboxItem`, `DropdownMenuPortal`, `DropdownMenuRadioGroup`, `DropdownMenuRadioItem`, `DropdownMenuShortcut`, `DropdownMenuSub`, `DropdownMenuSubContent`, `DropdownMenuSubTrigger`; `FieldContent`, `FieldLegend`, `FieldSeparator`, `FieldSet`, `FieldTitle`; `SheetClose`, `SheetTrigger`; `TableCaption`, `TableFooter`; public `ScrollBar`; `buttonVariants`, `badgeVariants`; public `useIsMobile` (only `sidebar` imports it). Expected for shadcn “full compound” copy — still real API surface + tree-shake/docs noise for a kit. |
| SMELL-P4-005 | P2 | `dialog.tsx` · `sheet.tsx` | **Structural duplication (parallel Dialog primitives).** | Both wrap `@base-ui/react/dialog` as Root/Trigger/Close/Portal/Overlay|Backdrop/Content/Header/Footer/Title/Description. Shared patterns: close `Button` + `XIcon` + sr-only `"Close"`, portal+overlay compose, near-identical Title/Description wrappers. Sheet adds `side` positioning; Dialog adds centered popup + optional footer close. ~120 + ~125 LOC of sibling clones. Refactor candidate: shared `createOverlayChrome` / internal primitive — not urgent if shadcn `ui:add` re-overwrites. |
| SMELL-P4-006 | P2 | `input.tsx:11–12` · `textarea.tsx:9–10` | **Duplicated control chrome class strings.** | Near-identical Tailwind chains: `rounded-lg border border-input … focus-visible:border-ring focus-visible:ring-3 … disabled:… aria-invalid:border-destructive … dark:bg-input/30 …`. Size/height differ (`h-8` vs `min-h-16` / `field-sizing-content`). DRY → shared `controlFieldClassName` (or CVA `controlVariants`) would prevent focus-ring / invalid-state drift. |
| SMELL-P4-007 | P2 | `sidebar.tsx:311–331` · many `Sidebar*` shells | **Micro-duplication of data-slot div shells.** | `SidebarHeader` / `SidebarFooter` are identical (`flex flex-col gap-2 p-2` + different `data-slot`/`data-sidebar`). Same pattern for Group/Content/Menu/MenuItem/SubItem — pure presentational clones. Fine for shadcn paste; smell only if local edits diverge. |
| SMELL-P4-008 | P2 | `sidebar.tsx:570–600` | **Non-deterministic `Math.random` in render state.** | `SidebarMenuSkeleton` uses `useState(() => \`${Math.floor(Math.random() * 40) + 50}%\`)` for skeleton width. SSR/hydration mismatch risk if ever SSR’d; flaky visual snapshots; unnecessary entropy for a kit. Prefer fixed width or prop `width`. |
| SMELL-P4-009 | P3 | `sidebar.tsx:450–470` · `button.tsx` · `badge.tsx` | **Mega CVA base strings (readability / god-line).** | `sidebarMenuButtonVariants` base class is a single ~600-char line; Button/Badge CVA bases similarly dense. Hard to review diffs; not logic smell but change-cost smell. |
| SMELL-P4-010 | P3 | `sonner.tsx:3` · several files | **Broken / leftover `'use client'` RSC directives.** | `sonner.tsx` has `;('use client')` **after** imports — expression no-op, not a directive. Other files keep top-of-file `'use client'` despite `components.json` `"rsc": false` (Vite SPA). Copy-paste noise from Next/shadcn templates. |
| SMELL-P4-011 | P3 | Hardcoded EN chrome | **Non-i18n strings in primitives.** | `"Close"` (`dialog.tsx:62,95`, `sheet.tsx:67`); `"Sidebar"` / `"Displays the mobile sidebar."` / `"Toggle Sidebar"` (`sidebar.tsx:185–186,257,269,272`). AGENTS default UI language FR — kit forces EN SR labels. Smell for dual-mission kit (not product bug yet). |
| SMELL-P4-012 | P3 | `field.tsx:107–117` | **Slot naming collision.** | `FieldTitle` sets `data-slot="field-label"` same as `FieldLabel`. CSS/`has-[data-slot=field-label]` selectors cannot distinguish title vs label. |
| SMELL-P4-013 | P3 | `field.tsx:184` | **Loose equality.** | `uniqueErrors?.length == 1` uses `==` (Biome often flags); prefer `===`. |
| SMELL-P4-014 | P3 | `sonner.tsx` export surface | **Incomplete toast API surface (DX smell).** | Kit exports only `Toaster`; apps import `toast` from `'sonner'` directly (app-shell, notes, keys, login, dashboard, design-system). Dual import path / version coupling. Re-export `toast` (and maybe types) from `@gosilex/ui` for single entry. |
| SMELL-P4-015 | P3 | `sidebar.tsx:86–96` | **Global keybinding with no opt-out.** | `SidebarProvider` always registers `window` `keydown` for Ctrl/Cmd+B. No `enableKeyboardShortcut` prop — can fight app-level shortcuts. Acceptable default; smell when second SPA embeds provider. |
| SMELL-P4-016 | P3 | `package.json` | **CLI in runtime deps.** | `"shadcn": "^4.13.0"` in `dependencies` with zero `src` imports (`ui:add` script only). Inflates consumer install graph — `devDependency` (or root tooling). Architecture also notes; smells as dead runtime dep. |

### Non-findings (healthy)

| Area | Assessment |
|------|------------|
| Product domain leakage | **None.** No share/artifact/slug strings in package (name `@gosilex/ui` only). |
| God files besides sidebar | **None.** Next largest: `dropdown-menu.tsx` (~256 LOC / 200 instrumented), `field.tsx` (~222 / 174) — compound components, not god logic. |
| Long business functions | **None** matching BE “service method >80 LOC” pattern. Sidebar `Sidebar` / `SidebarProvider` / `SidebarMenuButton` are multi-branch UI, not algorithmic debt. |
| Deep nesting | **Low.** Mostly early returns (`collapsible === 'none'`, mobile Sheet, tooltip branch). Max practical depth ~3. |
| Naming vs AGENTS | **Aligned** with shadcn compound names (`DialogContent`, `SidebarMenuButton`, `FieldError`). |
| Core helpers | `cn` tiny and tested; `useIsMobile` small (breakpoint magic 768 — acceptable). |
| Extractability | Package has no app imports; barrel is single entry — good for kit extract. |

## Metrics

| Metric | Value |
|--------|------:|
| Files analyzed (src + package config, excl. node_modules) | **~30** |
| Component modules (`components/ui/*.tsx` excl. tests) | **19** |
| Support modules | **3** (`lib/utils.ts`, `hooks/use-mobile.ts`, `styles/globals.css`) |
| Test modules | **3** (+ setup/capture helpers) |
| Instrumented LOC (coverage total) | **1623** |
| Max file LOC | **~686** (`sidebar.tsx`) |
| Max instrumented lines | **544** (`sidebar.tsx`) |
| God files (>400 LOC) | **1** |
| Functions >80 LOC (logic) | **0** (UI branches only) |
| Public symbols (approx., barrel via `export *`) | **~90+** |
| Dead / unused-by-apps public symbols (approx.) | **~40+** (see SMELL-P4-003/004) |
| Issues total | **16** |
| P0 | **0** |
| P1 | **2** |
| P2 | **6** |
| P3 | **8** |
| Duplicated logic clusters | **3** (Dialog/Sheet; Input/Textarea; Sidebar shell twins) |
| Coverage lines (package summary) | **~22%** (sidebar 0%) |

**Inventory:**

```text
packages/ui/
  package.json · components.json · tsconfig.json · vite.config.ts · vitest.config.ts
  src/
    index.ts                    # barrel: 18 components + useIsMobile + cn
    lib/utils.ts · utils.test.ts
    hooks/use-mobile.ts
    styles/globals.css
    test/setup.ts · capture-errors.ts
    components/ui/
      avatar · badge · button · card
      dialog · dialog-sheet.test
      dropdown-menu · dropdown-menu.test
      field · input · label · scroll-area · separator
      sheet · sidebar · skeleton · sonner · table · textarea · tooltip
```

**Consumer usage sketch (example-web only):**

```text
Used core: Button, Badge, Card*, Input, Label, Textarea, Separator, Skeleton,
  Dialog (content/header/footer/title/description), Sheet (same subset),
  Dropdown (group/item/label/separator/trigger/content), Field (+Label/Error/Description/Group),
  Table (header/body/row/head/cell), Avatar+Fallback, ScrollArea, Toaster, Tooltip*,
  Sidebar (provider/shell/header/content/footer/group/group-content/menu/menu-item/menu-button/inset/trigger)

Dead-to-apps (high volume): Sidebar* advanced, Dropdown* sub/checkbox/radio,
  Avatar* extras, FieldSet/Legend/Content/Title/Separator, Dialog/Sheet triggers/closes,
  TableCaption/Footer, CardAction, *Variants, useIsMobile, ScrollBar, useSidebar
```

## Recommendations

1. **Split or fence the god Sidebar (SMELL-P4-001)**  
   - Prefer multi-file layout under `components/ui/sidebar/`: `context.tsx` (provider + hook + cookie/storage), `sidebar.tsx` (shell + mobile Sheet), `menu.tsx` (menu/button/sub), `group.tsx`, `chrome.tsx` (header/footer/inset/rail/input). Re-export from `sidebar/index.ts` for stable public API.  
   - Minimum if no split: add contract tests for Provider + Trigger + collapsible paths (currently 0%).

2. **Fix or remove cookie persistence (SMELL-P4-002)**  
   - **Option A:** read cookie (or `localStorage`) on mount to seed `_open`.  
   - **Option B:** delete write path until product needs restore.  
   - If cookie stays: add `SameSite=Lax` (+ `Secure` in prod) for consistency with AGENTS cookie table (non-auth but same hygiene).

3. **Treat dead exports as intentional completeness, document it (SMELL-P4-003/004)**  
   - Do **not** mass-delete shadcn compounds yet — design-system may grow.  
   - Optional: design-system page sections that exercise advanced Sidebar/Dropdown/Field so dead surface becomes demo surface.  
   - Optional later: subpath exports (`@gosilex/ui/sidebar`) for tree-shaking clarity.

4. **DRY only high-churn twins (SMELL-P4-005/006)**  
   - Shared `fieldControlClassName` for Input/Textarea first (small win).  
   - Dialog/Sheet: extract only if next `shadcn add` won’t thrash; otherwise leave clones and pin versions.

5. **Deterministic skeleton; clean RSC leftovers (SMELL-P4-008/010)**  
   - Fixed skeleton width (e.g. `70%`) or prop.  
   - Remove `;('use client')` and optionally all `'use client'` given SPA-only.

6. **Toast single entry (SMELL-P4-014)**  
   - `export { toast } from 'sonner'` (or thin wrapper) from `@gosilex/ui`; migrate apps off direct `sonner` imports.

7. **i18n hooks for chrome strings (SMELL-P4-011)** — P1 product when FR default ships  
   - Props for `closeLabel` / sidebar SR strings, or context from `@gosilex/i18n`.

8. **Move `shadcn` to devDependency (SMELL-P4-016)** — trivial package.json hygiene.

## Residual risks

| Risk | Notes |
|------|--------|
| shadcn `ui:add -o` overwrite | Local splits/DRY may be destroyed by CLI regen; document “owned forks” vs generated. |
| Cookie without read | Users think collapse state persists; it doesn’t — UX bug if demoed as such. |
| Global Ctrl/Cmd+B | Collides with browser/app shortcuts when multiple providers or non-admin layouts appear. |
| Hydration / random skeleton | Only bites if SSR or snapshot tests touch `SidebarMenuSkeleton`. |
| Wide `export *` barrel | Consumers may import dead symbols that later change; API stability tax. |
| Coverage floors | T2 intentional low; sidebar still the largest untested surface — regressions only caught via design-system smoke in example-web. |
| Dual `toast` import | Version skew between package `sonner` and app transitive resolve if deps diverge post-extract. |

**Overall code-smell score for P4:** moderate — **healthy primitives, one overweight Sidebar, expected shadcn dead surface**. Address P1 (god file + cookie half-impl) before expanding admin chrome; treat mass export pruning as optional until second consumer exists.
