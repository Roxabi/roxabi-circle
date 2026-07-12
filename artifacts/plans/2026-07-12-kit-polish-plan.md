---
title: Kit polish after B1–B6 (non-blocking residual)
status: implemented-p1-p4
date: 2026-07-12
base: main @ d5f226e
source_review: artifacts/reviews/2026-07-12-kit-chemin-a-code-review-r2.md
---

# Kit polish plan (post R2 Approve with comments)

Small PR(s) — **no product share**. Scope = residual comments only.

## Goals

| ID | Item | Why | Effort |
|---|---|---|---|
| P1 | **ENVIRONMENT fail-closed on Worker** | Avoid deploy-as-dev with known HMAC fallback | S |
| P2 | **Secure cookie when not dev/test** | Staging HTTPS should set `Secure` | S |
| P3 | **Multi-subject note IDOR test** | Lock ownership regression | S |
| P4 | **CORS reject-origin unit test** | Lock B1 | S |
| P5 | **Extract routes from god `app.ts`** | A6 honesty for template | M |
| P6 | **ADR-0002 HMAC interim vs Better Auth** | Contract clarity | S |
| P7 | **extract-dry-run dual-mission mode** | Don’t hard-fail on future `share-*` | M |

## Recommended first PR (P1–P4 only)

**Branch:** `fix/kit-polish-env-cookie-tests`  
**Title:** `fix(kit): fail-closed env, Secure cookie, ownership + CORS tests`

### P1 — `getSecret` / ENVIRONMENT
- Treat missing `ENVIRONMENT` on Worker as **production-like** fail-closed (require secret), **or** only allow fallback when `ENVIRONMENT` is **explicitly** `development` | `test`.
- Keep wrangler.toml `ENVIRONMENT=development` for local.
- Document in README: never deploy without `ENVIRONMENT=production` + secret binding.

### P2 — Secure cookie
```ts
// secure when not local-ish
return !['development', 'test'].includes(environmentName(env))
```

### P3 — Multi-subject IDOR
- Seed second subject (second user or mint key under other subject — may need test helper).
- Note created as A → GET as B → 404.

### P4 — CORS
- Request with `Origin: https://evil.example` → no/null `Access-Control-Allow-Origin`.

### Out of first PR
P5 routes split · P6 ADR · P7 extract reshape → second PR after first greens.

## DoD first polish PR
- [ ] `bun run lint typecheck test banlist extract-dry-run` → 0
- [ ] CI green on PR
- [ ] No product share domain
- [ ] No secrets committed

## Non-goals
- Better Auth full install
- CF deploy
- gosilex-ci install (ops track)
- share product features
