# Tech Debt — B apps / tooling

**Date:** 2026-07-12  
**Partition:** `apps/**` · `scripts/**` · `tools/**` · `.github/**` · root configs (`package.json`, `turbo.jsonc`, `biome.json`, `lefthook.yml`, `docker-compose.yml`, `tsconfig.json`, `commitlint.config.cjs`, `.env.example`, `.license-policy.json`)  
**Domain:** Tech Debt (TODO/FIXME, interim patterns, incomplete demos, CI debt, AGENTS overclaims vs reality, magic config)  
**Out of scope:** package internals (see `A-packages.md`); OWASP deep-dive → security; god-file LOC → code-smells; coverage floors policy → test-quality  
**Refs:** ADR-0002, AGENTS.md checklist + stack tables, `docs/testing.md`, ARCH-P07, dual-mission kit-first

## Summary

Scope B is a **working kit demo monorepo** with **almost no classic `TODO`/`FIXME`/`HACK` markers** in apps/scripts/tools. Debt is **structural interim + process**, not abandoned half-patches: (1) **apps copy kit incompleteness** (HMAC dual-auth, SMTP-in-app, MCP whoami presence-only, FE-only admin RBAC, hand-rolled i18n); (2) **CI/local gate truthfulness** (double test runs, structural extract, soft Lefthook, CI step drift, App merge credentials open); (3) **AGENTS / PR template overclaim** vs shipped names (`requireSession`/`requireApiKey` vs `requireAuth`, Zod 4 vs ^3.25, Better Auth / Paraglide / HSTS checklist lag). Incomplete demos are **intentional but under-labeled** (email best-effort SMTP, e2e outside merge gate, build no-ops). Overall: **healthy dual-mission scaffold**, **medium gate + honesty debt** before product `share-*` multiplies templates.

## Findings

