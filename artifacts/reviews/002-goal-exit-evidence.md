---
title: "Goal 002 — Exit evidence ledger"
goal: artifacts/goals/002-product-ready-multi-tenant-goal.md
status: in-progress
date: 2026-08-04
kit_sha: 1533141
repo: go-silex/silex-boilerplate
---

# Goal 002 — Exit evidence ledger

**Rule:** epic `CLOSED` ≠ goal exit. Each binary DoD row flips only with re-runnable evidence below.  
**Goal status remains `ready-for-goal` until DoD #5 is fresh PASS** (dogfood product re-run).

## Binary DoD (re-verified 2026-08-04)

| # | Criterion | Status | Evidence |
|---|---|---|---|
| **1** | `bun run validate:full` green on kit | **PASS** | 2026-08-03/04 kit SHA `1533141` lineage; re-assert after Node ABI fix via `npm rebuild better-sqlite3 && bun run validate:full`. Pre-push gates green on residual PR. |
| **2** | No public HMAC session path | **PASS** | Live `packages/` + `apps/`: no HMAC session exports. PR #23 · residual docs #88. |
| **3** | 2 personas `/admin` vs `/app`; invite + reset | **PASS (automated)** | **2026-08-04:** `invitations.test.ts` 13 cases green + `password-reset.test.ts` 4 cases green (email `log` path). Shells A4: PR #24 `/admin`+`/app`. Invites #25 · reset #26. Multi-persona seed `demo` / `demo-b` / tenancy staff. **Manual SPA walkthrough** not re-run this day — optional residual UX, not blocking kit contract (API + seeded personas + shells). |
| **4** | Tokens never clear-logged; `log` fail-closed | **PASS** | `@gosilex/email` + PR #27/#28. |
| **5** | ≥1 product upstream + zero-edit + banlist | **STALE / blocked** | Historical: [`docs/product-consumer-dogfood-evidence.md`](../../docs/product-consumer-dogfood-evidence.md) (2026-07-31, `silex-kit-dogfood` @ `ac3afbd…`). **2026-08-04:** `git clone go-silex/silex-kit-dogfood` → **Repository not found** (private / gone / ACL). Cannot re-run zero-edit against current kit without product clone access. |
| **6** | Phase B + CP-IDOR ≥8 | **PASS** | `resolveModuleAccess` + 14 Phase B tests · PR #30. |
| **7** | AGENTS + README BA-only + CF Email + Phase B | **PASS** | PR #29/#88. |
| **8** | Supersede table / park truths | **PASS** | Goal § Supersede + B8 accepted: [`docs/park-decisions-b8.md`](../../docs/park-decisions-b8.md) · spec #20 `accepted` 2026-08-04. |
| **9** | Critical-path `/ship` PRs | **PASS** | Table below (+ B7 A0–A2 local: #93–#96). |

### Residual before `status: exited`

1. **DoD #5 only** — restore access to a product consumer (`silex-kit-dogfood` or new greenfield), re-run `dogfood-zero-edit.sh` / zero-edit + banlist on current `upstream/main`, update evidence doc.  
2. Then flip goal frontmatter → `exited`.

### Companion residual (non-exit)

- B7 A3 Sentry · A4 CodeRabbit — **parked** (operator 2026-08-03/04).  
- E2E: **local only** (PR #96).  
- Spark #151 staging recette · Dependabot majors.

---

## Critical-path ship PR map (DoD #9)

| Epic | GH | Primary PR(s) |
|---|---|---|
| B2 HMAC cut | #14 | [#23](https://github.com/go-silex/silex-boilerplate/pull/23) |
| B-email CF | #21 | [#27](https://github.com/go-silex/silex-boilerplate/pull/27), [#28](https://github.com/go-silex/silex-boilerplate/pull/28) |
| B3 A4 + invites + reset | #15 | [#24](https://github.com/go-silex/silex-boilerplate/pull/24)–[#26](https://github.com/go-silex/silex-boilerplate/pull/26) |
| B1 SSoT | #13 | [#29](https://github.com/go-silex/silex-boilerplate/pull/29), [#88](https://github.com/go-silex/silex-boilerplate/pull/88) |
| B5 consumer | #17 | [#36](https://github.com/go-silex/silex-boilerplate/pull/36), [#39](https://github.com/go-silex/silex-boilerplate/pull/39) |
| B-rbac Phase B | #22 | [#30](https://github.com/go-silex/silex-boilerplate/pull/30) |
| B7 quality (A0–A2 local) | #19 | [#93](https://github.com/go-silex/silex-boilerplate/pull/93)–[#96](https://github.com/go-silex/silex-boilerplate/pull/96) |
| B8 park decisions | #20 | this residual PR (docs) |

---

## Local gate note

```bash
npm rebuild better-sqlite3   # after Node major upgrade
bun run validate:full
```
