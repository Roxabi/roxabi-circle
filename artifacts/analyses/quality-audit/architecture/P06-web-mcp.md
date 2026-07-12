# Architecture — P6 example-web + mcp-example

**Date:** 2026-07-12  
**Partition:** `apps/example-web/**`, `apps/mcp-example/**`  
**Domain:** Architecture (TanStack router/query composition, api client placement, i18n structure, MCP composition of `@gosilex/mcp`, FE/BE boundary, package vs app concerns)  
**Refs:** ADR-0001 (`docs/architecture/adr/0001-primary-axis-packages-compose-apps.md`), AGENTS.md §B/C/E/F/G/K (B4–B5), goal `001-chemin-a-boilerplate-goal.md` D6/D9, related `P03-db-storage-email-mcp.md` ARCH-P03-011/012

## Summary

Both example apps are **extract-clean** (no product-share domain) and correctly sit on the **deployable** side of ADR-0001: they compose packages and own UI/MCP wiring. `example-web` demonstrates the intended FE spine (Vite + React 19 + TanStack Router/Query/Form + `@gosilex/ui` + cookie `credentials: 'include'` + FR default). `mcp-example` proves kit tools `ping`/`whoami` over FastMCP stdio with an allowlist boot guard.

Architecture quality is **good for a B4–B5 kit demo**, weaker as a **copy-paste template for product apps**: the API client and `ApiError` live only in the app (not a reusable kit client); Query/Router composition is shallow (no `beforeLoad` auth, unused router `queryClient` context, no global mutation/query error policy); i18n is a solid hand-rolled catalog (not Paraglide/`@gosilex/i18n`); MCP still **owns FastMCP construction** while `@gosilex/mcp` only supplies handlers + exact-tool law (echoes P3). **No P0** defects. Main P1 risks: incomplete FE error SSoT vs AGENTS §F, hardcoded EN copy in product surfaces, and MCP package under-composition forcing N×M FastMCP glue.

## Findings