| ID | Severity | File | Finding | Evidence |
|----|----------|------|---------|----------|
| TD-B-001 | P1 | `package.json` `validate` / `validate:full` · `scripts/test-coverage.sh` · `lefthook.yml` | **Primary pre-push gate runs the full unit suite twice.** `validate` → `turbo test`; `validate:full` then `test:coverage` re-invokes Vitest per package. Lefthook pre-push only runs `validate:full`. Wall-clock tax → temptation to `LEFTHOOK=0` / skip (AGENTS forbids). | `package.json:27–28`; `test-coverage.sh:23` `bunx vitest run --coverage`; `lefthook.yml:27–29`. Cross-ref ARCH-P7-001. |
| TD-B-002 | P1 | `scripts/extract-dry-run.sh` · AGENTS “Critère extractible” · `docs/testing.md` CP-EXTRACT | **Extract gate is structural / import / banlist — not “drop share-* → suite green.”** Checks required files, nested banlist, example `@gosilex/*` imports, ADR presence. Does **not** remove product apps, re-run lint/typecheck/test, or prove a standalone kit install. Modes `kit`/`mono` only differ by messaging; only `strict` fails on `apps/share-*`. False confidence when product lands. | `extract-dry-run.sh:28–123`; AGENTS extract criterion; default `EXTRACT_MODE:-kit`. Cross-ref ARCH-P7-002 / 007. |
| TD-B-003 | P1 | `apps/example-api/**` · ADR-0002 · AGENTS §D | **App auth spine is interim HMAC + imperative dual-auth; not Better Auth / split guards.** Live path: `services/auth.ts` → `signSession`/`verifySession` + `resolveAuth` (Bearer then cookie); middleware is single `requireAuth` called **per handler**, not `requireSession` / `requireApiKey` packages. Second app will re-copy resolver + cookie/secret wiring. | `services/auth.ts:88–109`; `middleware/require-auth.ts:9–21`; zero `better-auth` dep in apps. ADR-0002 accepted interim. |
| TD-B-004 | P1 | `apps/example-api/src/seed/demo-data.ts` · `routes/me.ts` · migrations | **RBAC is hardcoded seed map, not persisted.** `roleForSubject` looks up `SEED_USERS` in process memory; `demo_users` table has **no `role` column**. FE `AdminGate` trusts `/api/me.role` from this map. Any non-seed subject → `user`. Product template risk if copied as “roles system.” | `demo-data.ts:64–68`; `migrations/0001_init.sql:17–22` (email/password_hash/created_at only); `me.ts:16`. |
| TD-B-005 | P1 | `apps/mcp-example/src/index.ts` · package whoami | **MCP demo `whoami` = env key *presence*, not API verification.** Comment + tool description honest; still ships as kit “auth” surface that product teams may over-trust. `stdio-smoke` injects dummy `API_KEY` and only asserts tool names + no error. | `index.ts:1–5`, `46–47`; smoke `API_KEY: …sk_stdio_smoke…`; package `handleWhoami` verified:false (A-packages TD-A-009). |
| TD-B-006 | P1 | AGENTS.md stack/package map · apps reality · README | **AGENTS still overclaims vs living apps (onboarding risk).** Stack: “Better Auth cookies”, Zod **4**, guards `requireSession`/`requireApiKey`, B3 “Better Auth Hono”, i18n **Paraglide**, security headers **HSTS**. Reality: HMAC session, **Zod ^3.25.0**, combined `requireAuth`, hand-rolled `messages/{fr,en}.ts` + `t()`, headers without HSTS. README package map is closer to truth; AGENTS lag is the debt. | AGENTS §A Zod 4; §D Better Auth + guards; §G Paraglide; §I HSTS; `example-api/package.json` `"zod": "^3.25.0"`; `example-web/src/lib/i18n.ts`; `security-headers.ts` (4 headers, no HSTS). |
| TD-B-007 | P2 | `apps/example-api/src/services/email.ts` · `@gosilex/email` | **Email demo = incomplete SMTP dialogue in the app, package is template-only.** Minimal EHLO/MAIL/DATA without reading server responses; no `finally` on socket; silent fallback to `transport: 'log'` (always `ok: true`). Mailpit works only when Workers `connect()` exists. Second mailer app will fork this dialogue. | `email.ts:27–77`; package `buildDemoEmailText` only. Cross-ref TD-A-008, async SMTP leak. |
| TD-B-008 | P2 | `apps/example-api/src/routes/{me,notes,demo}.ts` · `middleware/require-auth.ts` | **Auth is imperative per-handler, not mounted middleware.** Six protected handlers must each `await requireAuth(c)`. Omission fails **open** — classic template debt for agent/human copy-paste of new routes. | No `route.use` for auth; me/notes/demo only. Cross-ref ARCH-P05-008 / SEC-P05-002. |
| TD-B-009 | P2 | `apps/example-api/src/services/notes.ts` | **Multi-store notes create is non-atomic (D1 then optional R2).** Create inserts D1 first; attachment put after. Delete tries R2 then D1, swallows missing object. Kit demo OK; product share must not inherit “best-effort multi-store” without documented staging. | `createNote` L27–40 order; `removeNote` L60–64 empty catch. |
| TD-B-010 | P2 | `.github/workflows/ci.yml` vs `package.json` `validate:full` | **CI reimplements gate steps; does not call `validate:full`.** Same logical set (lint, typecheck, env, test, coverage, license, banlist, extract) but **different order** (env earlier; banlist/extract last). Future script change without CI edit → local primary ≠ guardrail. | `ci.yml:28–49` discrete steps; root `validate:full` order differs. Cross-ref ARCH-P7-004. |
| TD-B-011 | P2 | `package.json` `prepare` · `lefthook.yml` | **`prepare: lefthook install \|\| true` soft-fails.** Fresh clone / CI-like installs can skip hooks while doctrine says pre-push is the **primary** gate. Free private has no branch protection → process fails open. | `package.json:29`; AGENTS Lefthook non-negotiable. Cross-ref ARCH-P7-009. |
| TD-B-012 | P2 | `.github/workflows/*` · AGENTS checklist | **Merge-on-green depends on uninstalled GitHub App credentials; branch protection impossible on Free private.** Workflow is well-designed (fail-closed empty checks, requires TruffleHog + CI job name) but AGENTS still lists App install + branch protection as open. Process-only merge until secrets exist; humans can merge without workflow. | `merge-on-green.yml:56–61` App token; AGENTS “Créer/installer App…” unchecked; Free private 403 branch protection. |
| TD-B-013 | P2 | `.github/workflows/ci.yml` vs `secret-scan.yml` / `merge-on-green.yml` | **Action pin hygiene inconsistent.** Secret-scan + merge-on-green pin SHAs; main CI uses floating tags `actions/checkout@v4`, `oven-sh/setup-bun@v2`, `actions/upload-artifact@v4`. Supply-chain / reproducibility weaker on the quality job that burns most minutes. | `ci.yml:19–21, 51–53` tags; other workflows SHA pins. ARCH-P7-010. |
| TD-B-014 | P2 | `scripts/*` · `tools/licenseChecker.ts` | **Architecture gates have zero automated tests.** Pure functions in license checker (~479 LOC) + banlist patterns + env key inventory + extract required list: regressions only when a human runs `validate`. High leverage for table tests. | Grep tests for licenseChecker / check-banned / extract / check-env-sync → **none**. ARCH-P7-008. |
| TD-B-015 | P2 | `apps/example-api/package.json` · `mcp-example/package.json` · turbo `build` | **Build scripts are no-ops or silent skip.** example-api: `wrangler deploy --dry-run … 2>/dev/null \|\| echo build-skip` (hides dry-run failures); mcp-example: `"build": "echo ok"`. `turbo build` reports green without proving Workers/assets emit. | package.json build fields; turbo `build` dependsOn `^build`. |
| TD-B-016 | P2 | `apps/example-web` i18n · AGENTS §G | **i18n is hand-rolled FR/EN catalogs, not Paraglide; incomplete product copy discipline.** Working `t(locale)` + contract test forbids TODO-only strings; default FR. Keys page Bearer card + much of design-system chrome still hard English. No path `/fr`/`/en`, no `@gosilex/i18n`. Acceptable interim; AGENTS still prefers Paraglide. | `lib/i18n.ts`; `messages/{fr,en}.ts`; `keys.tsx:77–88` EN literals; messages.contract.test TODOISH. |
| TD-B-017 | P2 | `apps/example-api/src/middleware/security-headers.ts` · AGENTS §I | **Security headers incomplete vs AGENTS S0/M0 claim.** Present: nosniff, XFO DENY, Referrer-Policy no-referrer, XSS-Protection 0. **Missing:** HSTS (env-gated), CSP, Permissions-Policy. Checklist item still open (honest) but stack table lists HSTS as target without “when”. | `security-headers.ts:3–8`; AGENTS Security headers row. |
| TD-B-018 | P2 | `apps/example-web/scripts/e2e-design-system.mjs` · root scripts · CI | **Browser smoke exists but is outside merge / validate:full.** Needs live API+web + Chrome at `/usr/bin/google-chrome`; uses `playwright-core` only. Docs phase B6 intentional — residual: kit “e2e green” is marketing-only unless developers run it. | root `test:e2e:design-system`; not in `validate`/`ci.yml`; hardcoded `CHROME_PATH` default. |
| TD-B-019 | P2 | `apps/example-web/src/routes/login.tsx` · `seed/demo-data.ts` | **Demo credentials prefilled in login form (template UX debt).** Defaults `demo@gosilex.local` / `demo-password-change-me` — great DX, bad product copy-paste. Documented in README; still a footgun if share-web clones login. | `login.tsx:35–38` defaultValues; seed SSoT passwords. |
| TD-B-020 | P2 | `package.json` validate · banlist · extract | **Banlist executes twice per `validate`.** Standalone `banlist` then extract re-invokes `check-banned-strings.sh`. Correctness OK; noise + small wall-clock waste; double failure reports. | `package.json:27`; `extract-dry-run.sh:71`. ARCH-P7-003. |
| TD-B-021 | P3 | `apps/example-web/src/routes/home.tsx` · `services/auth.ts` | **Deprecated compatibility shims.** `home.tsx` re-exports Dashboard with `@deprecated` but `routeTree` imports dashboard only — **dead**. `ensureDemoUser` alias to `ensureDemoUsers` kept for call sites. | `home.tsx:1–2`; `auth.ts:37–40`. |
| TD-B-022 | P3 | `apps/**` magic literals | **Scattered magic config without named constants.** Session TTL `60*60*24*7` in login; note body/attachment max 10_000 / 50_000; Query `staleTime: 10_000`; DEFAULT_CORS / DEV_SESSION_FALLBACK (named, good); e2e Chrome path; SMTP port default 1025. Prefer shared kit constants or env-schema bounds. | `auth.ts:61`; `notes.ts:12–13`; `main.tsx:14`; `session-env.ts:4–5`; e2e script L12. |
| TD-B-023 | P3 | `turbo.jsonc` · root `tsconfig.json` · AGENTS §K | **Config hygiene drift.** Turbo declares dead `lint` task (root uses Biome only); `test:coverage` turbo task unused (bash sequential runner). Root `tsconfig.json` orphaned (workspaces extend `packages/config/tsconfig.base.json`). AGENTS sketches `tooling/`; repo uses `scripts/` + `tools/`. | `turbo.jsonc:14–23`; root tsconfig no extends from apps; ARCH-P7-005/006/015. |
| TD-B-024 | P3 | `.github/PULL_REQUEST_TEMPLATE.md` | **PR template mixes kit reality with future product checklist.** Mentions `requireSession`/`requireApiKey` (not code names), `private_key` 404, org upload, zip-slip, presign — correct for share later, **noise for kit PRs** (checkbox theater risk). | PR template security section L39–49. |
| TD-B-025 | P3 | `scripts/check-banned-strings.sh` · extract required list | **Banlist/extract coverage gaps.** Banlist excludes `*.test.ts`; patterns are narrow (`private_key_product` not `private_key`; product rename risk). Extract required list omits `packages/config/package.json` (only tsconfig extend string). | banlist L16–24, L35; extract L28–44. ARCH-P7-014/017. |
| TD-B-026 | P3 | `docker-compose.yml` | **Mailpit `image:latest` + no healthcheck.** Fine for single-service local; pin digest/tag for reproducible DX; growth path not composed. | `docker-compose.yml:1–10`. |
| TD-B-027 | P3 | `apps/example-web` / `example-api` KitRole | **`KitRole` type duplicated FE/BE without shared types package export.** FE `lib/auth.ts` and BE `seed/demo-data.ts` both define `'admin' \| 'user'`. Drift risk when third role appears. | Two independent type aliases. |
| TD-B-028 | P3 | `apps/**` · `scripts/**` TODO scan | **Zero classic TODO/FIXME/HACK in apps production sources; debt is comment/ADR form.** `messages.contract.test` bans TODO-only i18n values (positive). Risk: invisible backlog without issue IDs on “best-effort”, “fallback log”, “not verified”. | `rg TODO\|FIXME\|HACK` apps → only test stubs / UI placeholders / `@deprecated`. |
| TD-B-029 | P3 | AGENTS S0 checklist vs scripts | **Partial honesty already (good); residual checkbox lag.** Checked: PR template, secret scan, merge-on-green, lefthook, label. Open: Bun/Turbo (actually done), Biome+CI (done), AppError (done), Vitest (done), D1 migrations (done), `.dev.vars.example` (done), security headers (partial). Checklist under-claims shipping kit → agents re-scaffold. | AGENTS quality checklist S0 section vs tree. |
| TD-B-030 | P3 | `.github` · AGENTS optional CODEOWNERS | **No CODEOWNERS** for auth/mcp/migrations. Free private may not enforce; process-only review today. | Grep CODEOWNERS → AGENTS mention only. |

