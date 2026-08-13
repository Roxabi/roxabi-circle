# Code Smells — apps (example-api · example-web · mcp-example)

**Domain:** Code Smells  
**Partition:** apps  
**Scope:** `apps/example-api/**`, `apps/example-web/**`, `apps/mcp-example/**`  
**Date:** 2026-08-12  
**Gate context:** `QG_FILE_MAX=300` · exemptions `tools/file_exemptions.txt` (declared local caps) · folder max 40

## Summary

Dogfood apps are **generally well-layered** on the API side (thin routes for notes/items/tasks; services hold rules) and **thin by design** for MCP (`ping`/`whoami` only). Smell pressure concentrates in **quality-gate exemptions already tracking oversized demo surfaces**: design-system showcase, org-members admin, notes CRUD, and multi-concern `routes/orgs.ts` + `services/org-roles.ts`. Several exemptions sit **within ~5–10% of their caps**, so small feature growth fails `quality-gates:check` without a split. Secondary smells: **D11 org-list filter copy-pasted** on two routes, **`newMemberId` dual local helpers**, FE/BE Zod drift on notes body, and page-local TanStack Query CRUD (items/notes) vs the better **tasks split** (`tasks-create-dialog` / `tasks-comments-panel`). No `any` / biome-ignore debt in apps source. No P0/P1 code-smell breakers.

## Findings

