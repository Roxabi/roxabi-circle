# Tech Debt Scan

**Repo:** `roxabi-boilerplate-cf`  
**Date:** 2026-08-12  
**Domain:** Tech Debt  
**Scope:** `packages/**`, `apps/**`, `scripts/**` (debt:check machine scope = `apps|packages` only)  
**Method:** grep sample + `debt:check` policy read + call-site checks for `@deprecated` / dual-path residue  
**SSoT policy:** [`docs/debt-tracking.md`](../../../docs/debt-tracking.md) · CP-DEBT

## Summary

The kit is **clean of bare TODO/FIXME/HACK** in source, and suppression volume is **tiny** (4 `biome-ignore` lines under `apps|packages`, 0 `@ts-expect-error` / `@ts-ignore`). Residual debt is almost all **API residue after ADR-0002 BA-only / ADR-0003 multi-tenant**: HMAC-era `SessionPort` surface, dual password KDF, demo `KitRole` / `isAdmin` / `AdminGate`, free R2 helpers without base-prefix isolation, and a few dead `@deprecated` aliases with no product call sites.

Machine gate **`bun run debt:check`** is green-exit with **warn**: **1 untagged** `biome-ignore` (`input-group.tsx`). All tagged DEBT slugs are **unpinned** (no `#N`) — fine under 6-month file-age expiry, but flip-to-fail would still only see the untagged line today. **No P0/P1** from this scan; findings are **P2/P3** hygiene and footgun surfaces.

| Category | Count (approx.) | Worst severity |
|----------|-----------------|----------------|
| Bare TODO/FIXME/HACK/XXX in packages/apps src | **0** | — |
| biome-ignore in apps\|packages | **4** (3 tagged DEBT · 1 untagged) | P2 untagged |
| @ts-expect-error / @ts-ignore in apps\|packages | **0** | — |
| @deprecated public surfaces | **~10** symbols | P2 residual dual-path |
| debt:check untagged warnings | **1** | P2 |
| debt:check stale (expiry) | **0** (no pin; files recent) | — |
| Security-path magic numbers (sampled) | few; mostly named constants | P3 |
| File-length exemptions (tracked god files) | **9** paths | P3 |

## debt:check (machine)

| Gate | Default | Observed (Wave 0 + re-grep 2026-08-12) |
|------|---------|----------------------------------------|
| Untagged suppressions | `DEBT_UNTAGGED_MODE=warn` | **1** — `packages/ui/src/components/ui/input-group.tsx` L49 |
| Expiry / stale DEBT | `DEBT_EXPIRY_MODE=warn`, 6 months | **0** reported |
| Exit | 0 on warn | **does not block** `validate:full` until `DEBT_*_MODE=fail` |

### Suppression inventory (apps + packages)

| File | Marker | DEBT slug | Pin | Notes |
|------|--------|-----------|-----|-------|
| `packages/ui/.../input-group.tsx` | `biome-ignore lint/a11y/useKeyWithClickEvents` | **missing** | — | **Only untagged** — debt:check warn |
| `packages/ui/.../chart.tsx` | `biome-ignore lint/security/noDangerouslySetInnerHtml` | `chart-scoped-css` | none | scoped CSS vars; security-audit also notes color injection if ever UGC |
| `packages/mcp/src/catalogue.ts` | `biome-ignore noExplicitAny` (execute) | `fastmcp-zod-boundary` | none | FastMCP + Zod boundary |
| `packages/mcp/src/catalogue.ts` | `biome-ignore noExplicitAny` (addTool) | `fastmcp-duck-type` | none | duck-typed server surface |

**Out of debt:check scope (by design):**

| File | Marker | Notes |
|------|--------|-------|
| `scripts/check-debt.ts` | 4× `biome-ignore noUndeclaredEnvVars` | gate script itself |
| `scripts/check-import-boundaries.ts` | 1× same | gate script |
| `packages/db/src/index.ts` | `eslint-disable-next-line @typescript-eslint/no-explicit-any` | **orphan eslint-disable** (Biome monorepo; no eslint config) + `as never` on D1 |

## Findings

