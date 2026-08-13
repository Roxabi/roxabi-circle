# Code Quality Audit Summary — roxabi-boilerplate-cf

**Date:** 2026-08-12  
**Playbook:** multi-agent-audit adapted Chemin A (~28 agents)  
**Scale:** ~317 TS source · 63 tests

---

## Executive Summary

The Chemin A CF kit is a **shippable, extractible multi-tenant capability kernel** with a clean structural axis (packages ↛ apps, banlist/extract green, 0 product domain in packages). Runtime security posture for dogfood is **strong**: BA-only sessions, dual-path Bearer-preferred fail-closed, org-bound `sk_` recheck in example-api, IDOR matrices on orgs/roles/invites, AppError 5xx scrub, MCP ping/whoami least-privilege. Residual risk is **footguns and incomplete surfaces**, not active bypasses: product inject without D11, SMTP envelope CR/LF, staff platform-wide user list, incubating N×M (tasks↔comments ACL, role matrices), R5 layer leak on `/api/me`, and process holes (`tools/` zero-edit, empty dogfood evidence, Dependabot auto-`reviewed` on Free private). **No P0.**

**Security:** Strong crypto/session/key path; highest live risks = SMTP envelope injection (Node path) + staff directory scope + package-vs-compose D11 gap.

**Kit extractibility:** Machine bar met (banlist · extract-dry-run · zero-edit kit mode). Claim incomplete on evidence docs + `tools/` protection + banlist lexicon width.

**Tests:** T0 auth/RBAC composition credible (org-rbac, phase-b, invitations, dual-auth). Gaps: tasks/uploads IDOR depth, admin list privacy, magic-link verify, PlatformGate / `safePostAuthPath`, `@kit/api-client` absent from coverage runner. Web floors intentionally low (contract-first).

**Debt:** Zero bare TODO/FIXME; near-zero suppressions; HMAC SessionPort + dual PBKDF2 residue; god-file exemptions tight on headroom; soft `debt:check` / `agents-adr` warn-only.

---

## Critical Issues (P0)

**None.**

Machine extractibility green; no confirmed auth bypass, secret leak to client, or product-domain contamination under packages/examples.

---

## High Priority (P1)

| ID | Area | Finding | Primary evidence | Recommendation |
|----|------|---------|------------------|----------------|
| U-01 | Security · email | **SMTP envelope CR/LF injection** on `MAIL FROM`/`RCPT TO` | `packages/email/src/server.ts` — DATA scrubbed, envelope raw | Scrub/validate addr before envelope; negative test with `\r\n` |
| U-02 | Security · API | **Staff can list full platform user directory** (emails) | `services/admin-users.ts` `listAdminUsers` unscoped; no staff IDOR test | Filter staff to shared-org users; CP-IDOR case |
| U-03 | Security · auth | **D11 org-bound keys not enforced in `@kit/auth`** — only in example-api inject | `resolveDualAuth` accepts null `organizationId`; dogfood `findKeyRecord` denies | Product inject recipe + optional `rejectUnboundApiKeys`; schema → NOT NULL later |
| U-04 | Axial · smells | **tasks↔comments visibility/Audience twins** + **role allowlists** forked vs `@kit/auth` / module grants | `visibility.ts`/`audience.ts` mirrors; tasks `canWrite*` unused (routes use `requireModule`) | Extract shared ACL once; collapse or deprecate tasks role helpers; module grant = sole power path |
| U-05 | Axial · arch | **R5: `routes/me.ts` imports repos**; import-boundary does not enforce R5 | Only route→repo leak; gate R1–R4 only | `services/me` (or user-shell); optional R5 gate |
| U-06 | Extractibility | **`tools/` not zero-edit protected**; **B5 dogfood evidence empty** while AGENTS claims permanent greenfield | `config/zero-edit-zones.json`; `docs/product-consumer-dogfood-evidence.md` all `(fill)` | Add `tools/` prefix; fill evidence or demote AGENTS claim |
| U-07 | Errors · types · MCP | **MCP `registerAll` never `safeParse`s `tool.input`** → wrong agent codes / `any` execute | `packages/mcp/src/catalogue.ts` budget→execute only | Input safeParse → `INVALID_ARGUMENTS`; type execute as `unknown` |
| U-08 | Errors · web | **Tasks list (and comments panel) render query failure as empty success** | `tasks.tsx` no `isError` before Empty | Mirror notes `isError` + retry; regression test |
| U-09 | Axial · platform | **Org HTTP spine (`requireOrgContext` / module / rate-limit / audit) only in example-api** | ~200 LOC middleware; pure roles in `@kit/auth` | Promote port-based org middleware **before** second product compose (D2) |
| U-10 | Test quality | **Critical coverage holes:** PlatformGate, `safePostAuthPath`, tasks cross-org IDOR, admin list privacy, package dual-auth revoked/expired | T2/T3 reports | Unit matrices + split tasks IDOR; do not claim CP-IDOR complete |
| U-11 | Test strategy | **`@kit/api-client` has floors/tests but is absent from `test-coverage.sh`** | Gate = coverage runner only; package never runs in validate:full | `run_pkg packages/api-client` + runner⊇workspace self-check |
| U-12 | CI hygiene | **Dependabot auto-labels `reviewed`** + Free private **no branch protection** (process merge fabric) | `dependabot-automerge.yml` + merge-on-green | Distinct deps label / human-only `reviewed`; document residual |