### Non-findings (healthy)

| Area | Assessment |
|------|------------|
| Classic TODO/FIXME density | **Near-zero** in apps/scripts/tools sources — no abandoned marker litter |
| Dual-mission tree | **No `apps/share-*`** yet; examples only; banlist scoped to packages + examples |
| Local-first doctrine | **Documented and wired** — Lefthook pre-push = `validate:full`; CI secondary; PR template requires local green |
| Gate surface | **Substantially complete** for kit exit: lint, typecheck, test, coverage floors, banlist, extract, env:check, license, secret-scan |
| Env inventory | **env.schema.ts ↔ .dev.vars.example** enforced by `check-env-sync.ts` (DX, not runtime secret validation) |
| Demo seed SSoT | **`seed/demo-data.ts`** single source for users/notes/passwords + README table |
| Route split | **`createApp` is thin** — routes extracted (auth/me/notes/demo/health); not a god `app.ts` |
| MCP allowlist discipline | **Triple-checked** (REGISTERED vs MCP_TOOL_NAMES + assertExactKitTools + smoke tools/list exact) |
| Merge-on-green design | **Fail-closed** empty checks; requires secret-scan + CI job name; App token not PAT |
| Secret scan | **TruffleHog verified-only**, full history, SHA-pinned actions |
| Docker email sink | **Mailpit present** for B5 local path (matches AGENTS H2 sketch) |
| i18n contract test | **Forbids empty / TODO-only message values** — good hygiene |

