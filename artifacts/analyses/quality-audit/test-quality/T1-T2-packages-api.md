# Test Quality — T1+T2 packages + example-api

| | |
|---|---|
| **Domain** | Test Quality |
| **Partition** | T1 `packages/**/*.test.ts(x)` · T2 `apps/example-api/**/*.test.ts` |
| **Date** | 2026-08-12 |
| **SSoT** | [`docs/testing.md`](../../../../docs/testing.md) CP-\* · floors T0/T1 · ADR-0002/0003 |

## Summary

T0/T1 security spine is **strong**: `@kit/auth` dual-path + key crypto + pure RBAC helpers are unit-tested with real negatives (invalid Bearer fails closed, PBKDF2 floors, grant ceilings); `example-api` composes those via full `createApp` + memory D1/R2 with dense IDOR/RBAC matrices (`org-rbac`, `org-roles-phase-b`, `invitations`, `admin-users`, notes/items subject isolation, dual-auth, origin/CORS). Mock quality is generally good (inject ports / memory env, not theatre `vi.mock` of auth). Residual risk is **uneven depth outside the classic org/invite matrix**: tasks/uploads lack cross-tenant IDOR cases; package `resolveDualAuth` omits revoked/expired unit cases; magic-link never exercises verify→session; admin user **list** has no staff privacy negative; several service/job tests stay happy-path. Flake risk is low (no real network, no sleeps); local `better-sqlite3` ABI is an env hazard, not assertion flakiness.

**Verdict:** kit bar for auth/RBAC composition is credible; extend CP-IDOR to every new resource (tasks/comments/uploads/admin list) and close package-level dual-auth edge cases so floors do not hide missing negatives.

---

## Test inventory → risk map

### T1 — packages

| File | Approx. cases | Risk / CP map | Negatives? | Notes |
|------|--------------:|---------------|------------|--------|
| `packages/auth/src/keys.test.ts` | ~27 | **T0** CP-AUTH-KEY · SESSION · DUAL | Strong | Dual-auth, BA port, cookies, `createRequireAuth`; no revoked/expired key unit |
| `packages/auth/src/org-roles.test.ts` | 5 | **T0** RBAC pure | Medium | System role ceiling; **no** custom-role fail-closed assert |
| `packages/auth/src/module-grants.test.ts` | 5 | **T0** Phase B grants | Strong | `accessAllows` null deny, `grantsDominate` |
| `packages/core/src/errors.test.ts` | ~12 | CP-ERR | Strong | 5xx scrub, rate limit, Zod fieldErrors |
| `packages/storage/src/index.test.ts` | ~10 | CP-R2 | Strong | Traversal reject + mock presign |
| `packages/api-client/src/index.test.ts` | ~8 | CP-FE-CRED (pkg) | Strong | `credentials: 'include'`, 401 hook |
| `packages/mcp/src/catalogue.test.ts` | ~8 | CP-MCP-* | Strong | Budget before execute, secret scrub |
| `packages/mcp/src/index.test.ts` | ~13 | CP-MCP-SCHEMA · whoami | Strong | SSRF host deny, 401/invalid |
| `packages/flows/src/check.test.ts` | ~40 | ADR-0005 grant∩ | Strong | Hostile parseRunnerView, admin gate |
| `packages/flows/src/grant.test.ts` | ~20 | Grant parse fail-closed | Strong | Strict object, isolation fields |
| `packages/flows/src/authority.test.ts` | ~12 | Intersection property | Strong | Exhaustive ∩ never expands grant |
| `packages/tasks/src/*.test.ts` (6 files) | ~40 | Tasks pure kernel | Strong schema/links | Access helpers thin (3 cases) |
| `packages/comments/src/schema.test.ts` | ~11 | Comments pure | Strong | Visibility audience |
| `packages/email/src/index.test.ts` + `server.test.ts` | ~25 | Email policy | Strong | log banned outside dev, staging allowlist |
| `packages/db/src/index.test.ts` | 2 | D1 helper | Medium | Round-trip + chunk util |
| `packages/types/src/index.test.ts` | 1 | ErrorCode SSOT | Thin | Presence only |
| `packages/i18n/src/index.test.ts` | 1 | Locale engine | Thin | Catalog resolve |
| `packages/ui/src/**/*.test.tsx` + `utils.test.ts` | ~10 | CP-UI-CONTRACT (T2 floor) | Contract traps | Base UI MenuGroup etc. — not auth |