**Also seen in (dedup notes):** U-04 ≈ axial AD-S1/S2, smells-incubating F1/F2 · U-05 ≈ structural S-01, arch P5-P6 F1, smells-apps F5 · U-06 ≈ KE-01/02, arch P7 F2, debt-ci F8 · U-07 ≈ errors-packages F2, types-packages F1 · U-02 ≈ sec-api F1, test-T1T2 F1.

---

## Medium Priority (P2)

Top 15 clustered (unique themes):

| ID | Area | Finding | Primary evidence | Recommendation |
|----|------|---------|------------------|----------------|
| M-01 | Auth residual | HMAC-era `SessionPort` (`sign`/`verify`/`secret`) + dual kit PBKDF2 vs BA crypto + `SESSION_SECRET` residual | auth package · seed dual-write | Narrow port to BA-only; demote/un-export kit password KDF; drop dead secret |
| M-02 | Storage | Free `put/get/delete` + unprefixed presign = tenant isolation footgun | `packages/storage` | Prefer/only `StorageClient`; document key-from-client rule |
| M-03 | Migrations | Package SQL sketches (flows timestamps text vs applied integer) + auth dual-copy | `packages/*/migrations` vs `example-api/migrations` | One applied SSoT; sketch banner/CI or delete sketch bodies |
| M-04 | MCP↔flows | Parallel tool registries + dual `stableStringify` (different algorithms) | mcp catalogue vs flows registry/digest | Promote checklist; rename stringify; no third registry |
| M-05 | Domain errors | No kit map `StorageError`/`PlanYamlError`/email bare `Error` → AppError (wrong 500 status) | errors-packages F1 | Service-layer map recipe; PATH_TRAVERSAL → 400 |
| M-06 | API typing | `DEMO_QUEUE` off `Env`/`WORKER_BINDINGS`; queue/scheduled `unknown` env; always-ack demo | env.ts · index.ts · jobs | Type `ExportedHandler<Env>`; document ack vs retry product policy |
| M-07 | Web types | `useParams`/`useSearch` `strict: false` + casts; forms without Zod (tasks/admin/invite); `apiFetch<T>` trust-server | org-members, reset, invite-accept | `from:` route typing; Zod on dogfood forms; document FE optimistic types |
| M-08 | Validation UX | VALIDATION `details` shape inconsistent (`fieldErrors` vs raw flatten); FE never maps server fieldErrors | parseOrThrow vs orgs/admin routes | Standardize parseOrThrow; FE `apiDetailsToFieldErrors` |
| M-09 | BA auth UX | Non-kit BA envelopes → raw `HTTP {status}` on login/forgot/magic | api-client + login surfaces | Share account-errors status→catalog map |
| M-10 | Showcase / demos | Prod `ALLOW_PUBLIC_SIGNUP=true`; notes/items/uploads **subject-scoped** not org; selective rate limits | wrangler prod · demo routes | Showcase-only docs; label demos; rate-limit presign/org create |
| M-11 | God surfaces | design-system ~944, org-members ~576, notes ~490, orgs route ~321, org-roles ~326 (tight exemption headroom) | file_exemptions | Split before raise caps; tasks pattern for panels |
| M-12 | UI kit | Public `AppSidebar` Acme sample + EN-hardcoded shell chrome (unused by example-web) | packages/ui | Prop-drive / unexport sample; labels props |
| M-13 | Extract gates | Banlist narrow vs frame tokens; zero-edit misses root tsconfig/workflows; exceptions example missing `version: 1` | banlist · zones · exceptions.example | Extend compounds; zone parity; fix example |
| M-14 | Soft gates | `debt:check` / `agents-adr` warn/exit 0 (1 untagged ignore; 7 bare ADR refs) | debt-tracking · AGENTS | Tag ignore; link ADRs; flip fail when clean |
| M-15 | Email / SPA residual | Resend error embeds provider body in logs; SPA no CSP (session-riding XSS residual); plaintext `sk_` 60s mint window; MCP hosts expand via env | email index · web assets · keys.tsx · mcp | Stable internal errors; SPA CSP recipe; pin MCP hosts; accept mint TTL residual |

