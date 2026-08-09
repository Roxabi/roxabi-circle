---
status: reference
normative: false
---

# Lucide import inventory — #20

Pre-bump sites: **25**

| Path | Named exports |
|------|---------------|
| `apps/example-web/src/components/app-shell.tsx` | Boxes, Building2, FileText, KeyRound, Languages, LayoutDashboard, Moon, Palette, Settings, Sparkles, Sun, SunMoon, Users |
| `apps/example-web/src/components/org-switcher.tsx` | Building2, ChevronsUpDown, Plus |
| `apps/example-web/src/routes/admin/home.tsx` | Boxes, Building2, Palette |
| `apps/example-web/src/routes/dashboard.tsx` | Activity, FileText, KeyRound, Mail |
| `apps/example-web/src/routes/design-system.tsx` | AlertTriangle, ArrowDown, ArrowUp, ArrowUpDown, Check, ChevronRight, Copy, Info, LayoutTemplate, Palette, Plus, Settings, Trash2 |
| `apps/example-web/src/routes/forgot-password.tsx` | GalleryVerticalEnd |
| `apps/example-web/src/routes/items.tsx` | Pencil, Plus, Trash2 |
| `apps/example-web/src/routes/keys.tsx` | Copy, KeyRound, Trash2 |
| `apps/example-web/src/routes/login.tsx` | GalleryVerticalEnd |
| `apps/example-web/src/routes/notes.tsx` | ArrowDown, ArrowUp, ArrowUpDown, Plus, Trash2 |
| `apps/example-web/src/routes/reset-password.tsx` | GalleryVerticalEnd |
| `packages/ui/src/components/app-sidebar.tsx` | AudioLinesIcon, BookOpenIcon, BotIcon, FrameIcon, GalleryVerticalEndIcon, MapIcon, PieChartIcon, Settings2Icon, TerminalIcon, TerminalSquareIcon |
| `packages/ui/src/components/nav-main.tsx` | ChevronRightIcon |
| `packages/ui/src/components/nav-projects.tsx` | ArrowRightIcon, FolderIcon, MoreHorizontalIcon, Trash2Icon |
| `packages/ui/src/components/nav-user.tsx` | ChevronsUpDownIcon, LogOutIcon |
| `packages/ui/src/components/team-switcher.tsx` | ChevronsUpDownIcon, PlusIcon |
| `packages/ui/src/components/ui/breadcrumb.tsx` | ChevronRightIcon, MoreHorizontalIcon |
| `packages/ui/src/components/ui/checkbox.tsx` | CheckIcon |
| `packages/ui/src/components/ui/dialog.tsx` | XIcon |
| `packages/ui/src/components/ui/dropdown-menu.tsx` | CheckIcon, ChevronRightIcon |
| `packages/ui/src/components/ui/select.tsx` | CheckIcon, ChevronDownIcon, ChevronUpIcon |
| `packages/ui/src/components/ui/sheet.tsx` | XIcon |
| `packages/ui/src/components/ui/sidebar.tsx` | PanelLeftIcon |
| `packages/ui/src/components/ui/sonner.tsx` | CircleCheckIcon, InfoIcon, Loader2Icon, OctagonXIcon, TriangleAlertIcon |
| `packages/ui/src/components/ui/spinner.tsx` | Loader2Icon |

## Rename table (post-bump)

| Old | New | Files |
|-----|-----|-------|
| — | — | **none** — all 25 pre-bump named imports typecheck on lucide-react@1.29.0 |

## Post-bump lock

- `packages/ui` + `apps/example-web`: `lucide-react: ^1.29.0`
- Lock resolves: `lucide-react@1.29.0` (single)
- Gates: `@kit/ui` typecheck ✓ · `@kit/example-web` typecheck ✓ · example-web build (see commit)

## Dependabot #5

- Close/supersede PR #5 (`dependabot/npm_and_yarn/lucide-react-1.27.0`) **before** merging this feature PR.
- #5 is version-only to 1.28.0; this wave pins **1.29.0** + inventory + gates.
- Command when feature PR is open: `gh pr close 5 --comment "Superseded by feat/20-lucide-react-1x (lucide-react ^1.29.0 + verify)."`
