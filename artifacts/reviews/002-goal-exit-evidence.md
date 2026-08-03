---
title: "Goal 002 — Exit evidence ledger"
goal: artifacts/goals/002-product-ready-multi-tenant-goal.md
status: in-progress
date: 2026-08-03
kit_sha: 9414516
repo: go-silex/silex-boilerplate
---

# Goal 002 — Exit evidence ledger

**Rule (advisory 2026-08-03):** epic `CLOSED` ≠ goal exit. Each binary DoD row flips only with re-runnable evidence below.  
**Goal status remains `ready-for-goal` until residual rows are filled and frontmatter flips to `exited`.**

## Operator sequence v2 (SSoT)

```text
0. SSoT sync          GH issue state = truth; plans/README as-of stamped
1. This ledger        fill / refresh DoD rows (this file)
2. A0                 promote B7 spec #19 (plan 007 AC) before implement
3. /ship PR-B7-1      A1 e2e harden · ≥3 local greens
4. /ship PR-B7-2      A2 CI e2e SOFT (continue-on-error + dated expire ≤7d)
5. Flip PR            hard e2e only after flake SLO (see plan 007 / spec #19)
6. /ship PR-B7-3      A3 Sentry scrub · human sécu
7. /ship PR-B7-4      A4 CodeRabbit enable|dated decline + A5 testing.md
8. B8 docs /ship      park freeze + unpark criteria (// after ledger skeleton)
9. Residual           Spark #151 staging; Dependabot majors after quiet post-flip week
10. Goal exit         all 9 rows PASS → goal status: exited
```

**Broom:** Spark/GH close only with proof (PR URL · SHA · command). Prefer `superseded` + pointer over fiction `done`.

---

## Binary DoD (re-verified 2026-08-03)