---

## Low Priority (P3)

Top 10 themes (not every P3):

1. **Dead shims:** `HomePage`, `AdminGate`/`isAdmin`, MCP deprecated aliases, `findApiKeyByHash`, `ensureDemoUser`, tasks unused hooks/AudiencePort.
2. **Cookie builder** string-replace brittleness; non-hex digest reject; optional constant-work key verify.
3. **api-client:** new client per `apiFetch`; `ApiError.code: string`; non-envelope → bare `Error`.
4. **Email DRY:** 5× `escapeHtml`; MagicLink re-export asymmetry; EN-only “Kit kit” copy.
5. **createDb** `unknown`/`as never`; free storage prefix constructor inconsistency; key length/controls.
6. **~90×** `c.get('db')!` / `subject!` after middleware — prefer guarded helpers.
7. **Rate-limit comments** still say “in-memory”; queue always-ack dead catch path.
8. **CP inventory lag** vs live RBAC/flows/tasks suites; no `test:critical` filter; e2e no nightly.
9. **Three ops trees** scripts/tools/tooling cognitive load; deny-upstream naming drift in docs.
10. **Hygiene:** `safePostAuthPath` already under U-10; leftover bare `Error` throws on presign/R2; file-length exemptions for shadcn shells (accept).

---

## Axial Drift Summary

| Axis check | Result | Notes |
|------------|--------|-------|
| packages ↛ apps (import-boundary R1–R2) | **Green** | 0 violations · 260 files |
| banlist / extract-dry-run | **Green** | mode=kit · 0 orphan packages · 0 product apps in tree |
| Deep `@kit/*/…` forking | **Clean** | Public barrels only |
| Package sibling DAG | **Clean** | types←core/api-client; auth←core; mcp←auth; pure leaves |
| Secondary R5 routes ↛ repos | **1 leak** | `routes/me.ts` only |
| Product domain under packages | **None** | banlist + scan |
| Local AppError / forked auth stack | **None** | apps compose `@kit/core` / `@kit/auth` |
| Gate honesty | **Partial** | R5 unenforced; tests skipped; file-wide exemptions unused |

### Confirmed N×M traps

| Trap | Siblings | Severity |
|------|----------|----------|
| Object ACL visibility + Audience | `@kit/tasks` ↔ `@kit/comments` | **P1** |
| System role allowlists | tasks access ↔ flows access ↔ `@kit/auth` org-roles | **P1** |
| `stableStringify` (name clash, different algos) | `@kit/mcp` ↔ `@kit/flows` | **P2** |
| Tool catalogue / registry | MCP vs flows | **P2** (incubating intentional) |

**Probable drift (second product):** copy `requireOrgContext` / rate-limit / audit / security-headers; apply package sketch SQL; adopt tasks role helpers *instead of* module grants; MCP effectful tools without grant∩.

---

## Metrics Dashboard

| Domain | P0 | P1 | P2 | P3 | Notes |
|--------|---:|---:|---:|---:|-------|
| Axial drift (struct+semantic) | 0 | 5 | 7 | 4 | N×M + R5 + org spine |
| Architecture (P1–P8) | 0 | 0 | 16 | 24 | Layering + UI sample + god routes |
| Security (4 slices) | 0 | 3 | 22 | 18 | SMTP, staff list, D11 footgun |
| Code smells | 0 | 2 | 24 | 24 | Twins + god pages + HMAC residue |
| Type safety | 0 | 6 | 14 | 15 | Env, route hooks, MCP any, apiFetch |
| Workers / async | 0 | 0 | 3 | 4 | Always-ack · Env · BA CPU |
| Error handling | 0 | 3 | 10 | 11 | Domain map · tasks empty · BA UX |
| Test quality (T1–T4) | 0 | 8 | 16 | 8 | IDOR gaps · coverage runner · CP lag |
| Tech debt + CI | 0 | 2 | 12 | 18 | Dependabot · soft gates · showcase |
| Kit extractibility | 0 | 2 | 4 | 3 | tools/ · evidence · banlist |
| **Raw sum (overlap)** | **0** | **~31** | **~128** | **~129** | **not unique** |
| **Unique after dedup (est.)** | **0** | **12** | **~28** | **~45** | Cross-domain collapse |

