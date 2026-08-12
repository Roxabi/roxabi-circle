# Architecture — P7+P8 (example-web · mcp-example · scripts · tooling · CI)

**Domain:** Architecture  
**Partition:** P7 + P8  
**Scope:** `apps/example-web/**`, `apps/mcp-example/**`, `scripts/**`, `tooling/**`, `.github/workflows/**` (+ gate surface `tools/` when referenced by `validate:full`)  
**Date:** 2026-08-12  
**Primary axis (ADR-0001):** apps compose `@kit/*`; product domain stays out of packages; kit gates stay machine-priced.

## Summary

P7+P8 is **architecturally healthy for a kit dogfood slice**. `example-web` correctly centers TanStack Router + Query, uses `@kit/api-client` with **default `credentials: 'include'`** for cookie sessions, and keeps FR/EN catalogs app-owned with an `@kit/i18n` engine. `mcp-example` meets the thinness bar (**ping / whoami only**, catalogue SSOT + smoke). Gate scripts and CI largely **mirror AGENTS `validate:full`**: local Lefthook primary, CI job `validate-full` secondary, Secret scan + Merge-on-green as Free-org merge fabric. Residual risk is not stack wrongness but **demo god-routes**, a **zero-edit hole on `tools/`** (gate machinery), and incomplete extract dogfood assertions for web’s critical kit deps (`@kit/api-client`). No P0 architecture breaks found in this partition.

## Findings

| ID | Severity | File | Finding | Evidence | Recommendation |
|----|----------|------|---------|----------|----------------|
| F1 | P2 | `apps/example-web/src/routes/design-system.tsx`, `org-members.tsx`, `notes.tsx`, `tools/file_exemptions.txt` | Dogfood god-routes sit above the 300-line quality bar under tracked exemptions | Exemptions: design-system **1000**, org-members **600**, notes **520**, items **400**. design-system alone ~940 LOC of showcase UI inside `/admin/*`. | Split DS into section modules; peel members / invites / roles into route children or `components/org/*`. Prefer lowering exemption caps over raising them. |
| F2 | P2 | `config/zero-edit-zones.json` | **`tools/` is not zero-edit protected** while `scripts/` and `tooling/` are | `protected_prefixes` = `packages/`, `apps/example-*`, `scripts/`, `tooling/`, `config/` — **no `tools/`**. Yet `quality-gates:check` runs `tools/check_file_length.sh` + `tools/check_folder_size.sh` + exemptions. Product dual-edit could weaken file/folder gates without exception tracking. | Add `tools/` to `protected_prefixes` (or protect explicit gate files). Document product must not fork quality-gate machinery. |
| F3 | P2 | `apps/example-web/src/routes/*` vs `src/lib/{auth,modules}.ts` | Inconsistent data-layer pattern: only session/modules hooks live in `lib/`; CRUD pages inline `useQuery`/`useMutation` | `lib/auth.ts` + `lib/modules.ts` are reusable hooks; `notes`, `items`, `tasks`, `keys`, `org-members` each own fetch + invalidate inline. Product forks cannot copy a single “feature hooks” pattern. | For kit dogfood clarity: optional `lib/notes.ts` / `lib/tasks.ts` hooks (or document “page-local OK for demos”). Prefer one convention before product recipes cite the app. |
| F4 | P2 | `scripts/extract-dry-run.sh` | extract dogfood import asserts miss web’s primary HTTP kit surface | Required web hits: `@kit/ui`, `@kit/types`, `@kit/i18n` only. App **depends on** `@kit/api-client` (`src/lib/api.ts`) and uses `@kit/auth` helpers (`org-members.tsx`); those are not `search_q` required. Orphan scan is weaker (string presence anywhere). | Add `search_q '@kit/api-client' apps/example-web` (and optionally `@kit/auth`) to extract-dry-run. |
| F5 | P3 | `apps/example-web/src/routeTree.tsx`, `main.tsx` | Hand-maintained code-based route tree (no file-based Router plugin) | Single ~295-line `routeTree.tsx` registers auth /app /admin + legacy redirects. Works; every route is a dual edit (file + tree). | Acceptable for kit size. Revisit TanStack file routing only if product scale needs codegen; keep dual-shell `/app` vs `/admin` structure. |
| F6 | P3 | `apps/example-web/src/lib/api.ts` + `packages/api-client/src/index.ts` | Thin `apiFetch` re-wrap creates a **new client per call** (`createApiClient` each time) | `apiFetch` → `kitApiFetch(..., { baseUrl })` → `createApiClient(opts).apiFetch`. Credentials default `'include'` is correct and tested; no shared client / `onUnauthorized` at client layer (401 handled in Query caches in `main.tsx`). | Optional: module-level `createApiClient({ baseUrl: API_BASE })` singleton for clarity + future shared hooks. Keep 401 policy in Query layer (documented anti-loop). |
| F7 | P3 | `config/zero-edit-zones.json` `protected_files` | Zero-edit protects only a **subset** of kit workflows | Protected: `ci.yml`, `secret-scan.yml`, `merge-on-green.yml`, … Missing e.g. `semctx.yml`, `secret-scan-history.yml`, `close-linked-issues.yml`, `dependabot-alert-slack.yml`. | Either expand list to all kit-owned workflows **or** protect `.github/workflows/` except `product-*` via prefix rule + allowlist. |
| F8 | P3 | `package.json` / `lefthook.yml` / AGENTS narrative | Naming drift: “deny-upstream” in docs vs three different entrypoints | Pre-push: `scripts/deny-upstream-push.sh`. `validate:full`: `test:deny-upstream` (harness). No `deny-upstream` npm script. AGENTS/`docs/testing.md` say “deny-upstream” inside full bar. | Align wording: “deny-upstream (pre-push) + test:deny-upstream (in validate:full)”. Avoid implying the push guard runs inside `bun run validate:full`. |
| F9 | P3 | `apps/example-web/src/routes/home.tsx` | Legacy re-export still present | `HomePage` re-exports `DashboardPage` with deprecation comment. Dead surface for forks. | Delete when no imports remain (typecheck already guards). |
| F10 | P3 | `tools/` vs `scripts/` vs `tooling/` | Three ops trees with uneven extractability story | `scripts/` = gate scripts (protected). `tooling/release-gifs` = local media pipeline (protected, **not** in CI — correct). `tools/` = file/folder/license gates (unprotected — F2). Cognitive load for agents/consumers. | Document triad in AGENTS or product-consumer-contract: scripts = policy gates, tools = metrics gates, tooling = optional local media. Fix F2. |