**Packages without dedicated `*.test.ts`:** `packages/config` (presets only — OK). Source modules tested via co-located suites above (auth `session.ts`/`require-auth.ts` covered inside `keys.test.ts`).

### T2 — example-api

| File | Approx. cases | Risk / CP map | Negatives? | Notes |
|------|--------------:|---------------|------------|--------|
| `src/app.test.ts` | ~35 | **T0** dual-auth, CORS, origin, seed gate, notes IDOR, rate limit, modules admin | Strong | Spine suite; god-file size |
| `src/org-rbac.test.ts` | ~17 | **CP-IDOR** · D11 keys · suspended org · super break-glass | Strong | Phase A matrix |
| `src/org-roles-phase-b.test.ts` | 14 | **CP-IDOR** grants · custom roles | Strong | Explicit numbered matrix |
| `src/invitations.test.ts` | ~13 | **CP-IDOR** invites · sk_ deny · BA DENY | Strong | B3 S2 bar met |
| `src/admin-users.test.ts` | ~12 | Platform RBAC · welcome · sk_ | Strong create | **List** super-only happy; no staff privacy IDOR |
| `src/account-self-service.test.ts` | 4 | Password change / name | Strong | Wrong password + no secret leak |
| `src/password-reset.test.ts` | 4 | Reset · no enum · single-use · RL | Strong | |
| `src/magic-link.test.ts` | 4 | Request · no signup mint · RL | Partial | **No verify→cookie path** |
| `src/items.test.ts` | 2 | Subject IDOR CRUD | Strong | Fat combined case |
| `src/tasks.test.ts` | 2 | Org tasks visibility | Partial | Same-org visibility only; fat happy |
| `src/uploads.test.ts` | 4 | Auth + mock presign | Weak IDOR | No B-complete-A |
| `src/audit.test.ts` | 5 | Super audit · sanitize | Medium | sk_ path not asserted |
| `src/rate-limit.test.ts` | 5 | D1 window · concurrent · fail-closed | Strong | |
| `src/services/platform-modules.test.ts` | 7 | Dual-level modules | Medium+ | Enable rejects when unavailable/locked |
| `src/services/modules.test.ts` | 2 | Kit demo module | Happy-lean | |
| `src/jobs-route.test.ts` | 2 | Auth + queue mock | Thin | |
| `src/jobs/demo-handler.test.ts` | 2 | Parse handler | Thin | |
| `src/lib/flows-dogfood.test.ts` | 6 | Compose `@kit/flows` | Strong pure | No HTTP (no route yet — OK) |
| `src/lib/tasks-dogfood.test.ts` | 3 | Import/smoke | Thin | |
| `src/flows-schema.test.ts` | 2 | Composite FK tenancy | Strong | Cross-org run reject |
| `src/seed/seed-db.test.ts` | 3 | Idempotent · env gate | Strong | |
| `src/migrations-apply.test.ts` | 1 | Greenfield SQL | Smoke | |

---

## Evaluation axes

### 1. Auth / RBAC / IDOR coverage