| ID | Severity | File | Finding | Evidence | Recommendation |
|----|----------|------|---------|----------|----------------|
| F1 | P2 | `apps/example-web/src/routes/design-system.tsx` · `tools/file_exemptions.txt` | **God showcase page** — single route owns entire DS catalog | **944 LOC** (exempt cap **1000**). One `DesignSystemPage` export + local `Section`/`DemoBox`; TOC covers foundations → templates (~L168–L943). Hard-coded demo table rows (“hello kit”) inline. | Split into `routes/design-system/*.tsx` (or `components/design-system/sections/*`) imported by a thin page shell; lower exemption after split. Do not raise cap. |
| F2 | P2 | `apps/example-web/src/routes/org-members.tsx` | **Fat multi-concern page** near exemption ceiling | **576 LOC** (exempt **600**). Single `OrgMembersPage`: members list + invite form + custom roles create/delete + grant Select PATCH + optimistic map (`optimisticAccess`) + delete AlertDialog. Four `useQuery` keys + multiple mutations. | Extract panels: `OrgMembersList`, `OrgInvitesPanel`, `OrgRolesPanel` (or route children). Model after `tasks.tsx` + dialog/panel split. Target ≤300 or a lower exemption. |
| F3 | P2 | `apps/example-web/src/routes/notes.tsx` | **CRUD + table + dialogs** in one route | **490 LOC** (exempt **520**). List + TanStack Table columns/filters + create Dialog (Form) + delete AlertDialog + Markdown cells + hotkey. | Peel create/delete dialogs into components; optional `lib/notes.ts` hooks for query keys. Prefer split over raising 520. |
| F4 | P2 | `apps/example-api/src/routes/orgs.ts` | **Multi-concern god router** (orgs + invites + modules + roles + platform) | **321 LOC** (exempt **340**). One Hono module mounts: `/api/orgs` CRUD-ish, members, invitations, org modules, custom roles/grants, **and** `/api/platform/modules`. Six+ inline session-only guards. | Split: `routes/orgs.ts` (org list/create/get), `routes/org-invitations.ts` (or keep public accept separate), `routes/org-roles.ts`, `routes/platform-modules.ts`. New flows admin must **not** land here. |
| F5 | P2 | `apps/example-api/src/routes/me.ts` | **Route → repo direct** + **me+keys co-location** | Imports `platformRolesRepo`, `usersRepo` (L6–7, 26, 35); also hosts `/api/keys` mint/list/revoke. Only business route with repo imports (architecture P5-P6 F1). | Move profile aggregation to `services/me.ts` (or extend `user-shell`); keep keys in `routes/keys.ts` or `services/auth` only. Zero route→repo imports. |
| F6 | P2 | `apps/example-api/src/routes/me.ts`, `routes/orgs.ts` | **Duplicated D11 org filter** (sk_ scope) | Identical block: `keyOrganizationId` + `authMethod === 'api_key'` → `orgs.filter` (`me.ts` L29–33; `orgs.ts` L68–72). Drift risk if one path forgets. | Extract `filterOrgsForApiKey(orgs, c)` helper (middleware util or `services/orgs`) and call from both list endpoints. |
| F7 | P2 | `apps/example-api/src/services/org-roles.ts` | **Dense RBAC service** near file-length cap | **326 LOC** (exempt **340**). System seed, custom role CRUD, grant set, ceiling `assertAssignableRole`, grant maps, FLOWS seed special-case. | Split seed (`ensureSystemRoles`) vs custom-role mutations vs assignability asserts; or `org-roles-seed.ts` / `org-roles-assign.ts`. Leave headroom under 300. |
| F8 | P3 | `apps/example-web/src/routes/items.tsx` · API `routes/items.ts` | **Copy-paste MasterData CRUD demo** + dual Zod | Web **341 LOC** (exempt **400**): create/edit/delete dialogs mirror notes pattern. `createSchema` local in page (L46–54); API has parallel `createItemSchema` (items.ts L8–17) — not shared via `lib/schemas.ts` (notes is). | Acceptable demo density if kept; move item Zod to `lib/schemas.ts` for FE SSoT; extract dialogs if adding fields. Prefer lower exemption. |
| F9 | P3 | `apps/example-api/src/services/invitations.ts`, `services/user-shell.ts` | **Duplicated `newMemberId`** | `user-shell` exports `newMemberId` (L19–21); `invitations` defines private identical helper (L31–33) and uses it at accept (L259). Admin path uses shell export. | Import `newMemberId` from `user-shell` in invitations; delete local. |
| F10 | P3 | `apps/example-api/src/routes/orgs.ts` vs `routes/admin-users.ts` | **Session-only guard pattern inconsistent** | `admin-users` has `requireSession` helper (L41–45). `orgs.ts` inlines `authMethod !== 'session'` **6+ times** with slightly different messages. | Shared `requireSessionAuth(c, message?)` middleware or tiny helper used by all mutation routes. |
| F11 | P3 | `apps/example-web/src/lib/schemas.ts` vs `apps/example-api/src/routes/notes.ts` | **Minor Zod contract drift (notes body)** | FE `createNoteSchema`: `body: z.string().max(10_000)` required (schemas.ts L40–43). API: `body: z.string().max(10_000).optional()` (notes.ts L10). Empty body OK server-side; client always sends string. | Align: FE `.optional()` or `.default('')`; document dual-boundary as intentional if kept. |
| F12 | P3 | `apps/example-web/src/routes/home.tsx` | **Deprecated re-export dead surface** | Sole content: re-export `DashboardPage as HomePage` with deprecation comment. | Delete when no imports remain (typecheck guards). |
| F13 | P3 | `apps/example-web/src/messages/fr.ts` | **Type + catalog co-located** (bulk, not logic) | **~562 LOC** (exempt **620**): `export type Messages` (~L1–279) + `export const fr` (~L281+). `en.ts` is values-only (~283 LOC) typed against `Messages`. | When keys grow: `messages/types.ts` + `fr.ts`/`en.ts` values; or domain split (`messages/fr/auth.ts`). Cap is for bulk strings — OK until product catalogs land. |
| F14 | P3 | `apps/example-web/src/routes/{notes,items,keys,admin/users}.tsx` vs `tasks*.tsx` | **Inconsistent feature modularity** | Tasks already split dialog/panel. Notes/items/keys/admin-users keep Query + UI + dialogs in one file. Product forks lack one “feature hooks” recipe (also architecture P7 F3). | Prefer tasks pattern for next demo CRUD; optional `lib/*` query modules for notes/items/keys. |