### AGENTS claims vs Scope B reality (scorecard)

| Claim (AGENTS / checklist) | Reality in apps/tooling | Debt |
|----------------------------|-------------------------|------|
| Better Auth sessions | HMAC cookie via `@gosilex/auth` in example-api | **P1 doc + interim** (ADR-0002) |
| Guards `requireSession` / `requireApiKey` | Single `requireAuth` dual-path in app | **P1 naming + package gap** |
| Zod 4 | Zod **^3.25.0** in example-api + mcp-example | **P2 pin lag** |
| i18n Paraglide | Hand-rolled FR/EN TS catalogs in example-web | **P2 interim** (works) |
| HSTS security headers S0 | Partial headers; no HSTS/CSP | **P2 incomplete** |
| Extract dry-run = green after drop product | Structural checks only | **P1 overclaim** |
| validate local = CI | Same surface, different orchestration | **P2 drift risk** |
| Lefthook primary gate | Soft prepare install | **P2 process hole** |
| gosilex-ci App merge | Workflow ready; credentials checklist open | **P2 ops** |
| Playwright e2e | Optional design-system smoke, not in CI | **P2 phased (honest in testing.md)** |
| FastMCP mcp-example ping/whoami | Shipped; whoami not verified | **P1 incomplete auth demo** |
| Mailpit compose | Shipped | OK |
| Bun + Turbo + Biome monorepo | Shipped | OK (checklist lag P3) |
| Product share apps | Absent (correct for kit-first) | OK |

