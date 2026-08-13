# Code Review — residuals + mechanical backlog

**Date:** 2026-08-12  
**Range:** `d1fdba7..HEAD` (`45534d2` + `0348160`)  
**Note:** `origin/main...HEAD` empty (already pushed); reviewed unreviewed commits  
**PR:** none  
**|Δ|:** 34 files  
**Agents:** security · adversarial · backend · frontend · tester · architect  

## Verdict

### **Request changes**

No Critical runtime hole on D11 keys/list as wired. Merge blocked on **false-closure / contract** items:

| ID | Finding | Agents | C |
|----|---------|--------|---|
| **B1** | `createPresignedUrl` must **not** be `@deprecated` (canonical signer entrypoint) | architect | 95% |
| **B2** | `listApiKeysForSubject` empty/`''` org → `[]` has **no** unit test | tester · adversarial | 82–86% |
| **B3** | SMTP **Subject** (and template org-derived subjects) still only scrub CR/LF — Unicode NEL/LS residual | adversarial | 86% |
| **B4** | Service-layer validation still flat maps (`{ email: [] }`) not `{ fieldErrors }` | adversarial · backend nit | 88% |

## Warnings

| ID | Finding |
|----|---------|
| W1 | Envelope “one @” is overclaim (`includes` not exactly-one) |
| W2 | `loginFailed` is copy fix; BA 400 vs 401 may still enumerate if provider differs |
| W3 | `mapStorageError` unit-only (wire untested) — leak already scrubbed by toApiErrorBody |
| W4 | safePostAuth 8-iter soft edge; org-switcher Zod error copy for slug max |
| W5 | Demo queue always-ack is prose-only footgun |

## Praise

SMTP envelope + DATA dot-stuff · keys fail-closed design · StorageError map · fieldErrors on **routes** · login 401 ≠ session expired · iterative %decode · task row keyboard · admin N+1 batch · dual-KDF seed docs · free put/get/delete deprecate · ADR-0002 D3 · tasks barrel deprecate

## Secret scan

∅  

## Phase 6

Skipped — no PR  

## Recommended fix order

1. Undeprecate `createPresignedUrl` (B1) — 2 min  
2. Unit test empty orgId keys list (B2) — 15 min  
3. Scrub Unicode line breaks on Subject + invite orgName (B3) — 30 min  
4. Optional: wrap service validation details in `{ fieldErrors }` (B4)  
