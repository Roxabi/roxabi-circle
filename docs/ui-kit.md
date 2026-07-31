# `@gosilex/ui` — kit surface

Shared **shadcn Base UI** primitives for Chemin A apps. Product branding does **not** live here.

## What it is

- Package: `packages/ui` → import `@gosilex/ui`
- Styles: `@import "@gosilex/ui/styles.css"` (see `apps/example-web/src/index.css`)
- Living catalog: local route **`/admin/design-system`** (platform session required)

## Zero-edit / product brand

Do **not** patch `packages/ui` for product colors or copy.

1. Import kit styles in the app.
2. Override CSS variables in an **app-owned** file (tokens).
3. Compose shells/pages in `apps/<product>-web` wrapping `@gosilex/ui`.

SSoT: [`docs/product-consumer-contract.md`](product-consumer-contract.md) (design_overrides).

## Conventions for example-web

| Concern | Pattern |
|---------|---------|
| Destructive confirm | `AlertDialog` (not `window.confirm`) |
| Lists empty | `@gosilex/ui` `Empty` + `EmptyHeader` / `EmptyMedia` / `EmptyTitle` |
| Selects | `@gosilex/ui` `Select` (Base UI) + `items` prop — not native `<select>` |
| Forms | TanStack Form + Zod (`lib/schemas.ts`) + Field from ui |
| i18n chrome | App message catalogs (`src/messages/*`) — not hardcoded in ui |
| Local D1 seed | `bun run db:seed` after `db:migrate` — re-applies SQL only if `d1_migrations` missing |

## Exports

See `packages/ui/src/index.ts` for the current export map (Button, Dialog, Sheet, Sidebar, AlertDialog, Select, Empty, …). Prefer the living design-system page over duplicating a long inventory here.

### Sidebar 07 block (shadcn)

Installed via `bunx --bun shadcn@latest add sidebar-07` into `packages/ui`:

| Export | Role |
|--------|------|
| `AppSidebar` | Demo composition (`collapsible="icon"`) |
| `NavUser` | Footer user menu — pass `user`, optional `children` items, `onLogout` |
| `TeamSwitcher` | Header team switcher |
| `NavMain` / `NavProjects` | Collapsible nav groups |
| `Breadcrumb*` / `Collapsible*` | Supporting primitives |

`example-web` shell uses `Sidebar collapsible="icon"` + `NavUser` for the real session menu.

## Related

- Stack: `AGENTS.md` § UI / packages
- Testing: design-system overlay e2e `bun run test:e2e:design-system` (API + web up)
