# Security — apps/example-api

## Summary

`apps/example-api` is a solid multi-tenant kit dogfood API: dual-path auth (cookie session \| Bearer `sk_`) is centralized in `@kit/auth` + app `findKeyRecord` (org-bound keys only, membership re-check on every use), org routes use `requireOrgContext` / `requireOrgCapability` / `requireModule` with fail-closed 404 on missing membership, and mutations are defended by global `originGuard` + BA `SameSite=Lax` cookies. Security headers apply on success and error paths; `toApiErrorBody` strips 5xx messages and stacks from clients. Org-scoped IDOR matrices (orgs, roles, invites, tasks, items/notes subject scope) are covered by tests.

No P0 auth bypass or classic org IDOR was confirmed in this pass. Residual risk is mostly **scope hygiene** (staff user directory is platform-wide), **showcase deploy choices** (`ALLOW_PUBLIC_SIGNUP=true` in production wrangler), **subject-scoped demos that are not org-scoped**, incomplete **rate-limit surface** beyond auth/mint/invite, and **demo credential** handling (source + `/health` in dev|test only).

## Findings

| ID | Severity | File | Finding | Evidence | Recommendation |
|----|----------|------|---------|----------|----------------|
| F1 | P1 | `src/services/admin-users.ts` · `listAdminUsers`; `src/routes/admin-users.ts` GET | **Staff can list the full platform user directory** (emails/names/platformRole) without org scoping | Create/resend enforce staff↔org intersection (`actorOrgIds`, shared membership on resend). `listAdminUsers` only calls `usersRepo.listBaUsers` with no actor filter. Route allows `requirePlatformRole('super_admin', 'staff')` + session. Tests only assert super can list; no staff privacy negative. | For staff: filter to users who share ≥1 org membership with the actor (or super-only full list). Add CP-IDOR test: staff cannot see foreign-org-only users. |
| F2 | P2 | `wrangler.toml` `[env.production].vars` | **Production kit showcase enables open public signup** | `ALLOW_PUBLIC_SIGNUP = "true"` with live route `api.boilerplate.roxabi.dev`. Default kit code is fail-closed (`allowPublicSignup` only true when env string is `"true"`; BA `disableSignUp: !publicSignup`). Auth paths are IP rate-limited (20/15m) but spam/abuse and account-farming remain open by design. | Document as showcase-only; products must default off. Prefer invite/admin provision in real deploys. Consider captcha/stricter limits if showcase stays open. |
| F3 | P2 | `src/routes/{notes,items,uploads}.ts` · services/repos | **Demo notes/items/uploads are subject-scoped, not org-scoped** | Auth via `requireAuth` + repo `eq(...subject, subject)` (IDOR matrix user A vs B in `app.test.ts` / `items.test.ts`). No `requireOrgContext` / `X-Org-Id`. Multi-tenant dogfood for orgs lives on `/api/orgs/*`, `/api/tasks/*`. Products copying notes/items as tenant data would miss org isolation. | Keep as intentional subject-demo **or** add org binding + `requireOrgContext` if promoted to tenant resources. Document in route module JSDoc that these are non-tenant demos. |
| F4 | P2 | Rate-limit call sites | **Rate limits are selective; many authenticated mutation surfaces unbounded** | `assertRateLimit` used on: BA sensitive auth (`routes/auth.ts`), key mint (`me.ts`), demo email, invite create/accept, admin user create/resend. **Not** on notes/items CRUD, tasks/comments, uploads presign, org create, module toggles, jobs ping. D1 fixed-window is solid where used (`lib/rate-limit.ts`, fail-closed on D1 errors). | Add subject/IP limits on costly paths (presign, org create, task write). Optional global per-subject token bucket for API abuse. |
| F5 | P2 | `src/seed/demo-data.ts` · `src/seed/tenancy-data.ts` · `src/routes/health.ts` | **Hardcoded demo passwords in source; `/health` echoes them in development\|test** | `SEED_USERS` passwords (`demo-password-change-me`, …); `TENANCY_PASSWORD = 'demo-password-change-me'`. `healthRoutes` sets `demoLogin` only when `isDevLikeEnvironment`. Staging/prod health tests omit `demoLogin`. `ensureDemoUsers` no-ops outside development\|test. Risk = mis-set `ENVIRONMENT=development` on a public Worker. | Keep gate; add deploy checklist / wrangler comment already partially present. Never set `ENVIRONMENT=development` on remote. Consider removing password from `/health` (email-only + docs). |
| F6 | P2 | `src/routes/me.ts` | **Deprecated kit `role` still returned on `/api/me`** | `role: authService.roleForSubject(subject)` maps seed `user_demo` → `admin` from `demo-data`, independent of org/platform RBAC. Comment says do not use for BO gates; clients that ignore it can soft-gate wrong. | Remove field after SPA migration, or always `"user"` / omit unless explicitly demo flag. Ensure example-web uses `platformRole` / org role only. |
| F7 | P3 | `src/routes/admin-audit.ts` | **Admin audit list allows Bearer `sk_` (not session-only)** | Only `requireAuth` + `requirePlatformRole('super_admin')`. Contrast: admin users, key mint, invites force `authMethod === 'session'`. Super with org membership can mint `sk_` and read audit if platform role holds. | Prefer session-only for BO audit (parity with admin users), or document machine-audit as intentional. |
| F8 | P3 | `src/services/uploads.ts` `completeUpload` | **Client `key` prefix-checked but not run through `assertObjectKey`** | Prefix: `key.startsWith(expectedPrefix + '/') \|\| key === expectedPrefix`. R2 keys are opaque (no FS traversal), but `..` segments are rejected elsewhere in `@kit/storage` while complete uses raw `bucket.head/put`. | Call `assertObjectKey(opts.key)` (or re-join via `StorageClient`) before head/put. |
| F9 | P3 | `src/routes/modules.ts` GET `/api/modules` | **Any authenticated principal can read platform module catalogue flags** | `requireAuth` only; PATCH is `super_admin` + session. Low sensitivity (`enabled`/`configured`/`configPath` SPA paths), not secrets. | Optional: restrict GET to staff/super or org-admin if catalogue should be BO-only. |
| F10 | P3 | Comments in `routes/me.ts`, `auth.ts`, `demo.ts` | **Stale “in-memory” rate-limit comments** | Comments still say “demo in-memory”; implementation is durable D1 (`rate_limit_buckets`, migration `0010`). | Fix comments to say D1 fixed-window to avoid wrong ops assumptions. |

