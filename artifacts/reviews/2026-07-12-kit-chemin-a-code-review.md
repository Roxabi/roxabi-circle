---
title: Code Review — Chemin A kit monorepo (d41f049)
date: 2026-07-12
scope: origin/main...HEAD (110 files, +4872)
base: origin/main
head: d41f049
mode: multi-domain (security, architect, tester, backend, frontend, devops) + axial self-check
playbook: multi-agent-audit (compressed 6-domain, not full 67-wave)
verdict: Request changes
---

# Code Review — Chemin A kit (`d41f049`)

## Meta

| | |
|---|---|
| **Δ** | 110 files · kit monorepo full-local B0–B6 |
| **PR** | none (local `main` ahead of `origin/main` by 1) |
| **Secret scan** | demo placeholders only (`demo-password-change-me`, `SESSION_SECRET` examples) — ACK kit-intentional |
| **Axial ADR** | present (`axial: true`) · packages→apps DAG clean · no `apps/share-*` · banlist OK |
| **Agents** | security-auditor · architect · tester · backend-dev · frontend-dev · devops |

## Verdict

### **Request changes**

Blockers security + ops gate incompleteness. Axis/DAG/Hono/dual-auth integration spine is solid for a kit scaffold; do **not** treat CORS/session/password primitives as copy-paste production template until fixed.

---

## Blockers (fix before merge / next kit iteration)

### B1 — CORS reflects any Origin + `credentials: true`
**Agents:** security (95%), architect, backend  
**File:** `apps/example-api/src/app.ts:40`

```ts
origin: (origin) => origin || 'http://localhost:5173',
credentials: true,
```

**Root cause:** Reflecting request Origin with cookies ≡ credentialed wildcard.  
**Class:** `missing-input-validation`  
**Fix:** Env allowlist (`CORS_ORIGINS`); return origin only if listed.

### B2 — Silent `SESSION_SECRET` fallback
**Agents:** security (96%), backend  
**File:** `apps/example-api/src/app.ts:28-29`

**Root cause:** Missing secret → public HMAC key → forge sessions.  
**Class:** `secret-leak`  
**Fix:** Fail closed outside explicit `ENVIRONMENT=development`; min length 32.

### B3 — Password = unsalted SHA-256 via `hashApiKey`
**Agents:** security (92%), architect  
**File:** `apps/example-api/src/services/auth.ts:22`

**Root cause:** Wrong primitive for passwords (OK for high-entropy `sk_`).  
**Class:** `secret-leak`  
**Fix:** Separate password KDF (PBKDF2-SHA-256 / Better Auth); keep SHA-256 for API keys only.

### B4 — Session cookie always `Secure=false`
**Agents:** security (90%), backend  
**File:** `apps/example-api/src/services/auth.ts:70`

**Fix:** `secure` from env / HTTPS; default true outside local.

### B5 — CI not wired into merge-on-green + frozen-lockfile optional
**Agents:** devops  
**Files:** `.github/workflows/ci.yml:26`, `merge-on-green.yml`

- `bun install --frozen-lockfile || bun install` → lock never enforced  
- merge-on-green only requires Secret scan, not `CI` / `lint-typecheck-test`

**Fix:** Fail-closed frozen lockfile; add `CI` to `workflow_run` + required check substrings.

### B6 — Test tautologies / missing negatives
**Agents:** tester  
| Gap | Why it fails falsification |
|---|---|
| `mcp-example` Vitest only checks constant | delete `addTool` → still green |
| No session `exp` negative | remove exp check → green |
| No note `NOT_FOUND` | remove guards → green |
| FE `apiFetch` credentials untested | delete `credentials: 'include'` → green |

**Fix:** wire stdio-smoke into test or assert server tools; add exp/404/wrong-password; mock fetch for credentials.

---

## Warnings (should fix soon / before 2nd product app)

| ID | Topic | Agent(s) | Severity |
|---|---|---|---|
| W1 | Notes global (no owner/subject) — IDOR kit pattern | security, backend | high pattern |
| W2 | Cookie CSRF defense-in-depth (Origin check on mutations) | security | medium (SameSite=Lax helps) |
| W3 | Empty `routes/` + god `app.ts` (A6 theater) | architect | structural |
| W4 | HMAC session ≠ Better Auth — need interim ADR / port | architect | doc+contract |
| W5 | extract-dry-run hard-fails if `apps/share-*` exists (breaks P1) | architect, devops | process |
| W6 | Banlist narrow; product vocab in `@gosilex/mcp` assert helper | architect | purity |
| W7 | `@gosilex/ui` CVA not Base UI pin (A15 gap) | architect, FE | stack fidelity |
| W8 | `onError` drops stack internally; `status as 400` lie | backend | obs |
| W9 | Nested `<Link><Button>` a11y; unguarded `JSON.parse` | FE | UX/robustness |
| W10 | Mailpit `:latest`; build always succeeds (`\|\| echo build-skip`) | devops | hygiene |
| W11 | Latent target-axis-trap: middleware/auth not package-promoted | architect | when 2nd app |
| W12 | Timing-unsafe hash `===` | security, backend | low exploit / good kit model |

---

## Praise (keep)

- Primary axis held: clean package DAG, schemas in app, `demo/` R2 prefix, Hono-only API
- Dual-auth **integration** tests via real `createApp` + better-sqlite3 D1 + R2 mock
- Error envelope + requestId + no stack to client
- `joinObjectKey` traversal rejection; API keys hashed at rest
- Session HMAC via `crypto.subtle.verify`
- SPA: `credentials: 'include'`, proxy same-host, FR default + EN catalogs
- Extract banlist + every package has a consumer
- Axial ADR `axial: true` early

---

## Domain verdicts

| Domain | Verdict |
|---|---|
| Security | **Request changes** |
| Architect | Conditional pass (axis OK; routes + CORS block template status) |
| Tester | **Needs work** |
| Backend | Conditional pass for local demo only |
| Frontend | Approve with nits |
| DevOps | **Needs fix** |
| Axial self-check | **Pass** (no N×M yet; banlist clean; consumers real) |

---

## Suggested fix order (`/fix` or implementer)

1. **B1 CORS allowlist** + **B2 fail-closed secret** + **B4 Secure cookie** (security cluster)  
2. **B3 password KDF split** from `hashApiKey`  
3. **B5** CI frozen lockfile + merge-on-green requires `CI`  
4. **B6** test negatives + mcp smoke in `turbo test`  
5. **W3** extract routes/middleware (A6 honesty)  
6. **W1** note ownership column (kit multi-user honesty)  
7. Docs: ADR-0002 interim HMAC vs Better Auth; reshape extract for dual-mission P1  

---

## Phase 8 — Next step (human)

Choose:

1. **`/fix`** — apply blockers B1–B6 (recommended)  
2. **Commit review only** — land this artifact, fix later  
3. **Stop** — keep findings as backlog  

¬PR → no GitHub review post. Push of `d41f049` still optional.

---

## Agent IDs (resume)

| Agent | subagent_id |
|---|---|
| security | `019f5568-3c36-7e32-b3a6-21a362d46b36` |
| architect | `019f5568-3c36-7e32-b3a6-21b846fc560c` |
| tester | `019f5568-3c36-7e32-b3a6-21c52b8db50f` |
| backend | `019f5568-3c36-7e32-b3a6-21df6a07b853` |
| frontend | `019f5568-3c36-7e32-b3a6-21e1c82d61fe` |
| devops | `019f5568-3c36-7e32-b3a6-21f090e88cbc` |
