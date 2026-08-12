# Code Review — small audit residuals

**Date:** 2026-08-12  
**Range:** `origin/main...HEAD` (`0ffb0bc` + `75214c9`)  
**PR:** none  
**|Δ|:** 39 files  
**Agents:** security · adversarial · backend · frontend · tester · architect  

## Verdict

### **Approve with comments** (code)

Security / backend / frontend / tester: no ship-blocking security or correctness φ on the residual.  
Architect **docs honesty** flag (AGENTS B5 vs empty evidence) is the only claim-level blocker — fix before advertising dogfood as proven.

---

## CLOSED in this residual (evidence)

| Claim | Evidence |
|-------|----------|
| D11 GET `/api/keys` Bearer scope | route + repo filter + org-rbac multi-org test |
| SMTP envelope garbage fail-closed | `isValidEnvelopeAddr` + tests no connect |
| SessionPort BA-only | sign/verify/secret removed |
| safePostAuth `%2e%2e` | decode before allowlist + tests |
| DEMO_QUEUE Env typing | Env + handlers typed |
| PlatformGate / me / admin tests | matrices present and falsifiable |

---

## Findings (deduped)

### Blocker (docs honesty — not runtime)

| ID | Finding | Agents | C |
|----|---------|--------|---|
| **D1** | AGENTS still `[x]` B5 dogfood permanent greenfield while `product-consumer-dogfood-evidence.md` says **not filled** | architect (blocking) | 95% |

**Fix:** demote AGENTS checkbox **or** fill real evidence.

### Warnings (non-blocking)

| ID | Finding | Agents | C |
|----|---------|--------|---|
| W1 | SMTP C0-only control; NEL/ZWSP/comma residual | adversarial 82%, security nit | 72–82% |
| W2 | D11 keys fail-closed only on route; service `organizationId: ''` fail-open latent | adversarial 86%, backend nit | 86% |
| W3 | `safePostAuthPath` single decode; double-encoding residual | adversarial 78%, FE suggestion | 78% |
| W4 | SMTP DATA body no dot-stuffing (pre-existing adjacent) | security 72% | 72% |
| W5 | Task row click still keyboard-inaccessible | FE issue non-block | — |
| W6 | ADR-0002 D3 still documents SessionPort.secret/sign | architect | — |
| W7 | tasks access still barrel-exported despite @deprecated | architect | — |

### Praise

keys D11 + tests · SMTP fail-closed reverse of bad test · SessionPort shrink · PlatformGate super/loading · safePostAuth encode · me unit · admin OOS newest pagination · FE `from:` + BA toast map · AppSidebar unexport · dogfood evidence honesty flag (file)

---

## Phase 1.5 secret scan

∅  

## Phase 6

Skipped — no PR  

## Recommended next

1. Fix **D1** (AGENTS demote or fill evidence) — 5 min  
2. Optional: service-level D11 empty orgId · SMTP printable-ASCII allowlist · ADR-0002 D3 amend  
3. Push residual commits after D1
