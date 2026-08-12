# Code Review — quality-audit fixes (local main)

**Date:** 2026-08-12  
**Range:** `origin/main...HEAD`  
**Commits:** `9068154` · `974db22`  
**PR:** none (local main only)  
**|Δ|:** 59 files (30 audit artifacts + 29 code) — **warn** >50; review focused on code slice  
**Agents:** security-auditor · adversarial · architect · backend-dev · frontend-dev · tester · devops  

## Verdict

### **Request changes**

Not a “roll back the security work” signal — dogfood example-api is materially safer. Residual **control shape** and **test gaps** on claims we just shipped need a follow-up before treating staff directory + D11 package surface as production-complete.

---

## Blockers

### B1 — Staff list: scope after global pagination
**Label:** `issue(blocking):`  
**Agents:** backend-dev (92%), architect (88%), adversarial (88%), tester (90%)  
**Where:** `apps/example-api/src/services/admin-users-list.ts:32-59`

Privacy holds (solo/super filtered out). **Contract is wrong:** `limit`/`offset`/`q` apply to the full BA table first, then staff filter — pages can be empty while co-members exist.

**Root cause:** Authorization layered on top of unscoped page.  
**Fix:** Resolve allowed user IDs (or membership join) **before** LIMIT/OFFSET; add test with many out-of-scope users ahead of in-scope + `limit=1`.

---

### B2 — `requireApiKeyOrganization` defaults fail-open
**Label:** `issue(blocking):` / `suggestion(blocking):`  
**Agents:** adversarial (93%), security (82%), architect (82%), backend (78%)  
**Where:** `packages/auth/src/require-auth.ts:40,69` · example-api sets `true` at `middleware/require-auth.ts:36`

example-api is dual-fail-closed. **Product injects** that omit the flag + naïve `findApiKeyByPrefix` re-open subject-global keys. Package test freezes the legacy-on path.

**Root cause:** Safe multi-tenant polarity is opt-in.  
**Fix (pick one):** default `true` + named escape; or rename to `allowUnboundApiKeys` default false; + product playbook / CI check.

---

### B3 — `getMeProfile` D11 filter fail-open without `keyOrganizationId`
**Label:** `issue(blocking):` / `suggestion:`  
**Agents:** adversarial (90%), security (72%), tester (93% on missing test)  
**Where:** `apps/example-api/src/services/me.ts:39`

If `authMethod === 'api_key'` and `keyOrganizationId` missing → **full org list**. Hard to hit with example-api inject today; layer is not fail-closed.

**Fix:** if `api_key` and !keyOrg → empty orgs or 401. **Test:** multi-membership staff + acme-bound sk_ → `me.orgs` only acme.

---

## Warnings (non-blocking but high value)

| ID | Finding | Agents | C |
|----|---------|--------|---|
| W1 | Staff **create** still platform-wide email existence oracle (`conflict`) while list is scoped | security | 88% |
| W2 | SMTP DATA body / address shape residual (envelope CR/LF fixed; body terminator + non-addr garbage) | security, adversarial, backend | 74–86% |
| W3 | SMTP test `.not.toMatch(/[\r\n]/)` on split lines is **tautological** | tester | 95% |
| W4 | `GET /api/keys` not D11-scoped for Bearer | security | 76% |
| W5 | Tasks/comments `isError` UX has **zero** RTL tests | frontend, tester | 88–90% |
| W6 | PlatformGate tests thin (no super_admin; brittle copy regex) | frontend, tester | 72–86% |
| W7 | N+1 admin list (members + platform roles) | architect, backend | 75–88% |
| W8 | MCP deprecated export hard-remove = minor fleet footgun | adversarial | 78% |

## Suggestions / nits

- Comments panel `loading` non-visual; stages silent; a11y alert/label/row keyboard  
- Redundant platformRole check on admin list route  
- Document `tools/` in product-consumer contract  
- Runner auto-discover packages with vitest coverage configs  
- residual KitRole on `/api/me`

## Praise

| Area | Note |
|------|------|
| Staff list privacy intent + IDOR test | Real negative on solo/super |
| D11 example-api dual path | flag + findKeyRecord membership recheck |
| SMTP envelope CR/LF + empty fail-closed | Good regression intent |
| MCP schema → budget → execute(parsed) | INVALID_ARGUMENTS solid |
| `services/me` R5 extract | routes ↛ repos |
| zero-edit `tools/` · api-client coverage · DEBT tag | Devops clean |
| safePostAuthPath matrix · dead shim removal | FE hygiene |

## Secret scan (Phase 1.5)

∅ real secrets. One grep hit in audit markdown prose about `SECRET_QUERY` (not a credential).

## Spec compliance (Phase 2)

Skipped — no issue-linked branch / no `artifacts/specs/*` for this work.

## Phase 6

Skipped — no open PR on `main`.

---

## Recommended fix order

1. **B3** me D11 fail-closed + integration test (small, high claim integrity)  
2. **B1** staff list query-before-page (+ limit=1 test)  
3. **B2** flip or re-document package default (semver-aware)  
4. W1 create oracle · W3/W5 tests · W2 SMTP harden as capacity allows
