# Code Review — five root-cause debts (`5668d8c...3f1daa6`)

| | |
|---|---|
| **Range** | `5668d8c...3f1daa6` (`3f1daa6` on `main`) |
| **|Δ|** | 41 files |
| **PR** | none (Phase 6 skipped) |
| **Secret scan** | clean |
| **Date** | 2026-08-12 |

## Agent verdicts

| Agent | Verdict |
|-------|---------|
| security-auditor | Approve with comments |
| **adversarial** | **Request changes** (claim honesty + residual parallel paths; not D11 reopen) |
| architect | Approve with comments (clean score **7.5/10**) |
| **tester** | **Request changes** (keys blank proof tautology) |
| backend-dev | Approve with comments |
| frontend-dev | Approve with comments |

## Orchestrator verdict: **Approve with comments** (runtime) · **Request changes** only if you claim “proof complete / single choke everywhere”

**Runtime:** the five root-cause refactors hold. D11 list APIs are named; EmailPort scrubs; fieldErrors kit contract exists; login honesty is correct; StorageClient.presign dogfooded.

**What remains is surface fat + one vacuous unit proof** — same class as “patch stacks” if fixed by more canaries instead of deleting dual ownership.

---

## Claim scorecard

| Claim | Runtime | Residual | False closure? |
|-------|---------|----------|----------------|
| P1 Keys API split | **Yes** | Dual blank policy (route + repo); service aliases; unit proof tautological | Proof yes / hole no |
| P2 Email scrub choke | **Port path yes** | Public `sendCf`/`sendLog` unscrubbed; allowlist before scrub | If claim = “all sends” |
| P3 fieldErrors contract | **BE forms yes** | `validation(unknown)` freeform; FE ignores wire details; half routes still manual safeParse | If claim = E2E forms |
| P4 Login anti-enum honesty | **Yes** | Wire still differs (documented) | **No** |
| P5 StorageClient.presign | **Dogfood yes** | Free put/get/delete + createPresignedUrl still public | If claim = “products can’t misuse” |

---

## Blockers (only if you keep dual blank + claim early-return proven)

### B1 — keys blank unit proof is tautological again
- **Agents:** tester (96%), adversarial (90%)
- **Class:** `test-tautology`
- **Where:** `apps/example-api/src/repos/keys-list.test.ts` · control `keys.ts` L67–69
- **Why:** fixtures only have real orgs; delete `if (!org) return []` → `eq('', …)` still `[]`
- **Root fix (prefer simplify, not canary):** **one owner of blank**
  1. Route short-circuit only; repo `listApiKeysForOrg` requires non-empty org (throw `VALIDATION`) — single semantic  
  2. Or drop route short-circuit and keep repo only + canary row  
- **Do not:** re-seed `key_empty` and call it root-cause again

### B2 — Email scrub claim incomplete if “all sends”
- **Agents:** adversarial (88%), security (74% non-blocking)
- **Class:** `parallel-path-drift`
- **Where:** exported `sendCf` / `sendLog` bypass `scrubPortInput`
- **Root fix:** unexport leaves **or** scrub inside leaves once; force product path = `EmailPort` only

---

## Warnings / simplify (high ROI)

| ID | Finding | Prefer |
|----|---------|--------|
| W1 | Allowlist runs on dirty `to` before scrub | Outer scrub → allowlist → transport |
| W2 | Dual template API (`*Email` + `build*EmailText`) | Export one shape only |
| W3 | `withRecipientAllowlist` 4-arg DI unused | Import helpers; `(port, domains)` only |
| W4 | Free storage put/get/delete + advanced presign still public | Client-only product surface |
| W5 | Half routes still manual `safeParse` vs `parseOrThrow` | Sweep to `parseOrThrow` |
| W6 | Service `listApiKeys` name asymmetric / pure alias | Rename `listApiKeysForSubject` or call repo from route |
| W7 | Dual blank fail-closed route+repo | Pick one layer (ties B1) |
| W8 | account-errors triple dual-branch | Keep 3 exports; private `statusOf` |
| W9 | uploads `{ max }` free-form next to `fieldErrors` contentType | `fieldErrors` size or message-only |
| W10 | magic/forgot 429 uses `'status' in e` (misses `Error('HTTP 429')`) | Use shared `httpStatus` |

---

## Praise (keep)

- Named keys APIs kill opts-bag sentinel; mint org fail-closed by construction  
- Templates no longer scrub headers (port owns it)  
- `AppError.fieldErrors` + `FieldErrors` / `ValidationDetails` SSoT  
- Login password vs `/api/me` mappers correctly split; UI-only honesty  
- `StorageClient.presign` dogfood; prefix join + traversal tested  
- Core fieldErrors → `toApiErrorBody` polarity tests solid  

---

## SIMPLIFICATION TOP 5 (ranked — delete dual paths, not more patches)

1. **Keys ownership** — one blank policy; drop service list passthroughs or rename for symmetry  
2. **Email surface** — scrub at leaves *or* unexport `sendCf`/`sendLog`; one template export; drop allowlist DI; scrub-before-allowlist  
3. **parseOrThrow fleet** — remaining orgs/admin/me/modules safeParse → one helper  
4. **Storage barrel** — product path = `StorageClient` only; free helpers internal/tests  
5. **account-errors DRY** — private status resolve; fix adjacent magic 429 detector  

**Do not simplify away:** session list vs org list (D11), dual credential cookie|sk_, freeform non-field validation, three FE mappers (different UX), Worker vs Node SMTP split.

---

## Architecture clean score

**7.5 / 10** (architect) — real root-cause direction; residual = fat public barrels + incomplete choke consolidation.