### Positive architecture (no finding ID)

| Area | Assessment |
|------|------------|
| **TanStack stack** | React 19 + Router + Query v5 + Form + Table present and used on real routes (not deps-only). QueryClient global caches with 401 invalidation (not `removeQueries` loop). |
| **API credentials** | `@kit/api-client` defaults `credentials: 'include'`; example-web `api.test.ts` asserts include. Vite proxies `/api` + `/health` → Worker for same-origin cookies in dev; prod `VITE_API_URL` documented in deploy docs. |
| **i18n** | Engine `@kit/i18n`; catalogs app-owned `messages/fr.ts` (type SSoT) + `en.ts`; `messages.contract.test.ts` key parity + non-empty + no demo passwords; `i18n:check` → that test; covered under `test:coverage` for example-web. |
| **Shell / multi-tenant UX** | Dual layouts `/app/*` (AuthGate) and `/admin/*` (AuthGate + PlatformGate + platform role `beforeLoad`). Org context localStorage-scoped. Matches ADR-0003 dogfood story. |
| **mcp-example thinness** | `REGISTERED_TOOL_NAMES === ['ping','whoami']`; catalogue `registerAll` only; smoke asserts exact tool list + no `sk_` leak; extract requires `@kit/mcp`. **Meets AGENTS “ping/whoami only”.** |
| **validate:full coherence** | Root `package.json` `validate:full` chain matches Lefthook pre-push + CI `bun run validate:full`. Short `validate` is intentional subset (docs). |
| **CI structure** | `ci.yml` job name **`validate-full`** (merge-on-green regex). Secret scan secondary + kit `sk_` detector pass. Merge-on-green: `reviewed` + secret + CI, kit-ci App token, no PAT. Deploy workflow retired → CF Builds. e2e **out** of validate:full (documented local-only). |
| **tooling extractibility** | `tooling/release-gifs` is **not** `@kit/*`, not in CI, product imports via relative path — correct dual-mission boundary. |

## Metrics