### Controls reviewed (no finding / healthy)

| Area | Status | Evidence |
|------|--------|----------|
| Dual-path requireAuth | OK | `middleware/require-auth.ts` → `createRequireAuth`; Bearer wins; BA SessionPort; `findKeyRecord` denies missing/inactive org, missing membership, NULL `organizationId` |
| sk_ mint / revoke | OK | Session-only mint/revoke; `organizationId` mandatory; membership checked (`services/auth.ts`); rate-limited mint |
| requireOrgContext | OK | Path `orgId` > `X-Org-Id`; path/header mismatch → 403; api_key must match `keyOrganizationId`; inactive org → 403; non-member → 404; super read/write break-glass gated (`allowSuperAdmin` / `allowSuperAdminWrite`, default write off) |
| requireModule / grants | OK | `orgRolesService.resolveModuleAccess`; hide module if platform/org off (404) vs grant missing (403) |
| Admin vs member | OK | `requireOrgCapability`, `requirePlatformRole`, staff cannot assign platform roles / foreign org memberships (tests SC2/SC3); super write fail-closed without break-glass |
| Org IDOR | OK | Tests: `org-rbac.test.ts`, `org-roles-phase-b.test.ts`, `invitations.test.ts`, `tasks.test.ts` (visibility internal vs external) |
| CSRF / Origin | OK | Global `originGuard`: cookie mutations require allowlisted Origin; Bearer may omit; CORS credentials + explicit origins; BA cookies HttpOnly + SameSite=Lax + Secure outside dev\|test |
| Security headers | OK | `security-headers.ts` + error/notFound re-apply: nosniff, frame DENY, CSP `default-src 'none'`, Referrer-Policy, Permissions-Policy, HSTS when Secure cookies |
| Error leak | OK | `toApiErrorBody` public 5xx = generic; stacks only in server logs (`error-handler.ts`); tests assert no `stack` in body |
| Secrets / BA config | OK | Weak placeholder secrets rejected outside dev\|test; `BETTER_AUTH_URL` required outside dev; production secrets not in wrangler vars |
| R2 path (presign key build) | OK | Filename sanitized; `StorageClient`/`joinObjectKey` reject `..` |
| Seed HTTP exposure | OK | Seed is CLI (`scripts/seed-local.ts`); no HTTP seed route |

## Metrics

- Files reviewed: ~45 (middleware, routes, auth/org/tasks/admin/invite/upload services, seed, health, wrangler, selected tests, `@kit/auth` require-auth, `@kit/core` errors, `@kit/storage` key helpers)
- Issues: P0=0 · P1=1 · P2=5 · P3=4
- Notable hotspots:
  - `middleware/org-context.ts` + `require-auth.ts` (tenant gate spine)
  - `routes/orgs.ts` / `routes/tasks.ts` (org + module matrix)
  - `services/admin-users.ts` (staff directory scope)
  - `routes/health.ts` + seed credentials
  - `wrangler.toml` production showcase flags

## Recommendations

1. **P1:** Scope `GET /api/admin/users` for `staff` to users sharing org membership; add automated IDOR coverage.
2. **P2:** Treat production `ALLOW_PUBLIC_SIGNUP=true` as showcase-only in product playbooks; default products to invite-only.
3. **P2:** Label or upgrade subject-scoped demos (notes/items/uploads) so consumers do not confuse them with org multi-tenant patterns.
4. **P2:** Extend rate limits to presign, org create, and high-churn write APIs; keep fail-closed D1 behavior.
5. **P2/P3:** Drop or strictly gate deprecated `/api/me.role`; session-only admin audit; `assertObjectKey` on upload complete; refresh rate-limit comments.
6. **Regression bar:** Keep dual-auth, NULL-org key denial, originGuard cookie mutations, and org IDOR suites green on every pre-push `validate:full`.
