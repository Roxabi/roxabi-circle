# Axial Drift — Structural

**Date:** 2026-07-12  
**Repo:** `/home/mickael/projects/gosilex/silex-share`  
**Axial ADR:** [`docs/architecture/adr/0001-primary-axis-packages-compose-apps.md`](../../../../docs/architecture/adr/0001-primary-axis-packages-compose-apps.md) (`axial: true`)  
**Method:** package.json workspace graph · source import scan · banlist pattern re-scan · extract-dry-run requirement check  
**Scope:** kit extractibility (packages + `apps/example-*` + `apps/mcp-example`)  
**Note:** No `import-linter` / eslint-boundaries config in repo; structural analysis is the enforcement substitute (process + scripts). Shell execution of gate scripts was unavailable in this audit agent; banlist and extract checks were **reimplemented via the same patterns** the scripts use (see Metrics).

---

## Summary

**Primary axis is healthy.** Platform packages (`@gosilex/*`) compose deployable example apps; packages never import apps; product-share domain markers are absent from kit surfaces; AppError/key hashing/session crypto live in packages (not forked in apps); every kit package has ≥1 example consumer (or tsconfig extends for `@gosilex/config`).

**Secondary axis (routes → services → repos) is mostly respected** inside `example-api`: routes never import repos; services own repos for notes/keys. One clear secondary-layer skip: `loginWithPassword` queries `demoUsers` with raw Drizzle inside the service instead of a users repo.

**Gates (structural):** banlist patterns → **clean**; extract-dry-run required tree + import presence + ADRs → **OK**; product apps `apps/share-*` → **absent** (kit-only tree).

| Axis | Verdict |
|------|---------|
| packages compose apps | Pass |
| packages ↛ apps | Pass (0 hits) |
| product domain out of kit | Pass |
| no local AppError fork | Pass |
| routes ↛ repos | Pass |
| services → repos only for DB | **Partial** (users path) |
| importlinter automation | Absent (process + scripts only) |

**Overall axial health:** green with minor secondary-layer debt — not blocking extract.

---

## Dependency graph (workspace)

### Workspaces

Root `package.json` workspaces: `apps/*`, `packages/*` · packageManager `bun@1.3.14`.

### Packages (`@gosilex/*`)

| Package | workspace deps | Runtime surface |
|---------|----------------|-----------------|
| `@gosilex/types` | — | `ErrorCode`, `ApiErrorBody` |
| `@gosilex/core` | → types | `AppError`, `toApiErrorBody`, `newRequestId` |
| `@gosilex/auth` | → core (**unused in src**) | HMAC session, sk_ hash, PBKDF2 password |
| `@gosilex/db` | — | `createDb` (schema owned by apps) |
| `@gosilex/storage` | — | R2 helpers + `joinObjectKey` |
| `@gosilex/email` | — | demo email template builders |
| `@gosilex/mcp` | → auth | tool allowlist, ping/whoami helpers |
| `@gosilex/ui` | — (peer react) | shadcn Base UI shell |
| `@gosilex/config` | — | `tsconfig.base.json` only |

```text
types ← core ← auth ← mcp
db, storage, email, ui, config   (leaves / independent)
```

**Cycles:** none among packages.

### Apps

| App | `@gosilex/*` deps | Role |
|-----|-------------------|------|
| `@gosilex/example-api` | auth, core, db, email, storage, types | Hono Worker demo |
| `@gosilex/example-web` | types, ui | TanStack SPA demo |
| `@gosilex/mcp-example` | mcp | FastMCP stdio demo |

**Product apps** `apps/share-api` / `apps/share-web`: **not present**.

### Package → app reverse imports

| Check | Result |
|-------|--------|
| `packages/**` import from `apps/**` or `@gosilex/example-*` / `@gosilex/share-*` | **0 matches** |
| Root tooling `scripts/check-env-sync.ts` imports `apps/example-api/src/env.schema` | Yes — monorepo DX only, not a package violation |

---

## Secondary layers (`example-api`)

Intended: **routes → services → repos** (ADR-0001 + AGENTS.md).

| Layer | Observed imports | Status |
|-------|------------------|--------|
| routes | services, middleware, `@gosilex/core`/`db`, schema, zod | routes ↛ repos ✓ |
| middleware (`require-auth`) | services/auth + createDb | OK (guard uses service) |
| services/notes | repos/notes + `@gosilex/storage` | ✓ |
| services/auth | repos/keys + **raw drizzle on demoUsers** | **skip** |
| repos | drizzle + schema only | ✓ |
| seed | direct drizzle (bootstrap path, not request path) | acceptable |

