# Axial Drift — Semantic ADR-0001 Review

**Date:** 2026-08-12  
**Axis:** ADR-0001 primary = `packages/*` compose deployable `apps/*`  
**Scope:** `packages/**`, `apps/example-*`, `apps/mcp-example`  
**Machine baseline:** import-boundary / banlist / extract-dry-run green (`axial-drift/machine-baseline.md`)  
**Mode:** read-only on application code; semantic N×M / wrong-axis only

---

## Summary

Structural axis health is good: apps compose `@kit/*` for AppError, dual-auth, storage, email, i18n, and incubating pure kernels; no product `share/*` markers under `packages/**`; no local `class AppError` in apps. Semantic drift is concentrated in **incubating package siblings** (tasks↔comments visibility/audience twins; flows↔mcp tool/error/stringify forks) and in **platform Hono composition still living only in `example-api`** (`requireOrgContext` / `requireModule` / rate-limit / audit / security headers). Those app-local spines are correct for a single dogfood call site today, but they are the highest residual N×M risk for multi-tenant kernel growth: a second product will copy them unless pure ports promote first. No P0 extractibility or forked-auth stack found.

---

## Findings

| ID | Severity | File | Finding | Evidence | Recommendation |
|----|----------|------|---------|----------|----------------|
| AD-S1 | **P1** | `packages/tasks/src/visibility.ts` · `packages/comments/src/visibility.ts` · `packages/comments/src/audience.ts` | **target-axis-trap:** same object-ACL visibility helpers reimplemented across incubating siblings | `canView*` / `filter*ForAudience` / `canSet*Visibility` are line-level twins (staff → all; external → `shared` only). `comments/audience.ts` comment: *« Mirror of @kit/tasks Audience — kept local to avoid package cycles. »* ADR-0007 D3/D4 specify **one** visibility model + AudiencePort. | Extract shared pure helpers (`Audience`, `VISIBILITIES`, `canViewByAudience`, `filterByAudience`, `canSetVisibility`) into a tiny shared module (e.g. `@kit/acl` or hoist under one package with comments depending on tasks for ACL only). Delete twin implementations; keep package-specific schema wrappers. |
| AD-S2 | **P1** | `packages/tasks/src/access.ts` · `packages/flows/src/access.ts` · `packages/flows/src/constants.ts` · `packages/auth/src/org-roles.ts` | **target-axis-trap:** owner/admin(/member/reader) role matrices forked per capability package instead of composing `@kit/auth` | `TASKS_ADMIN_ROLES` / `FLOWS_ADMIN_ROLES` = `['owner','admin']`; `canWriteTasks` hardcodes owner\|admin\|member; `canReadTasks` adds reader — same ranks as `roleHasCapability` / `CAPABILITY_MIN` in `@kit/auth`. Dogfood routes use `requireModule` (grants), **not** `canWriteTasks` (`apps/example-api/src/routes/tasks.ts`), so two mental models coexist. | Prefer package-local **module ops** over re-encoding system role strings. Either (a) drop unused tasks access helpers and document “module grant only”, or (b) implement access as thin wrappers over `roleHasCapability` / `accessAllows` so system seed and custom roles cannot diverge. Keep `canCreateFlowRun` (authMethod fail-closed) as flows-specific. |
| AD-S3 | **P1** | `apps/example-api/src/middleware/org-context.ts` | Platform multi-tenant HTTP spine (org resolve · key org bind · module grant · super_admin bypass) lives only in example-api | ~200 LOC: `requireOrgContext`, `requireOrgRole`, `requireOrgCapability`, `requireModule`, `requirePlatformRole`. Pure helpers (`roleAtLeast`, `accessAllows`) are in `@kit/auth`, but the **ports + middleware factory** every product Worker needs are app-local. ADR-0001: *new cross-cutting capability → package when ≥2 call sites*. Today 1 call site; **semantic** risk = second product copy-paste. | Before second product compose: promote **port-based** org middleware factory into `@kit/auth` (or `@kit/http` if introduced): inject `findOrg`, `findMembership`, `getPlatformRole`, `resolveModuleAccess`. Keep Drizzle repos in apps. Treat as promote gate for JTBD-platform D2. |
| AD-S4 | **P2** | `packages/mcp/src/catalogue.ts` · `packages/mcp/src/budget.ts` · `packages/flows/src/registry.ts` · `packages/flows/src/authority.ts` | Parallel tool-registry paths (MCP vs flows) with divergent effect enums, budgets, and authz models | MCP: `ToolEffect = 'read'\|'write'`, input-shape budget, `registerAll` **ignores** `effect`/`auth` for authz (SC12). Flows: effect includes `'external'`, grant∩permits∩registry via `resolveEffectiveAuthority`, token budget. AGENTS/ADR-0005 defer shared registry until ≥2 consumers / D6. | Document as **intentional incubating fork** with a promote checklist (shared `ToolName` + effect vocabulary + grant∩ path). When agents path lands, **do not** invent a third registry; extract SSOT types first. Track as N×M residual, not day-1 bug. |
| AD-S5 | **P2** | `packages/mcp/src/publicErrors.ts` · `packages/flows/src/digest.ts` | **target-axis-trap:** two `stableStringify` implementations with different algorithms | MCP: `JSON.stringify(sortKeys(...))` (agent-facing wire). Flows: custom JSON-like string for FNV-1a plan/registry digests (index only, not crypto). Same name, different contract → silent wrong digest if cross-imported. | Either rename (`stableJsonWire` vs `stableDigestInput`) in both packages, or move a single pure helper to `@kit/core` with explicit purpose docs. Never share digests across channels without algorithm pin. |
| AD-S6 | **P2** | `packages/mcp/**` · `apps/mcp-example/src/index.ts` · `apps/example-api` dual-auth | Parallel auth paths: MCP machine key → HTTP `/api/me`; Hono dual-path cookie \| `sk_` with org re-check | MCP correctly uses `parseBearer` + `handleWhoami` → GET `/api/me` (no cookie). HTTP tenant routes use `createRequireAuth` + `findKeyRecord` membership re-check (ADR-0003 D11). Effectful MCP tools under grant∩permits **not** wired (catalogue metadata only). | Accept for ping/whoami. Before product MCP tools: require same org-bound key re-check + module/grant path as HTTP (parity ADR-0005 D4). Ban ambient tool registry in examples. |
| AD-S7 | **P2** | `apps/example-api/src/lib/rate-limit.ts` · `apps/example-api/src/services/audit.ts` · `apps/example-api/src/middleware/security-headers.ts` · `apps/example-api/src/middleware/error-handler.ts` | Platform concerns still only in example-api (rate-limit, audit sanitize, security headers, onError glue) | AGENTS stack table: `@kit/rate-limit` / `@kit/audit` = P1 planned. Implementations are non-trivial (D1 fixed window; audit meta allowlist/deny; HSTS/CSP). Error body mapping correctly uses `@kit/core` `toApiErrorBody`. | Keep until second call site **or** promote pure cores (`assertRateLimit` ports, `sanitizeAuditMeta` pure, `applySecurityHeaders` env-agnostic) when first product would otherwise copy. Do not empty-scaffold packages. |
| AD-S8 | **P2** | `packages/*/migrations/*.sql` vs `apps/example-api/migrations/0012_*.sql` · `0013_*.sql` | Sketch SQL in packages drifts from applied app SSoT | Package flows sketch: `created_at` **text**; applied `0012`: **integer** ms. Comments in sketches say “NOT applied by wrangler” / “OUT OF DATE for types”. Risk: product eng copies sketch as truth. | Either generate sketches from applied SSoT in CI, or delete package SQL and point README only to `apps/example-api/migrations` + ADR. Mark sketch headers with `STALE` if intentional. |
| AD-S9 | **P3** | `packages/comments/src/constants.ts` · `packages/comments/src/index.ts` | Mild product-shaped vocabulary in kit known-target list | `KNOWN_COMMENT_TARGET_TYPES` includes `project`, `phase`, `contract`, `document` (product domain names from ADR-0007 product signals). Open string at parse is correct; closed “known” list risks becoming product enum in UI. | Keep as documentation-only known set; do not branch kit logic on product targets. Prefer `task` + open string; product apps own extra target types. |
| AD-S10 | **P3** | `packages/tasks/src/access.ts` (exports) · dogfood routes | Dead dual-path risk: package role helpers unused by kit dogfood | Grep: `canWriteTasks` / `canReadTasks` / `canAdminTaskBoards` only used in `access.test.ts` + package exports; routes use `requireModule(TASKS_MODULE_ID, …)`. | Deprecate or document “defaults for products without Phase B grants”; align with AD-S2. |

