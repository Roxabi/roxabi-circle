---
title: Code Review R2 — Chemin A kit (post B1–B6 fix)
date: 2026-07-12
scope: origin/main...HEAD (112 files · commits d41f049 + 20da458 + 636a869)
base: origin/main
head: 636a869
mode: multi-domain re-review after /fix
prior: artifacts/reviews/2026-07-12-kit-chemin-a-code-review.md
verdict: Approve with comments
---

# Code Review R2 — Chemin A kit (post-fix)

## Meta

| | |
|---|---|
| **Δ** | 112 files · kit + review artifact + security fix pass |
| **PR** | none |
| **Secret scan** | demo placeholders only (ACK) |
| **Agents** | security · architect · tester · backend · frontend · devops |

## Verdict

### **Approve with comments**

All prior **blockers B1–B6** (and notes ownership) are **FIXED**. Residual items are deploy footguns, structural honesty, and polish — not reopen of the original security bugs.

---

## Prior blockers → status

| ID | Status | Evidence |
|---|---|---|
| B1 CORS allowlist | **FIXED** | `corsAllowlist` + unknown origin → `null` |
| B2 SESSION_SECRET fail-closed | **FIXED** | throw outside `development`/`test` |
| B3 PBKDF2 passwords | **FIXED** | `hashPassword` / `verifyPassword` separate from `hashApiKey` |
| B4 Secure cookie in production | **FIXED** | `ENVIRONMENT === 'production'` |
| B5 CI + frozen-lockfile | **FIXED** | no `\|\| install`; merge requires CI + secret scan |
| B6 Test gaps | **FIXED** | exp, wrong pw, 404, apiFetch credentials, stdio smoke in `test` |
| W1 Notes subject | **FIXED** | schema + repo filters |

---

## Domain verdicts

| Domain | Verdict |
|---|---|
| Security | **Approve with comments** |
| Architect | **Approve with comments** |
| Tester | **Approve with comments** |
| Backend | **PASS** |
| Frontend | **Approve with nits** |
| DevOps | **PASS** |

---

## Residual comments (non-blocking)

### High-value follow-ups (not merge blockers)

1. **Deploy footgun:** `ENVIRONMENT` defaults / wrangler ships `development` → known HMAC fallback if someone deploys without overrides. Prefer fail-closed when ENVIRONMENT unset on Worker, or explicit prod checklist.
2. **Secure cookie:** only exact `production`; staging HTTPS still non-Secure — consider `secure: !dev && !test`.
3. **IDOR regression test:** multi-subject note ownership negative.
4. **Empty `routes/` + fat `createApp`:** A6 honesty — extract when 2nd product app.
5. **extract-dry-run vs P1:** hard-fails on `apps/share-*` — reshape for dual-mission.
6. **MCP unit probe:** FastMCP private tools map → vitest still soft; smoke is the real gate (in `test` script).
7. **FE:** loading flash on `/api/me`; home mutation errors silent; optional 401 → login.

### Nits

- CI action SHA pins parity with secret-scan  
- CORS reject origin unit test  
- stdio-smoke exact tool set (not subset)  
- HSTS optional on API  

---

## Praise

- Dual-auth + D1/R2 + subject scoping + PBKDF2 kit primitives are now solid copy-paste baseline  
- CI fail-closed lockfile + merge-on-green requires **Secret scan ∧ CI**  
- FE: Link+`buttonVariants`, guarded JSON parse, credentials tests  

---

## Phase 8 — Next step

| Option | When |
|---|---|
| **Merge / push** | Kit ready for local use + CI; residual = backlog |
| **`/fix` residual** | Only if you want deploy footgun + multi-subject test now |
| **Product SPEC** | After goal exit — frame 001, no share domain in packages |

¬PR → no GitHub review comment posted.