| Area | Status | Evidence |
|------|--------|----------|
| CP-AUTH-KEY (mint/hash/verify/bad) | **Met** | `packages/auth` keys + `app.test` mint/revoke/wrong hash/expired |
| CP-AUTH-SESSION (BA port, cookie flags) | **Met** | BA port unit + Secure cookie outside dev/test in `app.test` |
| CP-AUTH-DUAL (Bearer wins; invalid Bearer ≠ cookie) | **Met** | Package + `app.test` integration |
| CP-IDOR org matrix | **Met** (orgs/roles/invites) | `org-rbac`, `org-roles-phase-b`, `invitations` |
| CP-IDOR subject demos | **Met** (notes/items) | `app.test` notes · `items.test` |
| CP-IDOR tasks/comments | **Partial** | Visibility reader hide internal; **no** cross-org task/comment hop |
| CP-IDOR uploads | **Missing** | Auth only; complete trusts subject prefix without B≠A case |
| CP-UNAUTH protected surface | **Met** (sampled) | `app.test` multi-route 401 list |
| D11 org-bound keys | **Met** in app | Null-org, hop, non-member mint, membership removal |
| Phase B grants ceiling | **Met** | Package pure + HTTP phase-b matrix |
| Admin staff list privacy | **Gap** | Security audit F1 · test only super list happy |
| Magic-link verify | **Gap** | Request side only |

### 2. Happy-path bias

| Suite | Bias | Comment |
|-------|------|---------|
| `org-rbac` / `org-roles-phase-b` / `invitations` / `admin-users` create | Low | Negatives named in titles (403/404/409) |
| `app.test` dual-auth / CORS / seed | Low | Explicit fail-closed cases |
| `tasks.test.ts` | **High** | One mega CRUD test + single 401; reader 403 is only secondary negative |
| `uploads.test.ts` | **High** | Happy mock complete + size validation; no foreign complete |
| `modules.test.ts` / `jobs-*` | **High** | Thin positive paths |
| `magic-link.test.ts` | Medium | Negatives for signup-off and rate limit; no full success verify |
| `flows` package | Low | Adversarial-heavy (forged runnerView, empty permits) |
| `tasks` package pure | Low–medium | Schema/links strong; access helpers smoke-only |

### 3. Missing negative tests (actionable)

1. **Package `resolveDualAuth`:** row with `revokedAt` set → UNAUTHORIZED; `expiresAt` in past → UNAUTHORIZED (integration covers expired plant; package path should pin).
2. **Package org-roles:** `roleAtLeast('custom_lead', 'member') === false`, `roleHasCapability('lead', 'manage_members') === false` (custom ≠ system capability).
3. **Tasks HTTP:** member of org A cannot read/mutate org B task id via wrong `X-Org-Id` or path confusion; missing org header → validation; unauthenticated POST → 401 (only GET unauth today).
4. **Uploads:** subject B complete with A’s `uploadId`/`key` → validation/404.
5. **Admin users GET:** staff session must not see users exclusive to orgs they do not share (or document super-only list + assert staff filter).
6. **Magic-link:** verify with real verification token → session cookie; reused token fails.
7. **Tasks comments:** reader cannot POST comment if write denied; cross-org comment on foreign task id.
8. **Audit:** optional assert sk_ vs session policy once product decides (today sk_ allowed).

### 4. Mock quality

| Pattern | Assessment |
|---------|------------|
| `createMemoryEnv` + real migrations + `createApp()` | **Excellent** — composition tests hit real middleware chain |
| Injected BA `getSession` / `findApiKeyByPrefix` in package | **Excellent** — pure dual-path without BA network |
| `vi.stubGlobal('fetch')` in api-client / mcp whoami | **Good** — boundary-scoped |
| `vi.spyOn(db, 'insert')` rate-limit fail-closed | **Good** — proves no open on D1 error |
| `vi.fn` queue `send` on jobs | **OK** — thin surface |
| `as unknown as D1Database` | **Acceptable** — adapter typing; not logic mock |
| Over-mock of repos/services in route tests | **Rare** — preferred pattern is HTTP to full app |

**Anti-pattern not observed:** blanket `vi.mock('@kit/auth')` or always-200 stubs that hide 401.

### 5. Flaky patterns