| ID | Severity | File | Finding | Evidence | Recommendation |
|----|----------|------|---------|----------|----------------|
| F1 | **P2** | `packages/ui/src/components/ui/input-group.tsx` | **Untagged biome-ignore** — only debt:check warning | L49: a11y click-without-key; reason present, **no `— DEBT:<slug>`** | Append `— DEBT:input-group-addon-click` (optional `#N`) **or** restructure addon focus with keyboard-safe handler; then `DEBT_UNTAGGED_MODE=fail` is one-line clean |
| F2 | **P2** | `packages/auth/src/session-port.ts`, `better-auth-port.ts`, `require-auth.ts` | **HMAC-era SessionPort still public after BA-only** | `SessionPort` still requires `sign`/`verify`; BA adapter `sign` **throws**, `verify` always **null**. `ResolveSessionInput.secret` + `DualAuthPorts.secret` unused by BA path. ADR-0002 retired HMAC | Narrow port to `resolveSession` + cookie helpers; drop `sign`/`verify`/`secret` (or `@deprecated` one release + ban). Update tests that assert throw-on-sign |
| F3 | **P2** | `packages/auth/src/keys.ts` + `apps/example-api/src/seed/seed-db.ts` | **Dual password KDF — kit PBKDF2 vs Better Auth crypto** | Kit exports `hashPassword`/`verifyPassword` (PBKDF2 100k/600k). Login is BA-only. Seed writes **both** `demo_users.password_hash` via `@kit/auth` **and** BA account via `better-auth/crypto`. `verifyPassword` app call sites: **none** (tests only) | Demote kit password helpers to “demo table only” or un-export; stop dual-seed once `demo_users` unused for auth; document BA as sole live credential write |
| F4 | **P2** | `apps/example-api` + `apps/example-web` KitRole surfaces | **Deprecated kit-demo role still on live `/api/me` contract** | `me.ts` still returns `role: roleForSubject(subject)` marked `@deprecated`; web `MeResponse.role` + `isAdmin()` gate on KitRole **not** platformRole. BO correctly uses `PlatformGate` / `hasPlatformRole` | Remove `role` from me response after one consumer migration; delete `isAdmin` / `AdminGate` if zero imports (grep: only definitions); keep `platformRole` + org roles as SoT |
| F5 | **P2** | `packages/storage/src/index.ts` | **Free R2 helpers lack base-prefix isolation** | `putObject`/`getObject`/`deleteObject` only `assertObjectKey` (no `..`); no tenant prefix. Comments prefer `StorageClient`; dogfood uses **only** client | Mark free helpers `@deprecated` / tests-only; keep barrel export optional; ban product copy-paste via README + optional lint later |
| F6 | **P2** | `apps/example-api/src/lib/session-env.ts` | **SESSION_SECRET residual after BA-only** | `getSecret` still validates `SESSION_SECRET` with weak-denylist + dev fallback; comment says “legacy cookie utils”. Live dual-auth injects BA port only (`require-auth.ts` — **no** `secret`). Env schema still documents SESSION_SECRET | Drop or demote `SESSION_SECRET` once no helper needs it; require only `BETTER_AUTH_SECRET`; shrink WEAK set to BA secret |
| F7 | **P3** | `packages/mcp/src/index.ts`, `agentWire.ts` | **Deprecated MCP aliases kept for migrate** | `@deprecated`: `assertExactKitTools`, `assertNoShareTools`, `MCP_TOOL_NAMES`. Call sites: **package tests only** | Delete aliases after one kit minor; tests use `assertToolsMatchAllowlist` + `DEFAULT_EXAMPLE_TOOL_NAMES` only |
| F8 | **P3** | `apps/example-api/src/repos/keys.ts`, `services/auth.ts` | **Dead @deprecated wrappers** | `findApiKeyByHash` — **definition only**, no callers. `ensureDemoUser` → `ensureDemoUsers` — only self + comment in demo-data | Delete both; update any docs/scripts that name the singular |
| F9 | **P3** | `apps/example-web/src/routes/home.tsx`, `components/auth-gates.tsx` | **Compat shims with no remaining importers** | `HomePage` re-export of `DashboardPage`; `AdminGate` → `PlatformGate`. Grep: no external imports of either shim | Delete files/exports once typecheck proves unused |
| F10 | **P3** | `packages/mcp` DEBT tags; `packages/ui` chart DEBT | **Tagged suppressions without issue pins** | `DEBT:fastmcp-zod-boundary`, `fastmcp-duck-type`, `chart-scoped-css` — **no `#N`**. Expiry uses file last-commit proxy (6 mo) | Prefer pin when opening drain issue; or remove `any` after FastMCP types stabilize; chart: CSS vars without innerHTML long-term |
| F11 | **P3** | `packages/db/src/index.ts` | **Orphan eslint-disable + escape-hatch typing** | L4–6: eslint-disable (unused tool) + `d1: unknown` + `as never` | Prefer Drizzle D1 client type / minimal interface; drop eslint comment |
| F12 | **P3** | Security-sensitive TTLs / limits (mostly named) | **Scattered magic defaults — low risk, not centralized** | Magic link `expiresIn: 300` (`better-auth.ts`); presign default `300` (`presign.ts`); cookie maxAge `60*60*24*7` (`session.ts`); login rate `20` / `15*60*1000` (`auth.ts`); `WELCOME_TTL_SEC=3600`; `INVITE_TTL_MS=7d`; API key prefix length `12` / min len `12`; PBKDF2 iters named constants | Keep named constants (already good for rate/invite/welcome). Optional: single `auth-ttls.ts` for magic-link + session cookie + welcome if products fork configs often. **Not** a vuln if defaults match AGENTS (magic link 5 min) |
| F13 | **P3** | `packages/tasks/src/access.ts` | **Unused role matrix vs module-grant dogfood** | `canWriteTasks`/`canReadTasks`/`canAdminTaskBoards` only used in package tests + barrel; app routes use `requireModule` + grants | `@deprecated` or delete until product needs system-role matrix; document “module grant only” for dogfood |
| F14 | **P3** | `apps/example-api` modules legacy | **kit_modules table + repos as fallback** | schema marks kit_modules “Legacy — prefer platform_modules”; services fall back for pre-migration DBs | Keep until migration floor guaranteed; then drop table/repos + i18n “kit_modules” copy |
| F15 | **P3** | `apps/example-api/src/lib/presign.ts` | **S3 presign mode stub (fail-closed)** | `PRESIGN_MODE=s3` always throws “not implemented”; mock default | Track as product/kit feature debt, not security hole (fail-closed is correct) |
| F16 | **P3** | `tools/file_exemptions.txt` | **Tracked file-length debt (god files)** | 9 exempt paths (sidebar 700, chart 360, design-system 1000, org-members 600, notes 520, email barrel 450, …) | Split design-system / org-members / notes / items when next feature touches them; leave shadcn shells alone |
| F17 | **P3** | Process / gate defaults | **debt:check warn-only = invisible debt in green CI** | `docs/debt-tracking.md`: both modes default **warn**; green `validate:full` ≠ managed debt until fail mode | After F1 tag: set `DEBT_UNTAGGED_MODE=fail` in CI (or document deliberate warn for one sprint). Optional: pin DEBT slugs with issues |
| F18 | **P3** | scripts/ biome-ignores | **Gate scripts outside CP-DEBT scope** | 5 untagged ignores in `scripts/check-*.ts` for env vars | Accept (v1 policy) or extend scanner to `scripts/` with allowlist for gate scripts |