### Incomplete demos map

| Demo surface | Complete enough? | Residual debt |
|--------------|------------------|---------------|
| Health + requestId | Yes | — |
| Password login + cookie | Yes (HMAC interim) | Better Auth swap |
| API key mint + Bearer | Yes | Revoke UX / list keys |
| Notes CRUD + R2 attach | Yes for demo | Multi-store atomicity |
| Demo email | Partial | SMTP dialogue + package transport |
| Design system admin | Yes FE-only | Client gate only; no server “admin API” |
| MCP stdio | Partial | whoami presence only |
| E2E overlays | Partial | Manual, Chrome path, not gated |
| Extract kit | Structural only | Full green-after-extract |

## Metrics

| Metric | Value |
|--------|------:|
| Apps (deployables) | **3** (example-api, example-web, mcp-example) |
| Product apps | **0** (`share-*` absent) |
| Scripts under `scripts/` | **5** |
| Tools under `tools/` | **1** (`licenseChecker.ts`) |
| GitHub workflows | **3** (CI, secret-scan, merge-on-green) |
| Root quality-related npm scripts | **~16** |
| `TODO`/`FIXME`/`HACK` in apps src (excl. tests/stubs) | **0** |
| `@deprecated` markers (apps) | **2** (home shim, ensureDemoUser) |
| Imperative `requireAuth` call sites | **6** protected handlers |
| Auth as mounted Hono middleware | **0** |
| Zod major (apps) | **3** (AGENTS claims 4) |
| i18n engine | **hand-rolled** (not Paraglide) |
| Security headers set | **4** (no HSTS/CSP) |
| Automated tests for scripts/tools | **0** |
| CI invokes `validate:full` | **No** (hand steps) |
| Pre-push double-runs unit suite | **Yes** |
| Extract modes that fail on product dirs | **1** (`strict` only) |
| Issues total | **30** |
| P0 | **0** |
| P1 | **6** |
| P2 | **14** |
| P3 | **10** |

**Severity mix:** No P0 extract-blocker or secret-in-repo debt in this partition. P1 cluster is **gate truthfulness** (double tests, structural extract) + **auth/MCP interim demos** + **AGENTS honesty**. P2 is CI/process/incomplete demos. P3 is hygiene and checklist lag.

**Subjective Scope B tech-debt score (partition):** **~58/100**  
(100 = pristine / AGENTS claims match code and gates are truthful + tested). Dragged by double validate cost, extract marketing, AGENTS stack lag, untested gates, soft hooks; lifted by zero TODO litter, coherent local-first design, banlist/env/license present, thin routed example-api, honest ADR-0002 for session.

## Recommendations

1. **P1 — Make primary gate single-pass (TD-B-001)**  
   - `validate:full` should run coverage **instead of** bare `turbo test`, or make `test:coverage` the only test stage with a fast path flag.  
   - Target: pre-push wall-clock ≤ one suite + floors.