### Positive (no finding ID)

| Area | Assessment |
|------|------------|
| **mcp-example** | ~81 LOC; catalogue SSoT + `registerAll` only; no god tools. Model app for thinness. |
| **API CRUD routes** | `items.ts` / `notes.ts` / `tasks.ts` stay thin (service-first); good anti-god-handler. |
| **Settings / login** | Account forms + magic form extracted; not god pages. |
| **No type-escape debt** | Grep: no `as any`, `@ts-expect-error`, biome-ignore, TODO/FIXME in apps `src`. |
| **Folder density** | `services/` (~16 prod files), `routes/` (14), web `routes/` (~20) — under folder max 40. |
| **Services under bar** | `admin-users` ~294, `tasks` ~265, `invitations` ~290, `auth` ~107 — pass raw 300 without exemption. |

## Quality-gate exemptions (apps only)

| Path | Declared cap | Approx. LOC | Headroom | Smell class |
|------|-------------:|------------:|---------:|-------------|
| `example-web/.../design-system.tsx` | 1000 | 944 | ~56 | god showcase |
| `example-web/.../org-members.tsx` | 600 | 576 | ~24 | fat multi-concern |
| `example-web/.../notes.tsx` | 520 | 490 | ~30 | fat CRUD page |
| `example-web/.../items.tsx` | 400 | 341 | ~59 | CRUD demo |
| `example-web/.../messages/fr.ts` | 620 | 562 | ~58 | bulk i18n |
| `example-api/.../routes/orgs.ts` | 340 | 321 | ~19 | multi-concern route |
| `example-api/.../services/org-roles.ts` | 340 | 326 | ~14 | dense RBAC service |

**Risk:** org-roles / orgs / org-members / notes have **tight headroom** — one PR can fail tree quality-gates without a split.

## Metrics

| Metric | Value |
|--------|------:|
| Files reviewed (primary + sampling) | ~75 (API routes/services/repos/middleware · web routes/components/lib/messages · mcp src) |
| Issues | **P0=0 · P1=0 · P2=7 · P3=7** |
| App file-length exemptions | **7** (all listed above) |
| example-api routes with repo imports | **1** (`me.ts`) |
| mcp-example tools | **2** (`ping`, `whoami`) |
| Apps `any` / biome-ignore / bare TODO | **0** |
| Notable hotspots | design-system · org-members · notes · orgs route · org-roles service · me+keys |

## Recommendations

1. **P2 — Split before raise:** Prefer file splits for F1–F4/F7 over exemption bumps. Order by headroom risk: `org-roles` → `orgs` routes → `org-members` → `notes` → design-system.
2. **P2 — Close layering + D11 DRY:** F5 + F6 together: `getMeProfile` service + shared org filter for api_key; delete repo imports from routes.
3. **P2 — Use tasks as the modularity template** for org-members and future CRUD (dialog/panel files, page orchestrates queries only).
4. **P3 — Hygiene batch:** F9 `newMemberId` import; F10 shared session helper; F11 notes body schema align; F12 drop `home.tsx`; F8 move item schema to `lib/schemas.ts`.
5. **Do not treat exemptions as free debt** — document SMELL IDs in exemption comments when touching caps (design-system already mentions SMELL-P6; align naming with this audit’s F\* IDs if synthesizer consolidates).
6. **Keep green:** mcp thinness, API service-first CRUD, no type escapes, folder caps.

## Scope notes

- Read-only audit; did not re-run `quality-gates:check` (LOC from file ends / structure; exemptions from `tools/file_exemptions.txt`).
- Seed/demo passwords and long JSDoc on `require-auth` are intentional kit/demo docs — not counted as smells.
- Security/IDOR correctness of org filters is out of domain; **duplication** of the filter is the smell (F6).
- Cross-ref: architecture `P5-P6` F1 (me→repo), `P7-P8` F1 (god-routes), F3 (data-layer inconsistency).