---

## Findings

| ID | Severity | File | Finding | Evidence |
|----|----------|------|---------|----------|
| AXD-001 | **P2** | `apps/example-api/src/services/auth.ts` | Service bypasses repo layer for user lookup — secondary-axis violation | `loginWithPassword` does `db.select().from(demoUsers)...` via dynamic import of schema/drizzle instead of a `repos/users` (or similar). Keys path correctly uses `keysRepo`. |
| AXD-002 | P3 | `apps/example-api/src/routes/{auth,notes,me}.ts`, `middleware/require-auth.ts` | Routes/middleware own `createDb(c.env.DB, schema)` wiring repeatedly | Six call sites construct Drizzle clients in HTTP layer. Not “repos direct”, but couples routes to schema/infra; a thin context helper or service factory would harden the secondary axis. |
| AXD-003 | P3 | `packages/auth/package.json` | Declared dep `@gosilex/core` never imported by auth sources | `package.json` lists `"@gosilex/core": "workspace:*"`; no `from '@gosilex/core'` under `packages/auth/src/**`. Dead edge on primary axis graph. |
| AXD-004 | P3 | repo-wide | No import-linter / eslint import boundaries for layers | Secondary layers are process-enforced (ADR expected debt). Regression of AXD-001-style skips will only be caught by review or future linter. |
| AXD-005 | P3 | `apps/example-web/src/lib/api.ts` | FE `ApiError` client lives in the app, not a package | Matches AGENTS frontend pattern; single call site today. Promote only if a second SPA repeats it (three-strikes). Uses `@gosilex/types` for body shape — good. |
| AXD-006 | P3 | `apps/example-api/src/services/email.ts` | SMTP/log transport implemented in app; package only builds templates | `@gosilex/email` = `buildDemoEmailText` / `DemoEmail`. Transport in app is 1 call site → allowed by “≥2 call sites or ADR”. Watch when share-api needs mail. |
| AXD-007 | P3 | `scripts/check-env-sync.ts` | Root script couples to `example-api` env schema | Intentional DX SSoT; not packages→apps. Document if extract splits tooling. |

### Explicit non-findings (checked, clean)

| Check | Result |
|-------|--------|
| packages import apps | **None** |
| routes import repos | **None** |
| Local `class AppError` under apps | **None** (only `packages/core/src/errors.ts`) |
| Local reimplementation of `hashApiKey` / `signSession` in apps | **None** (apps import `@gosilex/auth`) |
| Product banlist tokens in packages / example apps | **None** (non-test sources) |
| `joinObjectKey('share', …)` or `share/` R2 product prefix in kit code | **None** (demo uses `demo/` prefix) |
| `apps/share-*` present | **No** |
| Circular package deps | **None** |
| Orphan packages (no consumer) | **None** — config via tsconfig extends; all others imported by examples |
| Product markers disguised in UI copy | “no shared team key” is ACL policy language, not product domain |

---

## Metrics

### Inventory

| Metric | Value |
|--------|------:|
| Workspace packages | 9 |
| Workspace apps (kit) | 3 |
| Product apps | 0 |
| Package workspace dependency edges | 3 (`core→types`, `auth→core`, `mcp→auth`) |
| Package cycles | 0 |
| packages→apps import hits | 0 |
| routes→repos import hits | 0 |
| services→repos files | 2 (`auth`, `notes`) |
| services with raw drizzle queries (non-repo) | 1 (`auth.loginWithPassword`) |
| Local AppError definitions | 1 (canonical in core) |
| Local FE ApiError definitions | 1 (example-web) |
| createDb call sites in example-api src | 6 (routes×5 + require-auth×1) + seed/tests |

### Gate scripts (structural reimplementation)

**`scripts/check-banned-strings.sh` patterns** scanned over `packages/`, `apps/example-api`, `apps/example-web`, `apps/mcp-example` (case-insensitive where script uses `-i`):

| Pattern | Hits (non-test kit sources) |
|---------|----------------------------:|
| `share/\{slug\}` | 0 |
| `share_publish` | 0 |
| `private_key_product` | 0 |
| `apps/share-` | 0 |
| `shlink` | 0 |
| `s.gosilex.com` | 0 |
| `share.gosilex.com` | 0 |
| `joinObjectKey('share` / `"share` | 0 |