| Pattern | Present? | Severity |
|---------|----------|----------|
| Real network / clock sleeps | No | — |
| Order-dependent shared DB across files | Mitigated | Fresh `createMemoryEnv` per test |
| `Date.now()` in unique emails | Yes (`audit`, admin) | **Low** — uniqueness only |
| Concurrent rate-limit test | Yes | **Intentional** race stress; stable if D1 mock serializes |
| `better-sqlite3` ABI after Node major | Env | Documented in testing.md — rebuild, not flaky assert |
| Non-deterministic crypto UUID | Presign/upload | Asserts shape/prefix, not fixed UUID — OK |
| `it.only` / `skip` left in tree | Not found in this pass | — |

### 6. Critical untested / under-tested modules

| Module | Layer | Gap |
|--------|-------|-----|
| `middleware/org-context.ts` | App | Covered only indirectly via suites — OK for integration bar; no isolated matrix for every branch (e.g. header-only org id without path) as unit |
| `middleware/origin-guard.ts` | App | Covered via cookie mutation tests; no exhaustive method matrix file |
| `services/uploads.ts` `completeUpload` | App | Foreign subject / key traversal-ish complete |
| `routes/tasks.ts` comment DELETE | App | No test hits `DELETE /api/tasks/comments/:commentId` |
| `routes/admin-users` list privacy | App | Staff directory scope |
| `resolveDualAuth` revoked/expired | Package | Unit gaps |
| Flows HTTP runner | App | **N/A** — no route yet; pure dogfood + schema FK tests only (honest) |
| Product zip-slip / private_key | Product | Out of kit scope (testing.md) |

---

## Findings

| ID | Severity | File | Finding | Evidence | Recommendation |
|----|----------|------|---------|----------|----------------|
| F1 | P1 | `apps/example-api/src/admin-users.test.ts` · `GET /api/admin/users` | **No CP-IDOR privacy case for staff user directory** | Only `super_admin can list…` happy assert; security review notes `listAdminUsers` is platform-wide for staff | Add: staff cannot see foreign-org-only emails (or assert filter once implemented). Map to CP-IDOR. |
| F2 | P1 | `packages/auth/src/keys.test.ts` · `resolveDualAuth` | **Missing package unit for revoked + expired API key rows** | Code paths L54–55 `require-auth.ts`; tests cover invalid bearer / valid bearer / expired only at app integration | Two unit cases: `revokedAt: 1` and `expiresAt: Date.now()-1` → UNAUTHORIZED even with correct hash. |
| F3 | P1 | `apps/example-api/src/tasks.test.ts` | **Tasks dogfood lacks cross-org IDOR + split negatives** | Single mega-test same `X-Org-Id: org_acme`; reader visibility only; no wrong-org header, no unauth POST | Split: unauth writes, missing org id, cross-org get/patch/delete/comment, sk_ membership hop if applicable. |
| F4 | P2 | `apps/example-api/src/uploads.test.ts` | **Upload complete has no foreign-subject IDOR** | Prefix check in `completeUpload` uses `subject`+`uploadId`; never tested with second user | User A presign → user B complete same `uploadId`/key → expect 4xx. |
| F5 | P2 | `apps/example-api/src/magic-link.test.ts` | **Magic-link verify → session cookie path untested** | Request stores verification + RL + no user mint; no `magic-link/verify` success | Extract token from verification table (test-only) → GET verify → Set-Cookie → `/api/me`. |
| F6 | P2 | `packages/auth/src/org-roles.test.ts` | **Custom role strings not assert fail-closed on system capabilities** | `roleAtLeast` returns false for non-system (`org-roles.ts` L17–19) but tests only system keys | Explicit: unknown/`lead` never pass `manage_members` / `roleAtLeast(_, 'admin')`. |
| F7 | P2 | `packages/auth` + product contract | **No package test documenting D11 null-`organizationId` footgun** | Package returns auth when hash matches with `organizationId: null`; app `findKeyRecord` denies | Unit: valid hash + null org still returns identity at package layer **+** comment/checklist that apps must deny; optional `requireOrgBoundKey` later. |
| F8 | P2 | `apps/example-api/src/tasks.test.ts` · routes | **Comment DELETE route unexercised** | Route `DELETE /api/tasks/comments/:commentId` exists; suite only POST/list comments | Add delete happy + 404 foreign comment / 403 reader. |
| F9 | P2 | `apps/example-api/src/services/modules.test.ts` · `jobs-route.test.ts` | **Happy-path-lean non-security services** | 2+2 cases; jobs only auth+enqueue | Accept while demo; when product-critical, add failure modes (queue missing, invalid body). |
| F10 | P3 | `apps/example-api/src/app.test.ts` | **God-file suite (~35 cases)** | Harder to map failures to CP-IDs; still green composition proof | Optional split: `auth.contract.test.ts` / `cors.origin.test.ts` / `notes.idor.test.ts` per testing.md hygiene (no behavior change). |
| F11 | P3 | `packages/types` · `i18n` | **Presence-only package tests** | 1 case each | OK for low risk; raise only when codes/catalogs gain security surface. |
| F12 | P3 | Flake ops | **`better-sqlite3` ABI after Node upgrade** | testing.md documented | Keep rebuild note in PR template / agent session checklist — not a suite bug. |