| Metric | Value |
|--------|-------|
| Files analyzed | ~317 TS source |
| Test files | ~63 |
| Agents | 28 (+ wave 0 machine) |
| Machine gates | import-boundary / banlist / extract **green** |
| Production `any` / `as any` in apps | **0** |
| Production `any` in packages | **2** (MCP FastMCP boundary, tagged DEBT) |
| Packages | 14 · all dogfooded |
| Example apps | 3 |

---

## Technical Debt Score

Calibrated to playbook scale (Lyra reference: 6 P0 / 19 P1 → **72/100**). A raw linear −5×P1 over-punishes multi-domain theme audits (same residual counted once already in unique P1).

| Step | Calc |
|------|------|
| Start | 100 |
| P0 × −8 | 0 × −8 = **0** |
| P1 unique × −1.5 | 12 × −1.5 = **−18** |
| P2 unique × −0.4 (cap 12) | ~28 × −0.4 = −11.2 → **−11** |
| P3 unique × −0.1 (cap 5) | ~45 × −0.1 = −4.5 → **−5** |
| Bonus machine extractibility green | **+3** |
| Bonus zero prod `any`/`as any` in apps | **+2** |
| Bonus 0 P0 on security/auth dual-path | **+2** |
| **Total** | 100 − 18 − 11 − 5 + 7 = **73** |

| Score | Band |
|------:|------|
| **73/100** | **B — shippable kit dogfood** |
| 85+ | Ready for second product compose with low copy-paste tax |
| 55– | Hold platform growth; fix P0/P1 first |

**Path to 85:** close U-01–U-08 + U-11 (~+10) and extract ACL twin U-04 (~+2).

**Narrative grade:** **B / shippable kit** — security crypto strong; residual = footguns, incubating DRY, Free-org process, test depth on new resources.

---

## Top 10 Quick Wins

| # | Effort | Win | Closes |
|---|--------|-----|--------|
| 1 | 15 min | Tag `input-group.tsx` biome-ignore `DEBT:…` | soft debt noise |
| 2 | 30 min | Scrub SMTP envelope CR/LF + test | U-01 |
| 3 | 30–45 min | `services/me` — remove route→repo | U-05 |
| 4 | 15 min | Add `tools/` to zero-edit `protected_prefixes` | U-06 |
| 5 | 20 min | Tasks/comments `isError` UI + toast | U-08 |
| 6 | 20 min | `run_pkg packages/api-client` in coverage runner | U-11 |
| 7 | 30 min | `safePostAuthPath` + `PlatformGate` unit matrices | U-10 |
| 8 | 15 min | Delete dead shims (`HomePage`, `AdminGate`, MCP aliases, …) | P3 dead surface |
| 9 | 45 min | MCP input `safeParse` in `registerAll` | U-07 |
| 10 | 30 min | Dependabot: stop sole use of human `reviewed` label | U-12 |

---

## Recommended Action Plan

### This week
1. **Security:** U-01 SMTP envelope; U-02 staff list scope (+ test); document U-03 D11 inject recipe.
2. **Layering:** U-05 me service.
3. **Extract/process:** U-06 `tools/` + honest dogfood evidence (or uncheck AGENTS).
4. **UX bug:** U-08 tasks empty-on-error.
5. **Gates:** U-11 api-client coverage; DEBT tag (M-14).

### This sprint
1. **Axial:** U-04 extract shared audience/visibility; deprecate unused tasks access helpers.
2. **MCP:** U-07 input parse; rename dual `stableStringify` (M-04).
3. **Tests:** U-10 tasks cross-org IDOR, dual-auth revoked/expired units, magic-link verify path.
4. **Auth residue:** M-01 SessionPort narrow + dual password demote.
5. **CI:** U-12 humanize merge labels; banlist harden (M-13).
6. **God files:** split org-roles / orgs route / org-members before next feature (M-11).