## TODO / FIXME / HACK / XXX

| Area | Result |
|------|--------|
| `packages/**/*.{ts,tsx}` | **0** matches |
| `apps/**/*.{ts,tsx}` | **0** production TODOs; only `messages.contract.test.ts` regex forbidding placeholder catalogs (`TODO\|FIXME\|XXX`) |
| `scripts/**` | false positives only (`mktemp …XXXXXX`) |
| Bare `// TODO` without issue | **none** |

Positive signal: i18n contract test actively blocks TODO-placeholder message values.

## @deprecated inventory

| Symbol | Location | Live callers outside self/tests? | Drain |
|--------|----------|----------------------------------|-------|
| `MCP_TOOL_NAMES` | `packages/mcp` | tests only | delete → `DEFAULT_EXAMPLE_TOOL_NAMES` |
| `assertExactKitTools` | `packages/mcp` | tests only | delete |
| `assertNoShareTools` | `packages/mcp` | tests only | delete (shape check is weak) |
| `MeResponse.role` / me route `role` | api + web | **yes — wire field still returned** | migrate clients → drop field |
| `isAdmin` | `example-web/lib/auth.ts` | **none** (definition only) | delete |
| `AdminGate` | `auth-gates.tsx` | **none** | delete |
| `HomePage` alias | `routes/home.tsx` | **none** | delete file |
| `ensureDemoUser` | `services/auth.ts` | **none** | delete |
| `findApiKeyByHash` | `repos/keys.ts` | **none** | delete |
| SessionPort `sign`/`verify` | not marked @deprecated but dead | type requirement forces stubs | remove from type (F2) |

## Magic numbers / strings — security-sensitive sample