---

## Metrics

- **Files reviewed:** ~45 test modules (≈22 package + ≈23 example-api) + middleware/services/routes for gap analysis
- **Approx. test cases:** packages ~240 `it(` · example-api ~152 `it(`
- **Issues:** P0=0 · **P1=3** · **P2=6** · **P3=3**
- **Notable hotspots:**
  - Strong: `org-rbac.test.ts`, `org-roles-phase-b.test.ts`, `invitations.test.ts`, `packages/auth/keys.test.ts`, `packages/flows/*`
  - Thin/risk: `tasks.test.ts`, `uploads.test.ts`, `magic-link.test.ts` (verify), admin users **list**, package revoked/expired dual-auth
- **Mock posture:** inject + memory env preferred; few spies
- **Flake posture:** low

---

## Recommendations

1. **P1 first:** staff list IDOR (or product filter) + package revoked/expired dual-auth units + tasks cross-org CP-IDOR split.
2. **Extend CP-IDOR checklist** for every new protected resource (testing.md already states this): tasks/comments/uploads/admin list before claiming matrix complete.
3. **Magic-link verify** dogfood once BA verification rows are readable in test DB — closes auth feature hole without e2e browser.
4. **Keep** full-app integration style; do not replace with repo mocks for auth/RBAC.
5. **Do not lower** T0 floors to green gaps; add cases instead (docs/testing anti-slogan).
6. Optional hygiene: split `app.test.ts` by CP concern; pin custom-role fail-closed in `org-roles.test.ts` (cheap).

---

## CP-* quick scorecard (this partition)

| CP | Package unit | example-api | Notes |
|----|--------------|-------------|--------|
| CP-AUTH-KEY | ✅ | ✅ | |
| CP-AUTH-SESSION | ✅ | ✅ | |
| CP-AUTH-DUAL | ✅ | ✅ | |
| CP-IDOR | n/a pure | ✅ orgs/invites/notes/items · ⚠️ tasks/uploads/admin list | |
| CP-UNAUTH | ✅ mw | ✅ | |
| CP-ERR | ✅ core | ✅ envelope | |
| CP-CORS / origin | n/a | ✅ | |
| CP-SECRET | n/a | ✅ getSecret / BA prod | |
| CP-R2 | ✅ storage | ⚠️ uploads IDOR | |
| CP-MCP-* | ✅ | n/a (mcp-example out of T2) | |

---

## If clean areas (no finding)

- Flows pure grant∩ + runnerView adversarial tests are exemplar quality for incubating packages.
- Invitations + Phase B role matrices meet named ≥8-case bars from testing.md.
- Rate-limit D1 fail-closed + concurrent under-count defense are present.
- Seed env gate and production no-auto-seed covered.