| # | Criterion | Status | Evidence |
|---|---|---|---|
| **1** | `bun run validate:full` green on kit | **PASS** | 2026-08-03 on SHA `9414516` after `npm rebuild better-sqlite3` (ABI Node 24 / MODULE_VERSION 137). Prior fail was native module mismatch, not product regression. Log: local session `/tmp/validate-full-goal002b.txt` exit 0. |
| **2** | No public HMAC session path | **PASS** | `rg` over `packages/` + `apps/`: zero `createHmacSessionPort` / `AUTH_SESSION_ADAPTER` / HMAC session exports. Ship: [PR #23](https://github.com/go-silex/silex-boilerplate/pull/23) · residual docs: [PR #88](https://github.com/go-silex/silex-boilerplate/pull/88). Live remnants only under `artifacts/` history. |
| **3** | Local dogfood: 2 personas `/admin` vs `/app`; invite + reset with email `log` | **PARTIAL** | **Automated:** invites matrix `apps/example-api/src/invitations.test.ts`; reset `password-reset.test.ts`; shells shipped PR #24/#25/#26. **Manual browser 2-persona walkthrough on this date:** not re-run in this session → keep open until human or scripted browser pass recorded here. |
| **4** | Tokens never clear-logged; `log` transport rejected outside dev/test | **PASS** | `packages/email`: fail-closed `EMAIL_TRANSPORT=log` outside development\|test (`index.ts`); `redactEmailBody` + unit tests `index.test.ts`. Ship: [PR #27](https://github.com/go-silex/silex-boilerplate/pull/27) + staging allowlist [PR #28](https://github.com/go-silex/silex-boilerplate/pull/28). |
| **5** | ≥1 product upstream + zero-edit + banlist + evidence | **STALE PASS** | Historical: [`docs/product-consumer-dogfood-evidence.md`](../../docs/product-consumer-dogfood-evidence.md) (2026-07-31, product `silex-kit-dogfood`, kit baseline `ac3afbd…`). **No local dogfood clone on this machine 2026-08-03** → re-run `dogfood-zero-edit.sh` against current `main` before claiming permanent exit. |
| **6** | Phase B: migrations + single resolver + seed system roles + **CP-IDOR ≥8** | **PASS** | `resolveModuleAccess` in `apps/example-api/src/services/org-roles.ts` (runtime authz). `org-roles-phase-b.test.ts`: **14** cases green (includes cross-org IDOR, system immutability, grant ceiling). Ship: [PR #30](https://github.com/go-silex/silex-boilerplate/pull/30). UI matrix optional (not required). |
| **7** | AGENTS + README match BA-only + CF Email + Phase B | **PASS** | AGENTS §D BA-only dual credential cookie\|sk_; ADR-0002/0003/0004 linked; README kit map. Ship: [PR #29](https://github.com/go-silex/silex-boilerplate/pull/29) + [PR #88](https://github.com/go-silex/silex-boilerplate/pull/88). |
| **8** | Supersede table applied (no dual park/unpark truths) | **PASS** | Goal § Supersede + ADR-0002/0003/0004 live. B8 residual parks: Paraglide / Plausible / patchlog / TanStack Start-as-default only (GH #20). |
| **9** | Critical-path epic ≥1 `/ship` PR each | **PASS** | Table below. |

### Residual before `status: exited`

1. **DoD #3** — record manual (or Playwright later) 2-persona invite+reset walkthrough.  
2. **DoD #5** — re-run dogfood on current kit SHA; update `docs/product-consumer-dogfood-evidence.md`.  
3. Flip goal frontmatter `ready-for-goal` → `exited` only when #3 and #5 are fresh PASS.

### Local gate note (ops)

If `better-sqlite3` fails with `NODE_MODULE_VERSION` mismatch after a Node upgrade:

```bash
npm rebuild better-sqlite3
# then
bun run validate:full
```

Do not treat that red as product DoD failure until rebuild is attempted.

---

## Critical-path `/ship` PR table (DoD #9)

| Epic | GH | Spark | Primary merged PR(s) |
|---|---|---|---|
| B2 HMAC cut | [#14](https://github.com/go-silex/silex-boilerplate/issues/14) | #115 | [#23](https://github.com/go-silex/silex-boilerplate/pull/23) |
| B-email CF | [#21](https://github.com/go-silex/silex-boilerplate/issues/21) | #126 | [#27](https://github.com/go-silex/silex-boilerplate/pull/27), [#28](https://github.com/go-silex/silex-boilerplate/pull/28) |
| B3 A4 + invites + reset | [#15](https://github.com/go-silex/silex-boilerplate/issues/15) | #116 | [#24](https://github.com/go-silex/silex-boilerplate/pull/24), [#25](https://github.com/go-silex/silex-boilerplate/pull/25), [#26](https://github.com/go-silex/silex-boilerplate/pull/26) |
| B1 SSoT | [#13](https://github.com/go-silex/silex-boilerplate/issues/13) | #114 | [#29](https://github.com/go-silex/silex-boilerplate/pull/29), residual [#88](https://github.com/go-silex/silex-boilerplate/pull/88) |
| B5 consumer | [#17](https://github.com/go-silex/silex-boilerplate/issues/17) | #118 | [#36](https://github.com/go-silex/silex-boilerplate/pull/36), evidence [#39](https://github.com/go-silex/silex-boilerplate/pull/39) |
| B-rbac Phase B | [#22](https://github.com/go-silex/silex-boilerplate/issues/22) | #127 | [#30](https://github.com/go-silex/silex-boilerplate/pull/30) |
| B4 ops (companion) | [#16](https://github.com/go-silex/silex-boilerplate/issues/16) | #117 | [#36](https://github.com/go-silex/silex-boilerplate/pull/36); residual staging recette Spark **#151** |
| B6 patterns (companion) | [#18](https://github.com/go-silex/silex-boilerplate/issues/18) | #119 | [#85](https://github.com/go-silex/silex-boilerplate/pull/85)–[#91](https://github.com/go-silex/silex-boilerplate/pull/91) |

Open companions (not goal-blocking): **#19 B7**, **#20 B8**.

---

## Spark children — evidence map (broom)

| Spark | Title | Disposition | Proof |
|---|---|---|---|
| #89 | jobs CF Queues/Cron | **superseded → done** | GH #84 · PR #90 |
| #90 | MasterData demo | **superseded → done** | GH #82 · PR #86 |
| #91 | R2 presign demo | **superseded → done** | GH #83 · PR #89/#91 |
| #92 | FE api-client | **superseded → done** | GH #81 · PR #85 |
| #124 | dogfood zero-edit | **superseded → done (historical)** | B5 #118 · PR #39 · evidence doc (re-run still Goal DoD #5) |
| #125 | e2e + Sentry | **keep open** under B7 #120 | implement via plan 007 |
| #100 | patchlog UI | **park** under B8 | no implement |
| #151 | staging examples recette | **keep open** residual ops | after B7 A2 hard flip preferred |
| #88 / #94 / #95 | docs / park decisions | close only if content already in AGENTS/playbooks with pointer | verify per ticket |

---

## Refs

- Goal: [`artifacts/goals/002-product-ready-multi-tenant-goal.md`](../goals/002-product-ready-multi-tenant-goal.md)  
- B7 plan: [`plans/007-quality-gates-post-review.md`](../../plans/007-quality-gates-post-review.md)  
- B7 spec (A0): [`artifacts/specs/19-epic-b7-qualite-prod-spec.md`](../specs/19-epic-b7-qualite-prod-spec.md)  
- Advisory chain: adversarial + advisory session 2026-08-03 (chat)
