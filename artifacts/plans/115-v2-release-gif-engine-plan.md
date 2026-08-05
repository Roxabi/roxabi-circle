---
title: "Plan: V2 — Release GIF engine (local, from Metalyde)"
issue: 115
spec: artifacts/specs/115-v2-release-gif-engine-spec.md
complexity: 4/10
tier: F-lite
generated: 2026-08-04T14:20:00Z
slice: V2.1-V2.4
---

## Summary

Extract Metalyde recorder into `tooling/release-gifs/` (cursor, ffmpeg, auth, recordClip), wire thin example-web setup/record + 1–2 dogfood scenarios, amend recipe §V2. Local only; no CI; no package. Soft: public gifSrc if small asset practical.

## Architecture

**Data flow:** [data flow](../visuals/115-v2-release-gif-engine-data-flow.html)  
**File map:** [file map](../visuals/115-v2-release-gif-engine-file-map.html)

```text
tooling/release-gifs (engine)
  ↑ import
apps/example-web/scripts/{setup,record,scenarios}
  → artifacts/release-gifs/*-share.gif
  → optional public/ + gifSrc
```

## Bootstrap Context

- Ref: `extern-client-metalyde/scripts/record-release-gifs.mjs` (cursor + ffmpeg + recordClip)
- Ref: `extern-client-metalyde/scripts/setup-release-gifs-local.mjs` (BA API login)
- Ref: `apps/example-web/scripts/e2e-design-system.mjs` (kit ports, demo user, playwright-core)
- L1: `content/releases` gifSrc, `routes/changelog.tsx` img

## Agents

| Agent | Tasks | Focus |
|-------|-------|-------|
| devops-A | T1–T4 | engine modules |
| frontend-dev-A | T5–T7 | kit scripts + scenarios + soft gifSrc |
| doc-writer-A | T8–T9 | recipe + gitignore |
| tester-A | T10 | refuse-prod smoke + RED-GATE |

## Wave Structure

3 waves. Elapsed ~1d.

| Wave | Trigger | Agents | Tasks |
|------|---------|--------|-------|
| 1 | start | devops-A | T1→T2→T3→T4 |
| 2 | W1 done | frontend-dev-A ∥ doc-writer-A | T5→T6→T7 · T8→T9 |
| 3 | W2 done | tester-A | T10 RED-GATE |

### Budget — per task

| Task | Class | Est. ops |
|------|-------|----------|
| T1 cursor-init | bounded | 3 |
| T2 ffmpeg-gif | judgmental | 5 |
| T3 auth-setup | judgmental | 5 |
| T4 record-core | judgmental | 6 |
| T5 kit setup script | bounded | 3 |
| T6 scenarios + record | judgmental | 6 |
| T7 package.json + gitignore | trivial | 2 |
| T8 recipe §V2 | bounded | 3 |
| T9 soft gifSrc | trivial | 2 |
| T10 RED-GATE | bounded | 3 |

**Total ~38 ops**

### Budget — per agent instance

| Instance | Tasks | Σ ops | Split? |
|----------|-------|-------|--------|
| devops-A | T1–T4 | 19 | — |
| frontend-dev-A | T5–T7 | 11 | — |
| doc-writer-A | T8–T9 | 5 | — |
| tester-A | T10 | 3 | — |

## Consistency Report

| Metric | Value |
|--------|-------|
| AC1–AC7 | T1–T10 |
| AC8 soft | T9 |
| Breadboard E* K* D* C1 | covered |
| Exempt | Metalyde product refactor |

## Micro-Tasks

### T1 — cursor-init.mjs
- **Agent:** devops-A · **Subject:** engine
- **File:** `tooling/release-gifs/cursor-init.mjs`
- **Desc:** Export `CURSOR_INIT_SCRIPT` (from Metalyde; no product strings).
- **Verify:** `test -f tooling/release-gifs/cursor-init.mjs && grep -q CURSOR_INIT_SCRIPT tooling/release-gifs/cursor-init.mjs`
- **Spec:** E1 · AC1 · Est 10m

### T2 — ffmpeg-gif.mjs
- **Agent:** devops-A · **Subject:** engine · deps T1
- **File:** `tooling/release-gifs/ffmpeg-gif.mjs`
- **Desc:** `webmToGif`, `probeDuration`, env `GIF_SPEED`/`GIF_FPS`/`GIF_TRIM_*`; clear error if ffmpeg missing.
- **Verify:** `grep -q webmToGif tooling/release-gifs/ffmpeg-gif.mjs`
- **Spec:** E2 · AC1 · Est 15m

### T3 — auth-setup.mjs
- **Agent:** devops-A · **Subject:** engine · deps T2
- **File:** `tooling/release-gifs/auth-setup.mjs`
- **Desc:** Factory `runAuthSetup(config)`: health, BA POST `/api/auth/sign-in/email`, extraCookies, storageState path; **hint JSON without password**; refuse forbidden hosts.
- **Verify:** `grep -q runAuthSetup tooling/release-gifs/auth-setup.mjs && ! grep -q password.*hint tooling/release-gifs/auth-setup.mjs || true`
- **Spec:** E3 · AC2 · AC7 · Est 15m