### Next quarter
1. **U-09** promote org middleware ports before **second product compose** (platform D2).
2. **Flows runner** (#29–#31): D1 lifecycle + grant mint; align sketch SQL (M-03); MCP grant∩ parity only after runner evidence.
3. **Schema** `api_keys.organization_id` NOT NULL; ADR-0006 key format when secret-scan pain warrants.
4. **SPA CSP** recipe; storage free-helper deprecation (M-02); optional `@kit/rate-limit` only at 2nd call site.
5. Soft gates → fail mode; CP inventory refresh (T4); optional non-gating weekly e2e.
6. Audience/ACL package if third consumer — three-strikes, not early.

**Priority alignment:** P0 kit extractibility + auth security first · incubating flows/tasks DRY before second product compose · no empty `@kit/agents` / rate-limit shells.

---

## Non-claims

This audit did **not** prove:

| Claim | Reality |
|-------|---------|
| Full `validate:full` green at audit time | Wave 0 only: import-boundary · banlist · extract · debt/agents **warn** |
| Production penetration test / live XSS exploit | Read-only static + design review |
| Platform JTBD D2/D3 met | platform-proof still not met; flows schema without lifecycle; no HITL create-run |
| Branch protection / required checks | Free private — process only |
| CP-IDOR complete for all resources | tasks/uploads/admin list incomplete |
| Magic-link verify → session E2E | Request-side tests only; e2e uses evaluate fetch not form |
| MCP effectful tools under grant∩ | Catalogue metadata non-authoritative by design |
| Product consumer zero-edit permanent greenfield | Evidence template empty |
| Soft debt/ADR gates as hard CI | warn/exit 0 by default |
| Secrets / `.dev.vars` values | Intentionally unread |

---

## Artifact index

| Path |
|------|
| [`STRATEGY.md`](./STRATEGY.md) |
| [`manifest.json`](./manifest.json) |
| [`AGENT_PROMPTS.md`](./AGENT_PROMPTS.md) |
| [`axial-drift/machine-baseline.md`](./axial-drift/machine-baseline.md) |
| [`axial-drift/structural.md`](./axial-drift/structural.md) |
| [`axial-drift/semantic-adr-review.md`](./axial-drift/semantic-adr-review.md) |
| [`architecture/P1-P2-core-auth.md`](./architecture/P1-P2-core-auth.md) |
| [`architecture/P3-P4-data-ui.md`](./architecture/P3-P4-data-ui.md) |
| [`architecture/P5-P6-flows-api.md`](./architecture/P5-P6-flows-api.md) |
| [`architecture/P7-P8-web-tooling.md`](./architecture/P7-P8-web-tooling.md) |
| [`security/auth-package.md`](./security/auth-package.md) |
| [`security/example-api.md`](./security/example-api.md) |
| [`security/storage-email-db.md`](./security/storage-email-db.md) |
| [`security/web-mcp.md`](./security/web-mcp.md) |
| [`code-smells/saas-packages.md`](./code-smells/saas-packages.md) |
| [`code-smells/incubating-packages.md`](./code-smells/incubating-packages.md) |
| [`code-smells/apps.md`](./code-smells/apps.md) |
| [`type-safety/packages.md`](./type-safety/packages.md) |
| [`type-safety/example-api.md`](./type-safety/example-api.md) |
| [`type-safety/example-web.md`](./type-safety/example-web.md) |
| [`workers-async/report.md`](./workers-async/report.md) |
| [`error-handling/packages.md`](./error-handling/packages.md) |
| [`error-handling/apps.md`](./error-handling/apps.md) |
| [`test-quality/T1-T2-packages-api.md`](./test-quality/T1-T2-packages-api.md) |
| [`test-quality/T3-example-web.md`](./test-quality/T3-example-web.md) |
| [`test-quality/T4-strategy.md`](./test-quality/T4-strategy.md) |
| [`tech-debt/scan.md`](./tech-debt/scan.md) |
| [`tech-debt/ci-hygiene.md`](./tech-debt/ci-hygiene.md) |
| [`kit-extractibility/report.md`](./kit-extractibility/report.md) |
| [`AUDIT-SUMMARY.md`](./AUDIT-SUMMARY.md) *(this file)* |

---

*Synthesis · wave 9 · 2026-08-12 · read-only consolidation · Chemin A multi-agent quality audit*
