---
title: "Plan: close #130 review gaps (legacy sign-in + docs, no merge)"
issue: 126
spec: none
complexity: 4/10
tier: F-lite
generated: "2026-08-23T15:10:00Z"
---

## Summary

Close the evidence gap on PR #130 without merging and without adding `reviewed`. Add a real BA 1.7 sign-in against a pre-1.7 credential row (issuer absent until 0014), document D1 partial-apply recovery + permanent DEFAULT + Worker/schema order, and post AuthMigrationReview findings as a PR comment. Tombstone for retired module id `better_auth_1_7` is a follow-up (kit-schema-sync contract), not this PR.

## Architecture

### Data Flow

1. Test harness stops SQL apply at `0013_tasks_comments.sql`.
2. Insert `user` + `account` with `better-auth/crypto` `hashPassword`, **no** `issuer` column.
3. Apply `0014_better_auth_1_7_additive.sql` (guard → ALTER DEFAULT → unique index).
4. `createApp().request('POST /api/auth/sign-in/email')` on that env → 200 + session cookie.
5. Docs: consumer contract + SQL header + PR body; no schema change to DEFAULT.

### File × Function Map

| File | Change |
|------|--------|
| `apps/example-api/src/test/memory-env.ts` | Optional `through?: string` on `createMemoryEnv` so apply stops before 0014. Default = all files (existing tests unchanged). |
| `apps/example-api/src/auth-legacy-migration.test.ts` | **New.** Legacy insert + 0014 + real sign-in. Do not edit `app.test.ts`. |
| `apps/example-api/migrations/0014_better_auth_1_7_additive.sql` | Header: partial-apply recovery + rollback + DEFAULT is permanent. |
| `docs/kit/product-consumer-contract.md` | One checklist line: `@kit/auth` 1.7 requires module `better_auth_1_7_additive` applied **before** Worker deploy. |
| Commit + push on `fix/better-auth-1.7-additive` | After `validate:full` green **and** explicit operator permission. T6 must not claim T2 done until `gh pr diff 130` contains the test file. |

**Out of this PR:** `retiredIds` / fail-closed sync for deleted `better_auth_1_7` — new kit issue after #128 lands. #130 must stay draft.

## Bootstrap Context

- `createMemoryEnv` today applies every `*.sql` lexically → 0014 already present; a post-0014 insert without issuer is **not** a legacy row.
- `migrations-apply.test.ts` proves schema/default/guard only; `insertLegacyAccount` uses password `'hash'` (not BA-verifiable).
- Seed uses `hashPassword` from `better-auth/crypto` (`seed-db.ts`). Test must use the same import, static.
- merge-on-green: `reviewed` + not draft = auto-merge. Agent must not add the label.

## Agents

| Agent | Task count | Files |
|-------|-----------|-------|
| tester-A | 2 | `memory-env.ts`, `auth-legacy-migration.test.ts` |
| doc-writer-A | 2 | `0014_*.sql` header, `product-consumer-contract.md` |
| devops-A | 2 | commit/push (permission-gated), then `gh pr edit` / `gh pr comment` |

## Wave Structure