| ID | Severity | File | Finding | Evidence |
|----|----------|------|---------|----------|
| ARCH-P06-001 | — | `apps/example-web/package.json`; `apps/mcp-example/package.json` | **Positive:** workspace deps are kit-correct; FE does not pull server packages | Web: `@gosilex/types`, `@gosilex/ui` only (no `core`/`auth`/`db`/`storage`). MCP: `@gosilex/mcp` + direct `fastmcp` + `zod`. Aligns FE/BE boundary (web = HTTP client + UI; API owns secrets). |
| ARCH-P06-002 | — | `apps/example-web/src/**`; messages | **Positive:** zero product-share domain in example-web sources | Grep: no `share/` slug paths, `private_key`, artefact product copy. Demo domain is notes/keys/mailpit only. Extract banlist path satisfied for this partition. |
| ARCH-P06-003 | — | `src/lib/api.ts:21–30`; `vite.config.ts:9–18` | **Positive:** central `apiFetch` with cookies; dev proxy same-origin | `credentials: 'include'` always; `VITE_API_URL` optional base; Vite proxies `/api` + `/health` → `:8787` so session cookies work without CORS in local. Matches AGENTS cookie client rules. |
| ARCH-P06-004 | — | routes + `lib/auth.ts` | **Positive:** server state via TanStack Query, not `useEffect` fetch | `useMe`, notes, health, mutations all `useQuery`/`useMutation`. Login uses `useForm` + `invalidateQueries(meQueryKey)`. AGENTS §B anti-`useEffect` fetch held. |
| ARCH-P06-005 | — | `mcp-example/src/index.ts`; `scripts/stdio-smoke.mjs` | **Positive:** composition of `@gosilex/mcp` handlers + live stdio exact allowlist | Boot: `assertExactKitTools` + equality vs `MCP_TOOL_NAMES`. Loop `addTool` only over `REGISTERED_TOOL_NAMES`. Smoke asserts tools === `['ping','whoami']` and rejects `share_*`. Goal D9 shape met. |
| ARCH-P06-006 | P1 | `src/lib/api.ts:5–18`; AGENTS §F Frontend | **`ApiError` + client live only in the app** — second SPA will fork the FE error/client stack | Class `ApiError` + `apiFetch` ~47 LOC in `example-web`. No package `@gosilex/*` client helper; `@gosilex/types` only supplies `ApiErrorBody`. AGENTS: `ApiError { status, code, message, requestId, body }` + `apiErrorToMessage` shared path. Today: no `apiErrorToMessage`, no `body` field on class (has `details`), no ErrorBoundary mapping. Three-strikes signal when `share-web` lands. |
| ARCH-P06-007 | P1 | `src/main.tsx:11–18`; route `onError`s | **No global Query error / 401 policy** — each mutation toasts ad hoc; 401 UX incomplete | `QueryClient` only sets `staleTime` / `refetchOnWindowFocus`. No `mutations.onError` / `queries.onError`. Mutations: `String(e)` descriptions (`notes.tsx:55`, `keys.tsx:29`, `dashboard.tsx:37`). Login maps `ApiError` locally. AGENTS §F: global onError + toast; 401 → clear session → login (partially via AuthGate on next `useMe` fail, not central). |
| ARCH-P06-008 | P1 | `routes/keys.tsx:77–88`; `routes/dashboard.tsx:99–106` | **Hardcoded English UI strings** outside message catalogs | Keys card: `"Bearer"`, `"Authorization: Bearer sk_…"`, MCP paragraph in EN. Dashboard email card: `"Email"`, `"Mailpit"`. FR locale still shows EN copy → breaks “default FR” UX contract for those widgets. |
| ARCH-P06-009 | P1 | `mcp-example/src/index.ts:13–56`; `packages/mcp` (no fastmcp) | **App owns FastMCP host; kit package is not a conventions wrapper** | Direct `import { FastMCP } from 'fastmcp'`, manual `addTool`, `server.start({ transportType: 'stdio' })`. Package exports handlers/allowlist only (see ARCH-P03-011). Product `share-mcp` will re-copy this ~40 LOC host unless package grows `createKitMcpServer`. |
| ARCH-P06-010 | P2 | `main.tsx:20–23`; `routeTree.tsx` | **Router `context: { queryClient }` is dead** — never typed/consumed in routes | `createRouter({ routeTree, context: { queryClient } })` but no `createRootRouteWithContext`, no route `beforeLoad`/`loader` using context. Composition is “wired for TanStack Start-ish patterns” without using them; auth is React gates instead. |
| ARCH-P06-011 | P2 | `components/app-shell.tsx:271–300`; `routeTree.tsx:20–27` | **Auth/Admin via component gates + `queueMicrotask(navigate)`** instead of router `beforeLoad`/`redirect` | `AuthGate` / `AdminGate` check `useMe()` then `queueMicrotask(() => navigate(...))`. Works but races paint, is harder to unit-test without full React tree, and duplicates role checks if more protected routes appear. Router-level auth is the TanStack idiomatic composition. |
| ARCH-P06-012 | P2 | `login.tsx`, `notes.tsx` forms | **No Zod (or other) client validators** on TanStack Form — single boundary is API | Forms use `useForm` defaultValues + HTML `required` only (`notes.tsx:165`). No `validators` / shared Zod schemas with `example-api`. AGENTS: “Zod double frontière”. Acceptable for kit demo; weak template for product forms. |
| ARCH-P06-013 | P2 | `app-shell.tsx:83–87`; `dashboard.tsx:24–32` | **Duplicated query definitions** (`health`, `notes`) with ad-hoc key strings | `['health']` and `['notes']` inlined in multiple files; only `meQueryKey` centralized in `lib/auth.ts`. Risk of key drift and inconsistent `queryFn` typing when product grows. |
| ARCH-P06-014 | P2 | `routes/design-system.tsx` (~534 LOC covered lines) | **God route file** for design-system catalog | Coverage summary: `design-system.tsx` lines total **534** (largest module in app). Owns foundations/forms/overlays/templates UI. Fine as demo catalog, but should not be the pattern for product feature routes (split sections or own package storybook-like surface). |
| ARCH-P06-015 | P2 | page-local types e.g. `notes.tsx:34`; `auth.ts:6–11` | **Response DTOs defined in the SPA, not shared contracts** | `Note`, `MeResponse`, mint `{ id, key }` are hand-typed on the client. No import of Zod/OpenAPI from API. FE/BE drift risk (fields rename silently). Kit may keep this until a second client (MCP verified whoami / share-web). |
| ARCH-P06-016 | P2 | `mcp-example/src/index.ts:20–28` | **Triple allowlist coupling** app list ↔ package `MCP_TOOL_NAMES` ↔ `assertExactKitTools` | `REGISTERED_TOOL_NAMES` must match package export **and** pass exact assert; redundant equality throw after assert. Locks product MCP out of package helpers (ARCH-P03-012). Example-local allowlist alone would be enough with `assertNoShareTools` or banlist script. |
| ARCH-P06-017 | P3 | `lib/i18n.ts` + `messages/{fr,en}.ts`; no `packages/i18n` | **Hand-rolled i18n (type-safe catalogs)** — not Paraglide / `@gosilex/i18n` | Default FR, cookie/localStorage locale, `Messages` type on FR as SSoT, EN `satisfies` via type, contract test for key parity. AGENTS G: Paraglide aligned Roxabi **or** JSON at start — this is the simple path. Package `@gosilex/i18n` absent (P1 roadmap). No `/fr` `/en` path routing. |
| ARCH-P06-018 | P3 | `mcp` whoami path; package comment | **whoami is env presence only — no Hono API call** | `handleWhoami` always `verified: false`. Example does not use `apiFetch`/HTTP to `/api/me` with Bearer. AGENTS: MCP → same API + `sk_`. Kit exit D9 allows presence; architecture gap for “MCP = thin client of API”. |
| ARCH-P06-019 | P3 | `routes/home.tsx` | **Dead compatibility shim** | Re-exports `DashboardPage as HomePage` with deprecation comment; `routeTree` imports `dashboard` only. Noise for extract/template. |
| ARCH-P06-020 | P3 | `main.tsx` provider tree | **No route `errorComponent` / React ErrorBoundary** | Toaster + TooltipProvider + Locale/Theme only. Uncaught render errors not ShipFast-style support CTA page. Residual UX architecture gap. |
| ARCH-P06-021 | — | `messages.contract.test.ts`; `i18n.test.ts` | **Positive:** i18n key parity + non-empty / no TODO / no HTML handlers tested | TS enforces `en: Messages`; tests belt-and-suspenders key sets + content hygiene. Good kit quality bar for copy. |
| ARCH-P06-022 | — | `mcp-example` size + tests | **Positive:** thin app surface; registration SSoT unit + stdio smoke | Prod `index.ts` ~59 LOC; tests enforce exact tools; smoke exercises real FastMCP protocol. Package-vs-app: domain tools stay out of kit (correct). |