### T4 — record-core.mjs + index
- **Agent:** devops-A · **Subject:** engine · deps T3
- **Files:** `tooling/release-gifs/record-core.mjs`, `tooling/release-gifs/README.md` (or package note)
- **Desc:** `moveClick`, `ensureCursor`, `recordClip(config, {name,startPath,demo})`, `ensureAuthState`; re-export barrel if useful; document imports from monorepo root.
- **Verify:** `grep -q recordClip tooling/release-gifs/record-core.mjs`
- **Spec:** E4 · AC1 · Est 20m

### T5 — setup-release-gifs.mjs (kit)
- **Agent:** frontend-dev-A · **Subject:** kit · deps T4
- **File:** `apps/example-web/scripts/setup-release-gifs.mjs`
- **Desc:** Kit defaults `http://127.0.0.1:5173`, demo@gosilex.local, outDir under repo `artifacts/release-gifs`, call engine.
- **Verify:** `test -f apps/example-web/scripts/setup-release-gifs.mjs`
- **Spec:** K1 · AC2 · Est 10m

### T6 — scenarios + record script
- **Agent:** frontend-dev-A · **Subject:** kit · deps T5
- **Files:** `apps/example-web/scripts/release-gifs-scenarios.mjs`, `record-release-gifs.mjs`
- **Desc:** Scenarios `01-notes` and/or `02-changelog` (short, resilient); `RECORD_ONLY` filter; call recordClip.
- **Verify:** `grep -q changelog apps/example-web/scripts/release-gifs-scenarios.mjs || grep -q notes apps/example-web/scripts/release-gifs-scenarios.mjs`
- **Spec:** K2 K3 · AC3 AC4 · Est 25m

### T7 — package.json scripts + gitignore
- **Agent:** frontend-dev-A · **Subject:** kit · deps T6
- **Files:** `apps/example-web/package.json`, root `.gitignore`
- **Desc:** `setup:release-gifs` / `record:release-gifs`; ignore `artifacts/release-gifs/*` except `.gitkeep` (or documented patterns); keep `*.webm` out.
- **Verify:** `grep -q setup:release-gifs apps/example-web/package.json`
- **Spec:** K4 D2 · AC3 AC6 · Est 8m

### T8 — recipe §V2
- **Agent:** doc-writer-A · **Subject:** docs · deps —
- **File:** `docs/recipes/changelog-l1.md` (+ optional `docs/templates/release-gifs/README.md`)
- **Desc:** Prereqs (seed, api, web, chromium, ffmpeg); commands; ownership engine vs product scenarios; not in CI.
- **Verify:** `grep -q V2 docs/recipes/changelog-l1.md || grep -qi gif docs/recipes/changelog-l1.md`
- **Spec:** D1 · AC5 · Est 10m

### T9 — soft gifSrc
- **Agent:** doc-writer-A or frontend-dev-A · **Subject:** content · deps T6
- **File:** `apps/example-web/src/content/releases/index.ts` and/or recipe note
- **Desc:** If not committing large GIFs: document `gifSrc` path convention. If tiny placeholder optional — prefer doc over multi-MB commit.
- **Verify:** `grep -q gifSrc apps/example-web/src/content/releases/index.ts || grep -q gifSrc docs/recipes/changelog-l1.md`
- **Spec:** C1 · AC8 · Est 5m

### T10 — RED-GATE
- **Agent:** tester-A · **Subject:** gate · deps T7,T8,T9
- **Desc:** Refuse-prod unit/smoke if extractable; `! packages/patchlog`; typecheck still green; document manual record in PR; no CI workflow file for gifs.
- **Verify:** `! test -d packages/patchlog && ! grep -r release-gif .github/workflows 2>/dev/null; bun run --filter @gosilex/example-web typecheck`
- **Spec:** AC1–AC7 · Est 15m

## Task Seeding Blueprint

### Wave 1

| Task | Agent instance | blockedBy | Subject |
|------|---------------|-----------|---------|
| T1 | devops-A | — | engine |
| T2 | devops-A | T1 | engine |
| T3 | devops-A | T2 | engine |
| T4 | devops-A | T3 | engine |

### Wave 2

| Task | Agent instance | blockedBy | Subject |
|------|---------------|-----------|---------|
| T5 | frontend-dev-A | T4 | kit |
| T6 | frontend-dev-A | T5 | kit |
| T7 | frontend-dev-A | T6 | kit |
| T8 | doc-writer-A | — | docs |
| T9 | doc-writer-A | T8 | content |

### Wave 3

| Task | Agent instance | blockedBy | Subject |
|------|---------------|-----------|---------|
| T10 | tester-A | T7,T8,T9 | gate |

## Out of plan

Metalyde product refactor · CI · L2 package

## Task IDs

<!-- Generated by /plan. Used by /implement to resume tasks on session restart. -->
- T1: T1 — engine cursor
- T2: T2 — engine ffmpeg
- T3: T3 — engine auth
- T4: T4 — engine record-core
- T5: T5 — kit setup
- T6: T6 — kit scenarios/record
- T7: T7 — package.json gitignore
- T8: T8 — recipe V2
- T9: T9 — soft gifSrc
- T10: T10 — gate
