---
title: "Goal 002 — Exit evidence ledger"
goal: artifacts/goals/002-product-ready-multi-tenant-goal.md
status: exited
date: 2026-08-04
kit_sha: 50b7a4eb47521f958adf4a6ca1e73591b6fa0e4c
product_repo: go-silex/silex-kit-dogfood
product_sha: 01579e6b6e3f6473e153c4bded412b95257f58e7
repo: go-silex/silex-boilerplate
---

# Goal 002 — Exit evidence ledger

**Rule:** epic `CLOSED` ≠ goal exit. Each binary DoD row flips only with re-runnable evidence below.

## Binary DoD (re-verified 2026-08-04)

| # | Criterion | Status | Evidence |
|---|---|---|---|
| **1** | `bun run validate:full` green on kit | **PASS** | Kit gates; ABI: `npm rebuild better-sqlite3` if Node major upgrade. |
| **2** | No public HMAC session path | **PASS** | PR #23 · residual docs #88. |
| **3** | 2 personas `/admin` vs `/app`; invite + reset | **PASS (automated)** | invitations 13 + password-reset 4 tests green; shells #24–#26. |
| **4** | Tokens never clear-logged; `log` fail-closed | **PASS** | PR #27/#28. |
| **5** | ≥1 product upstream + zero-edit + banlist | **PASS** | **2026-08-04 recreated** [silex-kit-dogfood](https://github.com/go-silex/silex-kit-dogfood) · product SHA `01579e6` · kit-baseline `50b7a4e` · `dogfood-zero-edit.sh` OK · zero-edit + banlist green. Evidence: [`docs/product-consumer-dogfood-evidence.md`](../../docs/product-consumer-dogfood-evidence.md). |
| **6** | Phase B + CP-IDOR ≥8 | **PASS** | PR #30. |
| **7** | AGENTS + README BA-only + CF Email + Phase B | **PASS** | PR #29/#88. |
| **8** | Supersede table / park truths | **PASS** | B8 accepted · [`docs/park-decisions-b8.md`](../../docs/park-decisions-b8.md). |
| **9** | Critical-path `/ship` PRs | **PASS** | Table below. |

### Residual (non-exit / park)

- B7 A3 Sentry · A4 CodeRabbit — **parked**.  
- E2E: **local only** (PR #96).  
- Full product boot on dogfood (API+web) — optional beyond path ownership.

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