## Metrics

| Metric | Value |
|--------|------:|
| Apps in partition | 2 (`example-web`, `mcp-example`) |
| example-web prod TS/TSX modules (src, excl. tests) | **16** (main, routeTree, app-shell, 5 lib, 2 messages, 7 routes incl. home shim) |
| mcp-example prod modules | **1** (`src/index.ts`) |
| example-web coverage lines (summary) | **1724** total · **184** covered · **~10.7%** (lib/api + messages heavy; routes/shell ~0%) |
| Workspace runtime deps (web) | `@gosilex/types`, `@gosilex/ui` + TanStack + React + sonner + lucide |
| Workspace runtime deps (mcp) | `@gosilex/mcp` + `fastmcp` + `zod` |
| Package → app imports | **0** (direction correct) |
| App → package (web) | types (type-only error body), ui (components) |
| App → package (mcp) | mcp (handlers, allowlist, bearer env) |
| Product-share strings in example-web prod | **0** |
| Product `share_*` tools in mcp-example | **0** (guarded) |
| Routes (code tree) | login + app shell: `/`, `/notes`, `/keys`, `/settings`, `/design-system` |
| Centralized query keys | **1** (`meQueryKey`); health/notes ad hoc |
| Global QueryClient error handlers | **0** |
| Shared FE client package | **0** (`apiFetch` app-local) |
| Zod client form validators | **0** |
| i18n catalogs / keys | FR+EN · **~70** keys · default **fr** |
| Hardcoded EN UI islands | **≥2** (keys Bearer card, dashboard Email/Mailpit) |
| FastMCP host in `@gosilex/mcp` | **No** (app-owned) |
| MCP transports | stdio only |
| Issues by severity | **P0: 0** · **P1: 4** · **P2: 7** · **P3: 4** · positives separate |

### Dependency direction (P6)

