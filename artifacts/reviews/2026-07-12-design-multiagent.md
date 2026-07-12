# Multi-agent design review — silex-share posed docs

| Field | Value |
|---|---|
| **Date** | 2026-07-12 |
| **Scope** | Frame + AGENTS + CI/workflows + App setup (no app source) |
| **Agents** | security-auditor · architect · product-lead · devops |
| **Verdict** | **Proceed to SPEC** with mandatory scope cut + security locks |

---

## Consensus

| Theme | Result |
|---|---|
| Product frame quality | Strong (auth shape, limits, slices, API sketch) |
| Dual mission | Sound if JTBD 30j = share live, not kit factory |
| Stack Chemin A | Coherent (Bun/Turbo/Hono/D1/R2/TanStack/BA/FastMCP) |
| Free GH + merge-on-green + App | Correct pattern; **App not live yet** |
| AI-dev safety + PR template | Unusually complete for S0 |

---

## Blockers to lock in SPEC (not optional)

| # | Source | Decision required |
|---|---|---|
| **S1** | Security | **Artefact origin isolation** — untrusted HTML must not share session cookie origin (or strict CSP sandbox). Prefer cookie-less host for serve (e.g. assets on same Worker path *without* session cookies on artefact routes, or separate subdomain). |
| **S2** | Security | **`private_key` transport** — never put `k` in Shlink longUrl; prefer no query leak (fragment exchange / short-lived access cookie / key prompt). M0 may use `?k=` with `Referrer-Policy: no-referrer` + no Shlink for private until M4 design. |
| **S3** | Security + Architect | **Bootstrap mint** — local/dev or break-glass only; hashed; flagged `bootstrap`; TTL or revoke-all at M3; not a shared team key. |
| **S4** | Architect | **Error envelope** — AGENTS shape `{ error: { code, message }, requestId }` as SSoT; frame sketch fields go in `details`. |
| **S5** | Architect | **Product ≠ kit packages** — share schema/prefix/codes in `apps/share-api` only for M0. |
| **S6** | Devops | **merge-on-green fail-closed** — require named check “TruffleHog” success; empty checks ≠ merge. (code follow-up) |
| **S7** | Product | **First SPEC scope** = **M0 + M1-core** only (not full M0–M6 “MVP” ladder). |

---

## Warnings (SPEC / plan)

| # | Topic |
|---|---|
| W1 | Ownership matrix for replace/delete before OAuth (bootstrap subject id) |
| W2 | Slug charset + path/zip-slip invariants (frame free-form → bound in SPEC) |
| W3 | Zip compression bombs / ratio limits |
| W4 | Presign authz (M2) — document out of SPEC-001 |
| W5 | ACL unauthenticated → prefer 404 not login redirect (existence leak) |
| W6 | Free plan: direct push / label `reviewed` not enforced — process only |
| W7 | TruffleHog `--only-verified` residual blind spots |
| W8 | Empty package map temptation — 2 call sites ∨ ADR |

---

## Scope cut (product-lead) — first vertical

**SPEC-001:** Public create/serve + slug lifecycle + `private_key` (M0 + M1-core)  
**Out:** UI OAuth (M3), video presign (M2), Shlink (M4), MCP (M5), private_acl (M6), kit S4 tooling.

---

## Devops — before trusting bot merge

1. Create/install `gosilex-ci` + org vars/secrets  
2. Smoke PR → Secret scan → `reviewed` → merge by bot  
3. Optional hardening: fail-closed named checks (S6)

---

## Tier recommendation

| Work | Tier |
|---|---|
| SPEC-001 + M0 implement | **F-lite** |
| Full kit end-state | F-full aspiration (phased) |

---

## Praise (keep)

- Org-only upload, per-user keys, private_key 404 (key mode), no shared team key  
- Cookie/CSRF/MCP Bearer rules  
- AI safety section + PR security checklist  
- Dual-mission extractability rules + Free plan honesty  
- Split-token merge-on-green + App (no PAT) design  