4 waves, max 1 parallel agent (serial on #130). Elapsed ~1 session vs same sequential.

| Wave | Trigger | Agents | Tasks |
|------|---------|--------|-------|
| 1 | start | 1 | tester-A: T1→T2 |
| 2 | Wave 1 green | 1 | doc-writer-A: T3→T4 |
| 3 | Wave 2 done + operator permission | 1 | devops-A: T5 |
| 4 | T5 pushed | 1 | devops-A: T6 |

### Budget — per task

| Task | Items | Class | Est. ops | Split? |
|------|-------|-------|----------|--------|
| T1 through-option | 1 | bounded | 3 | — |
| T2 legacy sign-in test | 1 | judgmental | 6 | — |
| T3 SQL recovery header | 1 | bounded | 2 | — |
| T4 consumer contract line | 1 | bounded | 2 | — |
| T5 commit+push (permission + validate:full) | 1 | bounded | 3 | — |
| T6 PR body + comment after `gh pr diff` | 1 | bounded | 3 | — |

**Total estimated ops: 19**

### Budget — per agent instance

| Instance | Tasks | Σ ops | Subjects | Split? |
|----------|-------|-------|----------|--------|
| tester-A | T1, T2 | 9 | auth | — |
| doc-writer-A | T3, T4 | 4 | docs | — |
| devops-A | T5, T6 | 6 | pr | — |

## Consistency Report

- Criteria covered: 4/5 (legacy sign-in, recovery docs, DEFAULT permanence, deploy order)
- Uncovered: superseded-module tombstone (follow-up issue, not #130)
- Tasks without spec backing: all (no σ; sourced from AuthMigrationReview + advisory)
- Gold plating exemptions: tombstone / kit-schema-sync fail-closed deferred

## Micro-Tasks

### Criteria SC-1: legacy credential row signs in under BA 1.7

#### Task 1: Add optional migrate-through on memory env → tester-A
- **File:** `apps/example-api/src/test/memory-env.ts`
- **Snippet:** `createMemoryEnv({ through: '0013_tasks_comments.sql' })` — `applyMigrations` stops after that filename inclusive. Omit `through` → current behavior.
- **Verify:** `bun run --filter @kit/example-api test -- src/app.test.ts src/password-reset.test.ts` (ready)
- **Expected:** existing suites still  green (full migrate default)
- **Time:** 5 min
- **Difficulty:** 2
- **Traces:** SC-1
- **Phase:** GREEN

#### Task 2: New legacy sign-in test file → tester-A
- **File:** `apps/example-api/src/auth-legacy-migration.test.ts`
- **Snippet:** through 0013 → INSERT user/account (no issuer) with `hashPassword` from `better-auth/crypto` → `env.DB.exec(0014 sql)` → POST `/api/auth/sign-in/email` → status 200 + `set-cookie` contains session cookie (`__Secure-kit_session` or `kit_session` per `useSecureCookie` in test env). Assert `issuer = 'local:credential'` on the row after 0014.
- **Verify:** `bun run --filter @kit/example-api test -- src/auth-legacy-migration.test.ts` (ready)
- **Expected:** 1 file, 1+ tests pass. Fail if password is literal `'hash'` or if 0014 is applied before insert.
- **Time:** 10 min
- **Difficulty:** 3
- **Traces:** SC-1
- **Phase:** GREEN

### Criteria SC-2: operator can recover a half-applied D1 run

#### Task 3: Document recovery + rollback in SQL header → doc-writer-A
- **File:** `apps/example-api/migrations/0014_better_auth_1_7_additive.sql`
- **Snippet:** comments only: D1 is not transactional; if ALTER succeeded but index/ledger failed → inspect `PRAGMA table_info(account)` / `index_list`; finish index + `INSERT INTO d1_migrations`; do **not** re-run file. Rollback: `DROP INDEX account_issuer_accountId_uidx` then `ALTER TABLE account DROP COLUMN issuer`. DEFAULT `'local:credential'` is permanent (SQLite cannot drop DEFAULT cheaply).
- **Verify:** `bun run test:wrangler-migrations` (ready) — SQL still applies
- **Expected:** header only; no statement change
- **Time:** 5 min
- **Difficulty:** 1
- **Traces:** SC-2
- **Phase:** GREEN

### Criteria SC-3: consumers know deploy order

#### Task 4: Consumer contract checklist line → doc-writer-A
- **File:** `docs/kit/product-consumer-contract.md` (schema + checklist sections)
- **Snippet:** `@kit/auth` 1.7 requires catalog module `better_auth_1_7_additive` synced and applied **before** deploying a Worker that selects `account.issuer`. Else sign-in / session / reset → `no such column: issuer`.
- **Verify:** markdown-only; no test
- **Expected:** one normative sentence, no new ADR
- **Time:** 5 min
- **Difficulty:** 1
- **Traces:** SC-3
- **Phase:** GREEN

### Criteria SC-4: GitHub state matches evidence

#### Task 5: Commit and push #130 branch after permission → devops-A
- **File:** worktree `roxabi-boilerplate-cf-auth17-additive` only
- **Snippet:** Ask operator for commit+push (AGENTS.md: no commit without permission). Gate: `bun run validate:full` green. Then commit T1–T4 files and `git push` to `fix/better-auth-1.7-additive`. Do not add `reviewed`. Do not merge.
- **Verify:** `bun run validate:full` then `git status --short --branch` on the worktree (ready)
- **Expected:** commits on remote branch; working tree clean of T1–T4 files
- **Time:** 8 min
- **Difficulty:** 2
- **Traces:** SC-4
- **Phase:** GREEN

#### Task 6: Honest PR #130 body + review comment → devops-A
- **File:** GitHub #130 only
- **Snippet:** **First** `gh pr diff 130 --name-only` must list `apps/example-api/src/auth-legacy-migration.test.ts`. Only then may the body say T2 is done. Include recovery from T3, DEFAULT permanence, tombstone deferred. `gh pr comment` with AuthMigrationReview findings. Never `--add-label reviewed`. Keep draft.
- **Verify:** `gh pr view 130 --json isDraft,labels` → draft, labels `[]`; `gh pr diff 130 --name-only` contains the new test (ready)
- **Expected:** no `reviewed`; no merge; no claim without files on the PR
- **Time:** 5 min
- **Difficulty:** 1
- **Traces:** SC-4
- **Phase:** GREEN

## Task Seeding Blueprint

### Wave 1 — no deps, 1 agent

| Task | Agent instance | blockedBy | Subject |
|------|---------------|-----------|---------|
| T1 | tester-A | — | auth |
| T2 | tester-A | T1 | auth |

### Wave 2 — after Wave 1

| Task | Agent instance | blockedBy | Subject |
|------|---------------|-----------|---------|
| T3 | doc-writer-A | T2 | docs |
| T4 | doc-writer-A | T3 | docs |

### Wave 3 — after Wave 2 + operator permission

| Task | Agent instance | blockedBy | Subject |
|------|---------------|-----------|---------|
| T5 | devops-A | T4 | pr |

### Wave 4 — after T5 pushed

| Task | Agent instance | blockedBy | Subject |
|------|---------------|-----------|---------|
| T6 | devops-A | T5 | pr |

## Follow-up (not this PR)

- Kit `retiredIds` / `supersededBy` on `kit-schema-modules.json` + fail-closed `kit-schema-sync` when a product manifest still lists `better_auth_1_7`.
- Inventory consumers that synced during the 1e1e8f1 window (duplicate `issuer` column risk).
- Human: review #128 → audit remote D1 → retarget #129 to main → then #130.

## Task IDs

<!-- Generated by /plan. Used by /implement to resume tasks on session restart. -->
- T1: Add migrate-through option on memory-env — auth
- T2: Add auth-legacy-migration sign-in test — auth
- T3: Document D1 recovery in 0014 SQL header — docs
- T4: Add auth 1.7 deploy-order line to consumer contract — docs
- T5: Ask permission then commit and push after validate:full — pr
- T6: Update #130 body only after gh pr diff shows test file — pr