---

## Metrics

| Metric | Value |
|--------|--------|
| Files / areas reviewed | ~45 (auth, core, mcp, flows, tasks, comments, example-api middleware/services, mcp-example, api-client) |
| Machine axis (import-boundary / banlist / extract) | green (Wave 0) |
| Issues | **P0=0 · P1=3 · P2=5 · P3=2** |
| Local AppError / forked auth stack in apps | **0** |
| Product markers under `packages/**` | **0** (banlist) |
| Confirmed sibling N×M pairs | 2 strong (visibility/audience; role allowlists) + 2 weak (stableStringify; tool registries) |
| Platform-only-in-example-api candidates | org-context · rate-limit · audit · security-headers |
| Hotspots | `packages/tasks`↔`packages/comments` · `packages/flows`↔`packages/mcp` · `apps/example-api/src/middleware/org-context.ts` |

---

## Recommendations

1. **P1 — Unify audience/visibility (AD-S1)** before more products compose tasks+comments. Cheapest high-value axial fix; ADR-0007 already names one model.
2. **P1 — Collapse role allowlists (AD-S2)** so module grants remain the sole runtime power path; avoid “system role strings” forked per package.
3. **P1 — Plan org middleware ports (AD-S3)** as explicit promote work for second product / platform D2 — not a silent copy from `example-api`.
4. **P2 — Freeze MCP↔flows registry divergence (AD-S4/S5/S6)** with a written promote checklist; rename dual `stableStringify`; no third agent registry.
5. **P2 — Sketch migrations (AD-S8):** stop dual SSoT; one applied path only.
6. **Do not** promote empty `@kit/rate-limit` / `@kit/audit` shells without a second call site (ADR-0001 three-strikes / 2-call-site rule).
7. Keep **dogfood domain** (`items`, `notes`) subject-scoped demos in apps — correct axis; do not “kernelize” them.