| Location | Value | Assessment |
|----------|-------|------------|
| `packages/auth/src/keys.ts` | prefix 12, min key len 12, salt 16, PBKDF2 100_000/600_000 | **Named** constants for iters; prefix length literal OK if documented |
| `packages/auth/src/session.ts` | maxAge `60*60*24*7` | OK; BA owns real session lifetime — helper may be secondary |
| `apps/.../better-auth.ts` | magicLink `expiresIn: 300` | Matches AGENTS “5 min”; prefer named `MAGIC_LINK_TTL_SEC` |
| `apps/.../routes/auth.ts` | `LOGIN_LIMIT=20`, `LOGIN_WINDOW_MS=15*60*1000` | **Named** — good |
| `apps/.../user-shell.ts` | `WELCOME_TTL_SEC=3600` | **Named** — good |
| `apps/.../invitations.ts` | `INVITE_TTL_MS=7d` | **Named** — good |
| `apps/.../presign.ts` | default `expiresIn ?? 300` | Align name with storage package default |
| `apps/.../session-env.ts` | secret min length **32**, weak denylist set | **Named** + fail-closed outside dev — good |
| HTTP statuses | via `@kit/core` `CODE_STATUS` / `AppError.*` | **Centralized** — good; few raw 401/403 checks in api-client/mcp |

No P0 “magic 200 hides auth failure” pattern found in sample.

## Top quick wins

| # | Effort | Win | Finding |
|---|--------|-----|---------|
| 1 | **5 min** | Tag untagged ignore → debt:check clean under fail mode | F1 |
| 2 | **15–30 min** | Delete dead `@deprecated` with zero callers (`isAdmin`, `AdminGate`, `HomePage`, `ensureDemoUser`, `findApiKeyByHash`, MCP test-only aliases) | F7–F9 |
| 3 | **30–60 min** | Narrow `SessionPort` (drop sign/verify/secret stubs) | F2 |
| 4 | **30 min** | Stop dual-seeding kit PBKDF2 into `demo_users` if table only for demos; un-export `verifyPassword` from barrel | F3 |
| 5 | **10 min** | `@deprecated` free storage helpers + JSDoc “use StorageClient” | F5 |
| 6 | **1 sprint process** | `DEBT_UNTAGGED_MODE=fail` in CI after F1; optional issue pins on 3 DEBT slugs | F10, F17 |
| 7 | **when touched** | Split `design-system.tsx` / `org-members.tsx` under exemption caps | F16 |

## Metrics

| Metric | Value |
|--------|-------|
| biome-ignore (apps\|packages) | 4 |
| Untagged | 1 |
| DEBT-tagged | 3 (0 issue-pinned) |
| @ts-expect-error / @ts-ignore | 0 |
| Bare TODO/FIXME/HACK in src | 0 |
| @deprecated symbols sampled | ~10 |
| Dead deprecated (safe delete) | ≥5 |
| File-length exemptions | 9 |
| Issues this scan | **P0=0 · P1=0 · P2=6 · P3=12** |

## Clean notes

| Area | Assessment |
|------|------------|
| TODO hygiene | Excellent — no bare work markers; catalog contract blocks TODO strings |
| Suppression volume | Very low vs typical monorepos; CP-DEBT grammar is real and tested (`test:debt`) |
| AppError / status codes | Centralized in `@kit/core`; apps prefer `AppError.*` factories |
| Rate limits / invite / welcome TTLs | Named constants near use site |
| Dual-auth production path | BA + sk_ only in `require-auth` middleware — no HMAC cookie mint on request path |
| debt:check self-test | CP-DEBT harness exists (`scripts/test-debt.sh`) |

## Cross-links (other audit partitions)

| Overlap | Report |
|---------|--------|
| HMAC SessionPort / dual KDF | `architecture/P1-P2-core-auth.md`, `code-smells/saas-packages.md`, `security/auth-package.md` |
| Free storage helpers | `architecture/P3-P4-data-ui.md`, `security/storage-email-db.md` |
| FastMCP `any` DEBT | `type-safety/packages.md` |
| chart dangerouslySetInnerHTML | `security/web-mcp.md` |
| Machine baseline debt warn | `axial-drift/machine-baseline.md` |

## Severity legend (STRATEGY)

| Level | Meaning |
|-------|---------|
| P0 | Security / extractibility broken |
| P1 | Bug risk / critical coverage hole |
| P2 | Refactor / medium debt / dual-path residue |
| P3 | Cleanup / hygiene / tracked exemptions |

---

**Next (optional agent):** `debt-ci-hygiene` — flip fail modes, agents-adr bare refs, file/folder gates.  
**Drain order if budgeting one PR:** F1 → F7–F9 deletes → F2 SessionPort narrow.
