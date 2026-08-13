# Code Review — B1–B4 re-review

**Date:** 2026-08-12  
**Range:** `0348160...HEAD` (`275c6b2` only)  
**Note:** `origin/main...HEAD` empty (already pushed); reviewed last unreviewed fix commit  
**PR:** none  
**|Δ|:** 16 files  
**Agents:** security · adversarial · tester · backend · frontend · architect  

## Verdict

### **Request changes**

Runtime controls for B1/B3/B4 look correct. Merge (or treating the audit series as closed) is blocked on a **false-closure of the B2 test proof**:

| ID | Finding | Agents | C | Blocks? |
|----|---------|--------|---|---------|
| **B2** | `keys-list.test.ts` is a **test-tautology** vs pure deletion of `if (!org) return []` — fixtures only have `org_acme`/`org_beta`; `eq(organizationId, '')` still yields `[]` | tester · adversarial · security (nit) | 82–92% | **yes** |
| **B3 residual** | Subject Unicode scrub is SMTP (+ templates) only; CF / Resend / staging prefix pass subject raw | adversarial · security · backend | 78–86% | soft (see below) |

**Closed cleanly:** **B1** (`createPresignedUrl` undeprecated).  
**Closed with residual:** B3 transport, B4 fleet-wide `fieldErrors` habit.

---

## Blockers

### B2 — empty-org keys list test does not pin early-return

```
issue(blocking): empty-org list test is tautological vs pure fail-closed arm deletion
  apps/example-api/src/repos/keys-list.test.ts:36
  apps/example-api/src/repos/keys.ts:52-54
  -- tester · adversarial
  Root cause: Fixtures never insert organizationId === ''. Deleting `if (!org) return []`
  leaves `eq(organizationId, '')` after trim → still [] → suite stays green. Test *does*
  catch the worse “empty → unscoped list all” redesign, but does not prove the priced early-return.
  Class: [test-tautology]
  Raw callsites: [
    {file: apps/example-api/src/repos/keys.ts, line: 54},
    {file: apps/example-api/src/repos/keys-list.test.ts, line: 36},
    {file: apps/example-api/src/repos/keys-list.test.ts, line: 40}
  ]
  Solutions:
    1. Seed a row with organizationId: '' (schema allows); assert empty/whitespace opts still
       return [] *despite* that row (recommended).
    2. Extract pure guard / spy that scoped query is never issued when org is blank.
  Confidence: 90%
```

---

## Warnings (non-blocking if B2 fixed; do not re-claim kit-wide)

| ID | Finding | Agents | C |
|----|---------|--------|---|
| **W1** | CF / Resend / `prefixStagingSubject` do not scrub Unicode line breaks on subject (parallel-path-drift) | security · adversarial · backend | 78–86% |
| **W2** | Staging allowlist `last-@` vs SMTP exact-one-`@` | adversarial | 80% |
| **W3** | `loginErrorMessage` is UI-only anti-enum; wire status still differs | adversarial · frontend | 88% |
| **W4** | B4 residual: other services still flat/`issues`/message-only validation details | adversarial · backend · architect | 84% |
| **W5** | Template scrub regex duplicated (DRY); no InviteEmail unit test for LS | tester · architect · backend | — |
| **W6** | login 403 `ApiError` path half-tested; post-auth `/api/me` shares catch → misleading copy | frontend · tester | — |

---

## Praise

| Topic | Agents |
|-------|--------|
| B1 storage deprecation axis coherent + README | architect · backend · security |
| SMTP LS scrub + multi-`@` tests non-tautological | tester · backend |
| `loginErrorMessage` call-site isolation (password sign-in only) | frontend |
| Service `fieldErrors` matches `parseOrThrow` / core wire | backend |
| Dogfood presign via `StorageClient.key` | architect |

---

## CLOSED matrix (this re-review)

| ID | Claim | Status |
|----|--------|--------|
| **B1** | `createPresignedUrl` not deprecated | **CLOSED** |
| **B2** | empty-org unit test pins fail-closed | **OPEN** — control OK, proof tautological |
| **B3** | Unicode subject scrub | **PARTIAL** — SMTP+templates proven; CF/Resend open |
| **B4** | service `{ fieldErrors }` | **PARTIAL** — 3 sites fixed; no fleet lock / no service test |

---

## Secret scan

∅ (no credential assignments in range)

## Phase 6

Skipped — no open PR on `main`

## Recommended fix order

1. **B2** — restructure `keys-list.test.ts` (seed `organizationId: ''` row) — ~15 min  
2. Optional: shared `scrubEmailHeader` on EmailPort (W1)  
3. Optional: `apiErr(403, 'FORBIDDEN')` in login tests (W6)  
