# Code Review — email + storage surface (working tree)

| | |
|---|---|
| **Range** | uncommitted `HEAD` working tree (not yet committed) |
| **|Δ|** | 10 files · +178 / −132 |
| **PR** | none (Phase 6 skipped) |
| **Secret scan** | clean |
| **Date** | 2026-08-12 |
| **Scope** | scrub-at-leaves · scrub-before-allowlist · unexport leaves/templates · drop free put/get/delete |

## Agent verdicts

| Agent | Verdict |
|-------|---------|
| **security-auditor** | **Request changes** (last-`@` allowlist spoof) |
| **adversarial** | **Request changes** (D6 allowlist vacuous + storage claim honesty) |
| architect | Approve with comments (clean **8.7/10**) |
| **tester** | **Request changes** (multi-`@` negatives + Resend tests) |
| backend-dev | Approve with comments |

## Orchestrator verdict: **Request changes**

**This delta closes the priced scrub/surface work** (leaf scrub, allowlist *order*, barrel, free R2 I/O gone).  
**Not merge-as-“allowlist hardened”** while staging D6 can still be bypassed via multi-token `to` + `lastIndexOf('@')`. That residual pre-existed (W2) but security/adversarial/tester now price it as **blocking** for any claim that allowlist is a real spray control.

---

## Claim scorecard

| Claim | Runtime on this Δ | Residual | False closure? |
|-------|-------------------|----------|----------------|
| Product EmailPort path scrubs headers | **Yes** (log/cf/resend/smtp) | Dual From helpers (cosmetic) | **No** |
| Allowlist runs on scrubbed `to` (order) | **Yes** (LS polarity solid) | Multi-`@` / last-`@` spoof | Order yes / policy **no** |
| Root barrel unexports leaves + raw templates | **Yes** | `/server` sendLog intentional; soft deep-import | **No** |
| Storage no free put/get/delete | **Yes** | `createPresignedUrl` free-key advanced | Absolute “client only” **overclaim** if stated that way |

---

## Blockers

### B1 — Staging allowlist spoofable via last-`@` (multi-mailbox / spaced tail)

- **Agents:** security (88%), adversarial (92%), tester (92%)
- **Class:** `missing-input-validation` · `parallel-path-drift` (vs SMTP envelope)
- **Where:** `packages/email/src/domain.ts:2` · `ports.ts:129` · tests only cover clean + trailing LS
- **Why:** After scrub, `leak@evil.com\r\n@example.com` → `leak@evil.com @example.com`; `emailDomain` takes domain after **last** `@` → `example.com` → allowlist green. CF/Resend do not apply SMTP’s single-`@` fail-closed.
- **Root fix:** Shared envelope validator before allowlist **and** CF/Resend send (mirror SMTP `isValidEnvelopeAddr`: exactly one `@`, no spaces/commas/`<>`). Then domain match on that sole mailbox. Negative tests: multi-`@`, comma list, post-scrub space, `not-an-email` — binding/fetch never called.
- **Note:** Not introduced by scrub-order fix; scrub-before-allowlist is correct for LS false-deny. This is the **remaining D6 hole**.

### B2 — Allowlist suite proves scrub order, not anti-spoof (evidence gap)

- **Agents:** tester · adversarial
- **Class:** `test-tautology` *if* claim = “allowlist secure”
- **Where:** `packages/email/src/index.test.ts:283`
- **Root fix:** Add B1 negatives; suite red until mailbox gate lands (or explicitly park D6 as “domain token only” in docs — not recommended).

---

## Warnings (non-blocking for *this surface* if B1 fixed or claim narrowed)

| ID | Finding | Agents | Prefer |
|----|---------|--------|--------|
| W1 | No Resend scrub/factory unit tests | tester · backend | Mock `fetch`; assert scrubbed JSON + fail paths |
| W2 | Storage absolute “client only / no free helpers” overclaim while `createPresignedUrl` public | adversarial · security | Claim honesty: free I/O gone; advanced free-key presign remains trusted-key only |
| W3 | Dual `scrubCfFrom` / `scrubCfAddress` From helpers | architect | One shared helper in `scrub.ts` |
| W4 | CF port trusts leaf scrub; Resend scrubs in-port | architect · backend | Accept or pre-scrub CF for symmetry |
| W5 | Storage tests thin on head/list traversal, empty key, non-PUT | tester | Add polarity cases |
| W6 | Optional barrel contract tests (`not.toHaveProperty('sendCf'|'putObject')`) | tester | Optional |
| W7 | `completeUpload` raw bucket + prefix `startsWith` (app-layer, OOS of package Δ) | architect · backend | `assertObjectKey` or server-owned key |
| W8 | Resend error may log provider body snippet | backend | Stable message; detail debug-only |

---

## Praise (keep)

- Root `@kit/email` barrel = ports + `build*EmailText` only; leaves not product-public  
- Leaf scrub on `sendCf` / `sendLog`; SMTP already fail-closed envelope  
- `withRecipientAllowlist` scrub-before-check; LS test polar for that line  
- Free `putObject`/`getObject`/`deleteObject` deleted; dogfood already on `StorageClient`  
- `@kit/email/server` re-export from `ports` (not root) — correct Worker/Node split  
- example-api consumers non-breaking  

---

## Architecture clean score

**8.7 / 10** (architect) — surface simplification landed; residual = mailbox policy + claim honesty on advanced presign.

---

## Recommended fix order

1. **B1** — shared mailbox fail-closed + allowlist on sole domain (~30–45 min)  
2. **B2** — negative tests (proves B1)  
3. Optional: Resend scrub tests (W1) · claim wording storage README (W2) · DRY From scrub (W3)  

## Phase 6

Skipped — no open PR.

## Phase 8 options

- **Fix now** — B1+B2 (mailbox + tests); optional W1  
- **Narrow claim + ship surface** — document allowlist as “last-@ token after scrub” (honest but weak D6) — **not recommended** by security/adversarial  
- **Stop** — leave working tree as-is for later  

---

## Post-review fix (same session)

User chose **Fix now (B1+B2)**.

| ID | Status | Change |
|----|--------|--------|
| **B1** | **CLOSED** | Shared `isValidMailboxAddress` in `domain.ts`; used by allowlist, CF leaf, Resend port, SMTP |
| **B2** | **CLOSED** | Negatives: multi-`@`, comma list, CRLF spoof tail, not-an-email — binding never called |
| W1–W8 | still open | optional |

Tests: `@kit/email` 36 green · typecheck green.