```text
apps/example-web ──► @gosilex/ui ──► (Base UI / CVA / …)
                 ──► @gosilex/types          (ApiErrorBody only)
                 ──► TanStack Router/Query/Form
                 ──HTTP cookies──► apps/example-api (not a package import)

apps/mcp-example ──► @gosilex/mcp ──► @gosilex/auth ──► @gosilex/core ──► @gosilex/types
                 ──► fastmcp (direct)
                 ──► zod
                 ── (future) HTTP Bearer ──► example-api  [not wired for whoami verify]
```

### Composition scorecard

| Concern | Status | Notes |
|---------|--------|-------|
| TanStack Router | Shallow | Code-based tree OK; no loaders/search/beforeLoad; context unused |
| TanStack Query | Good baseline | All server IO; weak global policy + key factories |
| TanStack Form | Demo-only | Login + create note; no schema validators |
| API client | App-local OK for one SPA | Promote on second consumer |
| FE/BE boundary | **Clean** | No server packages in web; cookies not used by MCP |
| i18n | Type-safe simple | Not Paraglide; EN leaks in 2 cards |
| MCP ↔ kit | Handlers yes / host no | Exact-tool law too tight for multi-app |
| Package vs app | Aligned ADR-0001 | Demo domain in apps; kit UI/types/mcp composed |

## Recommendations

1. **P1 — Before `share-web` (or second SPA):** extract `ApiError` + `apiFetch` (+ optional `apiErrorToMessage`, query key helpers) into a thin package or `packages/ui` peer client module **only if** two call sites; else document “copy from example-web/lib/api.ts” in kit docs. Add `QueryClient` default `onError` (toast + 401 → invalidate `me` + navigate login). Map `ApiError.code` via i18n codes, not `String(e)`.

2. **P1 — i18n hygiene:** move keys.tsx Bearer blurb + dashboard Email/Mailpit strings into `messages/fr|en`. Treat hardcoded user-visible EN as a lint/banlist rule for `apps/example-web/src/routes/**` (except design-system demos if intentionally bilingual tokens).

3. **P1 — MCP package growth (with P3):** optional `createStdioKitServer({ name, version, tools })` wrapping FastMCP registration; keep **example-local** tool allowlist; drop package-level `assertExactKitTools` as law for all apps (retain banlist / `assertNoShareTools` or script-only). Wire whoami to HTTP `GET /api/me` with Bearer when demoing “same API as web”.

4. **P2 — Router composition:** either use `createRootRouteWithContext<{ queryClient }>` + `beforeLoad` auth redirects, or remove unused `context: { queryClient }` to avoid false sophistication. Prefer router auth over `queueMicrotask` gates for new routes.

5. **P2 — Query factories:** `healthQueryOptions`, `notesQueryOptions` next to `meQueryKey`; share `Note`/`Me` types via `@gosilex/types` or app-level `contracts.ts` generated later — not urgent until MCP/API clients share shapes.

6. **P2 — Forms:** add Zod (or TanStack Form standard schema) on login/notes as the template pattern when product forms start — prove double boundary in the example, not only API.

7. **P3 — Cleanup:** delete or quarantine `home.tsx` shim; split design-system by section if it gains more templates; add minimal route `errorComponent`; defer Paraglide/`@gosilex/i18n` until a second app needs message loading strategy (catalog approach is fine for kit size).

## Residual risks

| Risk | Why it matters | Mitigation |
|------|----------------|------------|
| N×M FE client/error fork | `share-web` copies `api.ts` then diverges (cookie flags, envelope parse) | Promote client on second app; contract tests on `ApiErrorBody` |
| Auth gate races | `queueMicrotask` + null render can flash or double-navigate under StrictMode | Router `beforeLoad` + redirect; test with RTL |
| MCP “verified” lie | Agents may trust `whoami` as auth proof | Keep `verified: false` explicit; document; add API-backed tool later |
| Exact kit tools lock-in | Product MCP cannot use package asserts without polluting kit | Soften package contract (P3 already flags) |
| EN islands under FR | Undermines GOSILEX default-FR claim in demos/screenshots | Message extraction + quick visual QA FR |
| Low route coverage | Architecture regressions in shell/auth hard to catch | Component tests for AuthGate/AdminGate + smoke e2e (Playwright later) |
| design-system mass | Inflates app LOC/coverage denominator; tempts product to monolith routes | Keep admin-only; don’t clone structure for domain features |

**Overall:** P6 examples **prove the kit consumer story** without product leakage. Close P1 gaps (FE error/client SSoT, copy i18n, MCP host composition) before treating them as the canonical product app skeleton.