2. **P1 — Either upgrade extract or rewrite CP-EXTRACT / AGENTS (TD-B-002)**  
   - Prefer honest docs short-term: “structural + banlist + import presence.”  
   - Medium: temporary workspace without product apps + `turbo typecheck test` (or CI job `extract-suite`).  
   - Differentiate `kit` vs `mono` meaningfully or delete the fake matrix.

3. **P1 — Align AGENTS stack tables with ADR-0002 + shipped apps (TD-B-006)**  
   - Kit now: HMAC session, combined `requireAuth`, Zod 3 (or bump to 4 intentionally), i18n “TS catalogs (Paraglide later)”, headers “baseline; HSTS env-gated later”.  
   - Keep Better Auth / Paraglide / full ShipFast headers under **When: product / P1** columns only.

4. **P1 — Auth template hardening before share-api (TD-B-003, TD-B-008)**  
   - Mount Hono middleware on protected route trees (fail-closed default).  
   - Document role system as **demo map only**; if product needs RBAC, persist role (or drop FE admin pattern until then).  
   - Prefer SessionPort from package work (A-packages) before cloning resolveAuth into share.

5. **P1 — MCP honesty + optional verify hook (TD-B-005)**  
   - Keep `verified: false` until real Bearer→API check; name tool “env key presence”.  
   - Do not expand tool surface until allowlist policy is product-aware (see TD-A-010).

6. **P2 — CI = one SSoT script (TD-B-010)**  
   - Job step: `bun run validate:full` (+ artifact upload of `coverage/`) **or** composite action generated from same list.  
   - Pin CI actions to SHAs like secret-scan (TD-B-013).

7. **P2 — Hard-fail Lefthook install on interactive clones (TD-B-011)**  
   - Keep `|| true` only if documented for environments without git hooks; prefer `lefthook install` in README first-run and CI `lefthook version` assertion optional.

8. **P2 — Email + notes multi-store before second consumer (TD-B-007, TD-B-009)**  
   - Promote transport to `@gosilex/email` or mark app SMTP “example only, do not copy.”  
   - Document notes create ordering; product share needs staging/commit pattern.

9. **P2 — Cheap completeness (TD-B-015–019)**  
   - Fail `wrangler deploy --dry-run` visibly or drop turbo build from green path until real.  
   - HSTS when `ENVIRONMENT` production/staging.  
   - Login form: empty defaults in non-dev builds or “demo only” watermark.  
   - Table-test license + banlist patterns.

10. **P3 — Hygiene batch**  
    - Delete `home.tsx` / collapse `ensureDemoUser`.  
    - Name session TTL + note max sizes.  
    - Split PR template kit vs product sections.  
    - Refresh S0 checklist boxes to match shipped Bun/Turbo/Biome/AppError.  
    - Pin Mailpit image tag.

## Residual risks / not covered

| Risk | Why residual | Owner domain / when |
|------|--------------|---------------------|
| SESSION_SECRET / ENVIRONMENT deploy footgun | Fail-closed exists; ops mis-set ENVIRONMENT=development on public Worker | Security + deploy runbook |
| CSRF beyond SameSite + CORS | No Origin mutation middleware in example-api | Security |
| AdminGate only client-side | Design-system has no privileged server data | OK for demo; product ACL later |
| Free private merge process fail-open | Humans can merge without `reviewed` if App broken | Ops / org upgrade |
| Coverage floor numbers | Enforced in vitest configs; not re-scored here | Test quality T3 |
| package tech debt (BA, email package, storage presign) | Call sites in apps; root cause in packages | `A-packages.md` |
| God design-system route size | Tech debt of maintainability | Code smells P6 |
| `apiFetch<T>` unchecked cast | Type safety | type-safety P04-P06 |
| License policy completeness | Walker untested; UNKNOWN = warn | CP-LICENSE / legal |
| Secret scan false negatives | `--only-verified` by design | Security |

**Bottom line:** Scope B debt is **gate economics + documentation honesty + incomplete-but-working demos**, not TODO graveyards. Fix **single-pass validate**, **extract claim**, and **AGENTS ↔ ADR/apps alignment** first; then **middleware auth**, **MCP/email template honesty**, and **CI SSoT**. Product `share-*` should not land until those templates are not copy-paste landmines.