---

## Confirmed N×M traps

| Trap | Siblings | What is duplicated | Severity |
|------|----------|--------------------|----------|
| Object ACL visibility + Audience type | `@kit/tasks` ↔ `@kit/comments` | `canView` / filter / `canSet` + Audience enum (comments admits “mirror”) | **P1** |
| System role allowlists | `@kit/tasks` access ↔ `@kit/flows` access ↔ `@kit/auth` org-roles | owner/admin(/member/reader) matrices | **P1** |
| `stableStringify` | `@kit/mcp` ↔ `@kit/flows` | Same name, different algorithms | **P2** |
| Tool catalogue / registry | `@kit/mcp` ↔ `@kit/flows` | Tool defs, effects, budgets, authz story | **P2** (incubating, intentional) |

---

## Probable drift (needs human)

| Risk | Why probable | When it bites |
|------|--------------|---------------|
| `requireOrgContext` / `requireModule` copied into product APIs | Only dogfood implements full ADR-0003 D9/D11/D12 HTTP spine | First greenfield product Worker |
| Rate-limit + audit + security headers forked per product | Non-trivial pure logic still app-local; AGENTS lists future packages | Second deploy / staging hardening |
| MCP effectful tools without grant∩ | Catalogue auth metadata is non-authoritative today | M5 product MCP / agents after D6 |
| Products binding UI to `KNOWN_COMMENT_TARGET_TYPES` | Kit “known” list looks like a closed product enum | Metalyde/Ether compose |
| Tasks access helpers adopted *instead of* module grants | Exports look authoritative; dogfood ignores them | Custom Phase B roles silently wrong |
| Sketch SQL applied from `packages/*/migrations` | Headers say sketch; humans still copy | Product migration day-1 |

---

## What is *not* axial drift (healthy)

| Pattern | Why OK under ADR-0001 |
|---------|------------------------|
| `apps/example-api` wires `createRequireAuth` + BA SessionPort + key lookup | Package owns pure dual-auth; app owns ports/DB |
| `AppError` / `toApiErrorBody` only from `@kit/core` | No forked error class in apps |
| `example-web` `apiErrorToMessage` bridges `@kit/api-client` + app catalogs | i18n catalogs app-owned (AGENTS G) |
| `items` / `notes` domain in example-api only | Deployable owns domain; not under `packages/**` |
| Flows dogfood fixed grant (no client allowlist mint) | Correct provenance (ADR-0005 D4) |
| Package SQL marked sketch; applied under apps | Axis correct if humans respect applied SSoT |
| Machine import-boundary 0 violations | Structural packages↛apps holds |

---

## Residual risk — multi-tenant kernel growth

Even with a clean structural axis, **semantic** platform capability is still “example-shaped”:

```text
@kit/auth pure roles/grants/dual-auth
        ↓  (missing package: org HTTP ports)
example-api middleware org-context + module + rate-limit + audit
        ↓  (copy risk)
product-api #2 …
```

Incubating kernels already show the N×M pattern **inside** `packages/*` (tasks/comments, flows/mcp). Fixing sibling twins now is cheaper than after two product composes. Platform JTBD (second compose without forking the runner **or** the org middleware) is not met by pure packages alone — composition helpers must promote with evidence, not as empty shells.

**Non-claim:** this review does not re-run IDOR runtime tests; it does not prove grant∩ enforcement on MCP tools (absent by design today).