**Result:** `check-banned-strings: OK` (equivalent).

**`scripts/extract-dry-run.sh` (mode=kit default) checks:**

| Check | Result |
|-------|--------|
| Required root/files (package.json, turbo, biome, packages/*, examples, ADR-0001) | present |
| ADR-0001 `axial: true` | present |
| ADR-0002 session interim | present |
| No product apps under strict | N/A (mode kit; none present) |
| example-api imports core/auth/db/storage/email | present |
| mcp-example imports mcp | present |
| example-web imports ui + types | present |
| tsconfig extends `packages/config/tsconfig.base.json` | all apps + packages (except config itself) |
| banlist | OK |

**Result:** `extract-dry-run: OK (mode=kit)` (equivalent).

### Consumer map (primary axis test)

| Package | Consumed by |
|---------|-------------|
| core | example-api |
| types | core, example-api, example-web |
| auth | example-api, mcp (package) |
| db | example-api |
| storage | example-api |
| email | example-api |
| mcp | mcp-example |
| ui | example-web |
| config | all package/app tsconfigs via extends |

ADR test: *“Adding a second product creates apps/\<name\>-\* and imports @gosilex/\* — it does not copy AppError/auth/db/storage stacks”* — structure supports this today.

---

## Recommendations

1. **AXD-001 (P2) — add users repo**  
   Extract `findUserByEmail` (and optionally insert) into `apps/example-api/src/repos/users.ts`; call from `services/auth.ts`. Aligns keys/notes pattern and closes the only hard secondary-layer skip.

2. **AXD-002 (P3) — optional db helper**  
   e.g. `getDb(c)` in app lib, or inject db from middleware once per request, so routes only call services with already-built clients.

3. **AXD-003 (P3) — drop unused `@gosilex/core` from auth package.json**  
   Or start using core (e.g. shared errors from auth helpers) if intentional. Prefer drop until needed — keeps graph honest.

4. **AXD-004 (P3) — automate secondary axis**  
   When budget allows: simple eslint `no-restricted-imports`  
   - `routes/**` cannot import `**/repos/**`  
   - `packages/**` cannot import `**/apps/**`  
   Complements banlist/extract; does not replace them.

5. **Do not** promote FE `ApiError` or SMTP transport to packages until second call site (ADR three-strikes / ≥2 sites).

6. **Keep** banlist + extract-dry-run in `validate` / pre-push — they are the real primary-axis machine gates today.

---

## Residual risks

| Risk | Likelihood | Impact | Notes |
|------|------------|--------|-------|
| Service-layer drizzle creep without users repo precedent | Medium | Medium | AXD-001 sets a bad example for share-api later |
| Second product copies middleware/error-handler instead of packaging Hono glue | Low–Med | Medium | error-handler / security-headers / request-id still app-local (1 site OK); document promote rule |
| Product domain leak when `apps/share-*` lands | Low (today) | High | banlist only covers packages + examples — product dirs intentionally excluded; need discipline + CODEOWNERS |
| Better Auth swap (ADR-0002) forks session in product without SessionPort | Medium later | Medium | axial package boundary OK; adapter still process |
| No importlinter | Certain | Low–Med | process debt called out in ADR “Expected debt” |
| Extract split forgets root tooling coupling to example-api env schema | Low | Low | AXD-007 |

---

## Appendix A — Import edges (source, non-exhaustive)

**Packages:**

- `packages/core` → `@gosilex/types`
- `packages/mcp` → `@gosilex/auth`
- `packages/auth` → (none of @gosilex/* in src)

**example-api composition:**

- routes → services + `@gosilex/core` + `createDb` + schema
- services → repos + `@gosilex/{auth,core,storage,email}`
- middleware → services + core + db
- seed → auth `hashPassword` + raw schema (bootstrap)

**example-web composition:**

- UI from `@gosilex/ui`
- error body type from `@gosilex/types`
- domain fetch/auth/i18n local to app

**mcp-example composition:**

- tools only via `@gosilex/mcp` + FastMCP

---

## Appendix B — ADR anti-pattern checklist

| Anti-pattern (ADR-0001) | Status |
|-------------------------|--------|
| Product markers under packages (`share/{slug}`, `private_key` product mode, `share_publish`, Shlink) | **Absent** |
| Local `class AppError` under apps | **Absent** |
| Same platform helper reimplemented in ≥3 apps | **N/A** (single API app; crypto centralized) |

---

*End of axial drift structural report.*
