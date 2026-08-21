# `@kit/ui` — kit surface

Shared **shadcn Base UI** primitives for Chemin A apps. Product branding does **not** live here.

## What it is

- Package: `packages/ui` → import `@kit/ui`
- Styles: `@import "@kit/ui/styles.css"` (see `apps/example-web/src/index.css`)
- Living catalog: local route **`/admin/design-system`** (platform session required)

## Zero-edit / product brand

Do **not** patch `packages/ui` for product colors or copy.

1. Import kit styles in the app.
2. Override CSS variables in an **app-owned** file (tokens).
3. Compose shells/pages in `apps/<product>-web` wrapping `@kit/ui`.

SSoT: [`docs/kit/product-consumer-contract.md`](product-consumer-contract.md) (design_overrides).

## Conventions for example-web

| Concern | Pattern |
|---------|---------|
| Destructive confirm | `AlertDialog` (not `window.confirm`) |
| Lists empty | `@kit/ui` `Empty` + `EmptyHeader` / `EmptyMedia` / `EmptyTitle` |
| Selects | `@kit/ui` `Select` (Base UI) + `items` prop — not native `<select>` |
| Forms | TanStack Form + Zod (`lib/schemas.ts`) + Field from ui |
| i18n chrome | App catalogs (`src/messages/*`) + `LocaleSwitcher` (`locales` from `createI18n`). Hidden if one locale. Kit does not ship FR/EN copy |
| Local D1 seed | `bun run db:seed` after `db:migrate` — re-applies SQL only if `d1_migrations` missing |

## Exports

See `packages/ui/src/index.ts` for the current export map (Button, Dialog, Sheet, Sidebar, AlertDialog, Select, Empty, …). Prefer the living design-system page over duplicating a long inventory here.

### Tasks-related primitives (shadcn, 2026-08)

| Export | Source | Use |
|--------|--------|-----|
| `Calendar` | `shadcn add calendar` | Day grid (`react-day-picker`) |
| `DatePicker` | Kit composition (Popover + Calendar) — no base-nova registry item | Due dates; pass `placeholder` from app i18n |
| `LocaleSwitcher` | Kit composition (Button / DropdownMenuItem) | Auth chips + settings + shell menu. Pass `locales` from `@kit/i18n`. Renders nothing for a single locale |
| `Popover*` | `shadcn add popover` | Anchored overlays |
| `Combobox*` (+ `ComboboxChips` multi) | `shadcn add combobox` | Assignees / multi-select |
| `InputGroup*` | pulled in by combobox | Input chrome |

Add more via `bun run --filter @kit/ui ui:add <name>`.

### Sidebar 07 block (shadcn)

Installed via `bunx --bun shadcn@latest add sidebar-07` into `packages/ui`:

| Export | Role |
|--------|------|
| `NavUser` | Footer user menu — pass `user`, optional `children` items, `onLogout` |
| `TeamSwitcher` | Header team switcher |
| `NavMain` / `NavProjects` | Collapsible nav groups |
| `Breadcrumb*` / `Collapsible*` | Supporting primitives |

`AppSidebar` (Acme sample composition) lives under `packages/ui` but is **not** public barrel API — compose the pieces above like `example-web` shell.

`example-web` shell uses `Sidebar collapsible="icon"` + `NavUser` for the real session menu.

## TanStack (example-web)

| Package | Role in kit |
|---------|-------------|
| `@tanstack/react-router` | SPA routes |
| `@tanstack/react-query` | Server state |
| `@tanstack/react-form` | Forms + Zod validators (login, notes, …) |
| `@tanstack/react-table` | Headless tables (e.g. notes list) |
| `@tanstack/react-hotkeys` | Shortcuts (`HotkeysProvider` in `main.tsx`; notes `Mod+Shift+N`) |
| `@tanstack/markdown` | Markdown render (`@tanstack/markdown/react` on note body) |

## Related

- Stack: `AGENTS.md` § UI / packages · `.claude/stack.yml`
- Testing: design-system overlay e2e `bun run test:e2e:design-system` (API + web up)