| Metric | Value |
|--------|------:|
| Files / trees reviewed (primary) | example-web src (~routes 21, lib ~18, components ~10, messages 2), mcp-example (2 src + smoke), scripts (~25), tooling/release-gifs (8), workflows (10), tools gate surface, root package/lefthook/zero-edit |
| Issues | **P0=0 · P1=0 · P2=4 · P3=6** |
| mcp registered tools | **2** (`ping`, `whoami`) — exact allowlist |
| example-web route shells | public auth · `/app` · `/admin` · legacy redirects |
| Message catalog keys (approx.) | ~140+ keys; `fr.ts` ~562 LOC (exempt ≤620) |
| File-length exemptions (this partition) | design-system, org-members, notes, items, fr catalog |
| validate:full steps (package.json) | lint → typecheck → banlist → zod-major → ts-major → test:ts-major → extract → zero-edit → import-boundary → test:import-boundary → test:deny-upstream → debt:check → test:debt → agents-adr → env → test:coverage → license → quality-gates → build:kit → smoke:mcp |
| Coverage floor example-web | statements/lines **10%**, branches **20%**, functions **12%** (SPA expanding) |
| Zero-edit protects example-web / mcp-example / scripts / tooling | **yes** |
| Zero-edit protects `tools/` | **no** (F2) |

### Notable hotspots

1. `apps/example-web/src/routes/design-system.tsx` — largest demo surface; admin-gated showcase.  
2. `apps/example-web/src/routes/org-members.tsx` — multi-concern org admin (members + invites + roles + grants).  
3. `config/zero-edit-zones.json` vs `tools/**` — gate integrity for product forks.  
4. `scripts/extract-dry-run.sh` web import SSOT incomplete for `@kit/api-client`.

## Recommendations

1. **P2 — Close zero-edit on gate machinery:** add `tools/` to `protected_prefixes` (or explicit file list for length/folder/license checkers + exemptions). Treat quality-gate scripts like `scripts/`.  
2. **P2 — Shrink dogfood god-routes:** split design-system sections; extract org-members panels; re-check exemptions after splits (lower caps).  
3. **P2 — Harden extract dogfood for SPA kernel deps:** require `@kit/api-client` (and consider `@kit/auth`) under `apps/example-web` in `extract-dry-run.sh`.  
4. **P2 — Document or unify data hooks:** either lift repeated Query keys into `lib/*` for notes/items/tasks/keys, or write a short recipe “page-local mutations OK; only shared session/modules in lib”.  
5. **P3 — Doc/ops hygiene:** fix deny-upstream naming; expand workflow protection list; optional `createApiClient` singleton; drop `home.tsx` re-export.  
6. **Keep (do not regress):** mcp thinness + smoke SSOT; credentials-include default; dual-shell beforeLoad gates; CI job name `validate-full`; secret-scan dual pass; tooling/release-gifs **out** of `validate:full`.

## Gate map (coherence checklist)

| AGENTS / docs claim | Local primary | CI | In `validate:full`? |
|---------------------|---------------|-----|---------------------|
| lint / typecheck | pre-push via full | `ci.yml` | yes |
| banlist / zod-major / ts-major / test:ts-major | full | full | yes |
| extract-dry-run / zero-edit | full | full (+ kit-baseline for product trees) | yes |
| import-boundary + self-test | full | full | yes |
| deny-upstream **push** | **pre-push only** | n/a | **no** (by design) |
| deny-upstream **harness** | full (`test:deny-upstream`) | full | yes |
| debt / agents-adr / env / coverage / license / quality-gates | full | full | yes |
| build:kit / smoke:mcp | full | full | yes |
| secret scan (trufflehog) | pre-commit + pre-push script | `secret-scan.yml` (+ weekly history) | **no** (parallel gate) |
| e2e Playwright | local scripts only | **not** in CI | **no** (documented) |
| release-gifs tooling | local app scripts | no | **no** (documented) |
| semctx | n/a | `semctx.yml` (not merge-required) | **no** |

## Scope notes

- Did **not** re-run live `validate:full` (read-only architecture review). Wave 0 machine baseline already green for import-boundary / banlist / extract.  
- Security of cookie/CORS cross-origin prod is product deploy concern (`VITE_API_URL` + BA cookie domain); architecture pattern is correct for same-origin proxy dogfood.  
- Product domain strings in this slice: not re-scanned beyond architecture structure; banlist includes `mcp-example` and `example-web`.
