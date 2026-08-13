---
title: "chore(deps): wave 5b — TypeScript → 7"
description: "Bump monorepo typescript 5.9→7 (native tsc); fix 6/7 hard deprecations; permanent ts-major gate; green typecheck · build:kit · validate:full."
type: spec
status: approved
normative: false
issue: 24
tier: F-lite
---

## Context

**Promoted from:** [frame #24 TypeScript 7](../frames/24-typescript-7-frame.md) (F-lite — analyze skipped)
**GitHub issue:** #24
**Related:** Waves #19–#23 closed (last remaining deps wave); Dependabot **PR #12** already opens `typescript` **5.9.3 → 7.0.2** across the same 15 manifests; AGENTS stack still says **TypeScript 5.9+**; prefer not concurrent with heavy #30/#31 type churn; mirror go-silex/silex-boilerplate#104

## Intent

Align the monorepo compiler with **TypeScript 7**. Root and all workspace packages still pin **`typescript` ^5.9.0** (resolved **5.9.3**). Dependabot already opened **PR #12** for 7.0.2, but TypeScript **7 is the native (Go) port** of the compiler: typechecking matches **TS 6.0 defaults** (6.0 deprecations become **hard errors**), and **7.0 does not ship the JS Compiler API** (tools may need Microsoft’s dual-install pattern). A blind Dependabot merge can green-exit without owned triage of that surface — this wave owns the bump, forced config/source fixes, permanent major assert (parity with `zod-major`), and full gate proof.

## Goal

All fifteen `package.json` manifests that declare `typescript` (root + 14 workspaces) pin **`^7.0.2`** (or newer 7.x patch at implement); after clean install kit **`tsc` is TypeScript 7.x**; permanent D2 gate (`ts-major`, mirror `zod-major`) is green; monorepo first-party `typecheck` · `build:kit` · `validate:full` exit 0 under that compiler; AGENTS documents **TypeScript 7+**; dedicated PR closes #24 and **supersedes Dependabot #12 before merge**.

## Users

- **Kit maintainers** landing deps waves and running local/CI gates (`typecheck`, `build:kit`, `validate:full`, `ts-major`)
- **Product repos** that pull the kit later (consumers inherit the major on `fetch upstream` — no separate product proof in this issue)

## Out of Scope

- Other runtime majors already waved or separate (Zod, Vitest, Vite, FastMCP, Bun, lefthook, lucide)
- New TS language-feature adoption beyond what the upgrade forces
- Product apps outside this monorepo (consumers pull after land)
- Concurrent redesign of flows runner / agent packages (#30/#31+) beyond type fixes forced by `tsc` 7
- Drive-by redesign of `tsconfig` `target` / `module` / bundler baseline — **required** 6/7 deprecation fixes (e.g. drop `baseUrl`) **are in scope**
- Flipping `skipLibCheck` to false for a full dependency-lib audit (baseline stays `true` unless TS 7 forces a documented change)
- Merging Dependabot **PR #12** as the ship unit

## Expected Behavior

1. **Inventory** every manifest that pins `typescript` today (**15** known, all `^5.9.0`):
   - root `package.json` `devDependencies.typescript`
   - `packages/{core,auth,db,storage,types,ui,email,i18n,mcp,flows,api-client}`
   - `apps/{example-api,example-web,mcp-example}`
   - `@kit/config` has **no** `typescript` pin (exports `tsconfig.base.json` only) — leave unless implement discovers a need
2. **Bump** every declared `typescript` range to **`^7.0.2`** (or newer 7.x patch if npm latest at implement — same target as Dependabot #12 unless a newer patch is required). Clean install: `rm -rf node_modules && bun install` (commit updated `bun.lock`).
3. **Single-major assert (D2) — permanent machine gate (mirror `zod-major`):**
   - Ship `scripts/check-typescript-major.sh` + root script `ts-major` (name at implement) wired into `validate` / `validate:full`.
   - Fail if any of the 15 manifests pin `typescript` outside `^7…`, or if the lock resolves non-allowlisted `typescript@5.` for kit workspaces.
   - Prefer one resolved **compiler** major for kit `tsc` (7.x). Residual nested 5.x → eliminate or allowlist `{package, why}`.
   - **Dual-install exception (document if used):** if a tool requires the JS Compiler API (absent in 7.0), allow Microsoft’s side-by-side pattern (`typescript` API 6 + native 7 `tsc`) with typecheck scripts binding to **native `tsc` 7**; PR table `{package, why}`; D2 allowlist names the alias. End state must **not** leave kit gates on 6-only `tsc`.
4. **Fix first-party TypeScript 6/7 hard deprecations and diagnostics only as required:**
   - **Known forced:** `packages/ui/tsconfig.json` uses `"baseUrl": "."` + `paths` — `baseUrl` is unsupported under 6/7; drop `baseUrl` and re-express `paths` relative to config root (minimal, not redesign)
   - Other 6/7 hard deprecations (`moduleResolution: node10`, legacy targets, etc.) only if present and red
   - First-party package/app type errors under existing **`strict: true`** + **`skipLibCheck: true`**
   - Tool peers (`@types/*`, Vitest, Vite, Wrangler types) only if typecheck/tests/build fail after bump
   - Prefer minimal local fixes; **forbidden end state:** `strict: false`, mass bare `@ts-ignore`, permanent `ignoreDeprecations` as the only fix
5. **Escape hatch (issue DoD):** Prefer **single hop 5.9 → 7** after clean install + forced typecheck. Upstream-aligned alternative: land **6.0-compatible config/deprecation fixes** first. Use intermediate **5.9 → 6 → 7** commits on the **same PR branch** only if implement records (a) multi-package error flood under 7, or (b) tool peer refuses 7 while accepting 6 — and only after confirming a usable 6.x bridge exists on the registry. Green `bun run typecheck` at each hop; end state lock **must** be 7.x (or dual-install with `tsc`=7). Do not merge mid-hatch; do not leave monorepo on 6.x as final.
6. **Docs SSoT:** update **AGENTS.md** Language row **TypeScript 5.9+ strict → TypeScript 7+ strict**; grep kit docs for residual “5.9” as *target* (not historical issue text) and fix hits. Do not invent new language-feature guidance.
7. **Cross-track (process DoD):** During #24 open window, **do not merge** heavy #30/#31 type-churn PRs without rebase + re-run typecheck / validate:full on the survivor. **Close/supersede Dependabot PR #12 before merge** of the dedicated #24 PR (block parallel merge-on-green if #12 gets `reviewed`). Do **not** merge #12 as ship unit. Do **not** label #12 `reviewed`.
8. **Gates after clean install** (all required; local-primary doctrine):
   - D2: `bun run ts-major` (or chosen name) exits 0
   - `turbo run typecheck --force` (or `TURBO_FORCE=true bun run typecheck`) once under TS 7 — bust turbo cache so compiler binary change is not a cache hit
   - `bun run build:kit`
   - Before push: `bun run validate:full` (includes typecheck + build:kit + smoke + coverage)
9. **PR triage attestation (anti–manifest-only false close):** PR body must include clean-install + D2 evidence and **either** (a) non-empty list of TS7-forced source/tsconfig fixes **or** (b) explicit “0 new first-party diagnostics under typescript@7.x after clean install + forced typecheck” with log excerpt. Ship vehicle is the **dedicated #24 PR only**.
10. Dedicated PR against `main` closes #24. Title: `chore(deps): wave5b typescript7…`. **Isolated** from other majors.

## Data Model & Consumers

### Data Structure

No application domain model change. Compiler dependency + docs + gate script surface only:

| Package / path | Field / API | Today | Target |
|----------------|-------------|-------|--------|
| root `package.json` | `devDependencies.typescript` | `^5.9.0` → 5.9.3 | `^7.0.2` (or newer 7.x) |
| 14 workspace `package.json` | `devDependencies.typescript` | `^5.9.0` | same as root |
| lockfile | `typescript@…` | **5.9.3** | **7.x** kit `tsc` (+ optional dual-API allowlist) |
| `scripts/check-typescript-major.sh` + `ts-major` | permanent D2 | absent | present in validate:full |
| `packages/ui/tsconfig.json` | `baseUrl` + `paths` | `baseUrl: "."` | no `baseUrl`; paths re-expressed |
| `packages/config/tsconfig.base.json` | compilerOptions | strict ES2022 bundler, `skipLibCheck: true` | unchanged unless TS 7 forces |
| `AGENTS.md` stack | Language row | TypeScript **5.9+** | TypeScript **7+** |

### Consumers

| Consumer | Consumes | When | Status |
|----------|----------|------|--------|
| turbo `typecheck` tasks | local `typescript` + tsconfig | every package | This issue |
| `build:kit` | example-api + example-web builds | CI / pre-push | This issue |
| `validate:full` / lefthook pre-push | includes `ts-major` + typecheck + build:kit | every push | This issue |
| Vitest / Vite / Wrangler types | TS compiler peers | test/build | This issue if break |
| Product apps | kit TS major on upstream pull | after merge | Future (no product AC) |
| Dependabot PR #12 | same 15 manifests | open baseline | Close **before** dedicated merge |

## Breadboard

### Dep axis

| ID | Element | Handler | Data |
|----|---------|---------|------|
| D1 | Fifteen `package.json` `typescript` pins (root + 14 workspaces) | edit + clean `bun install` | lock TS 7.x |
| D2 | Permanent single-major assert | `check-typescript-major.sh` + `ts-major` in validate:full | pins ^7; lock allowlist-aware |

### Compile / adapter axis

| ID | Element | Handler | Data |
|----|---------|---------|------|
| A1 | Monorepo forced typecheck + 6/7 deprecations | fix errors + ui `baseUrl` + minimal tsconfig | typecheck green under tsc 7 |
| A2 | example-api + example-web builds | fix only if break | build:kit green |
| A3 | Tool peers / Compiler-API consumers | bump or dual-install only if red | minimal; no drive-by majors |
| A4 | Escape hatch 6→7 (only if needed) | intermediate commits + typecheck each hop | end state still tsc 7.x |
| A5 | AGENTS (+ residual kit docs 5.9 targets) | edit | 7+ documented |

### Ship axis

| ID | Element | Handler | Data |
|----|---------|---------|------|
| S1 | Forced typecheck + D2 | monorepo | exit 0 |
| S2 | `bun run build:kit` | turbo filter | exit 0 |
| S3 | `bun run validate:full` | root scripts | exit 0 |
| S4 | Dedicated PR for #24 + triage attestation | open against main | not Dependabot #12 |
| S5 | Cross-track + Dependabot | process | #12 closed **before** merge; #30/#31 not dirty |

### Wiring

```
D1 → clean bun install → D2 script green
  → A1–A3 where typecheck/build break (A4 only if hatch trigger)
  → A5 docs
  → S1 (force typecheck) + S2 → S3 validate:full → S4 PR (+ S5 process)
```

## Slices

**Ship rule:** slices are **commit/logic gates**, not separately mergeable PRs. Mergeable only when S1+S2+S3 green and S4/S5 process complete. Manifest-only bump — **including a green Dependabot #12** — is **not** a ship unit even if S1–S3 exit 0; S4 requires dedicated PR + triage attestation.

| # | Name | Scope (IDs) | Demo criteria |
|---|------|-------------|---------------|
| 1 | Manifest + lock + D2 script | D1, D2 | all 15 pins `^7.0.2`(+patch); `ts-major` green — **not mergeable alone** |
| 2 | Compile green + docs | A1–A5, S1, S2 | forced typecheck + build:kit green; ui `baseUrl` fixed if still present; AGENTS TS 7+ — **required for ship** |
| 3 | Ship process | S3, S4, S5 | `validate:full` green; dedicated #24 PR + attestation; #12 closed before merge |

## Success Criteria

- [ ] All fifteen `package.json` files that declare `typescript` (root + 14 workspaces) pin **`^7.0.2`** (or newer 7.x patch); no `^5.9` left in those files
- [ ] D2 enforced by `bun run ts-major` (or name chosen at implement) exit 0; script is in `validate` / `validate:full`; allowlist only in script + PR table if unavoidable
- [ ] Evidence of **forced** typecheck under typescript 7.x after clean install (turbo `--force` / `TURBO_FORCE`) — not only a pre-bump cache hit
- [ ] `bun run typecheck` exits 0 (and is re-run under force at least once on the wave branch)
- [ ] `bun run build:kit` exits 0
- [ ] `bun run validate:full` exits 0 before push
- [ ] `packages/ui` has no `baseUrl` (or documented exception if TS 7 restored support — unexpected)
- [ ] `AGENTS.md` stack Language row documents **TypeScript 7+** (not 5.9 as target)
- [ ] No new `strict: false` (or equivalent) in kit `tsconfig*`; no new bare `@ts-ignore`; `@ts-expect-error` only with adjacent reason + PR note
- [ ] No `tsconfig` `target`/`module`/bundler baseline change unless required for TS 7 and listed in PR body with the diagnostic that forced it
- [ ] End state is kit **`tsc` TypeScript 7.x** (not left on 6-only); if escape hatch or dual-install used, documented in PR
- [ ] PR body includes triage attestation: clean-install + D2 evidence + (fixes list **or** “0 new first-party diagnostics” log excerpt)
- [ ] Dedicated PR for #24; title shape `wave5b`/`typescript7`; **no** unrelated majors as payload; ship vehicle is **not** Dependabot #12
- [ ] Dependabot PR #12 closed/superseded **before** dedicated #24 merges
- [ ] Diff contains no product-domain or flows redesign beyond type fixes forced by `tsc` 7
- [ ] No silent `skipLibCheck` flip to false without PR justification; no claim of full dependency-lib audit

## Edge Cases

| Case | Handling |
|------|----------|
| Single hop 5.9→7 floods errors | Hatch: confirm 6.x bridge exists; 5.9→6→7 same branch; typecheck green each hop; end on 7 |
| No useful TS 6.x bridge | Hatch N/A — single hop only; document in PR |
| Dependabot #12 still open | Close/supersede **before** dedicated merge; never label #12 `reviewed` |
| Dependabot #12 merges first | Rebase wave branch; still land dedicated proof PR if #12 was version-only; prefer close #12 early |
| Tool needs JS Compiler API (no typescript.js in 7.0) | Prefer pure `typescript@^7` first (kit has no `import 'typescript'`). If gate tool fails: dual-install; D2 allowlist; kit `tsc` remains 7 |
| #30/#31 concurrent type churn | Do not merge without rebase + re-run typecheck/validate:full |
| Residual nested typescript 5.x | Prefer eliminate; else allowlist table + script allowlist |
| `packages/ui` `baseUrl` | **In scope** A1 — not OOS redesign |
| Temptation to redesign tsconfig target/module | Hard OOS unless required; list diagnostic in PR |
| packages/config has no TS pin | Leave unless implement proves need |
| Temptation to ship green #12 alone | Not a ship unit — S4 attestation + dedicated PR required |
| Turbo cache hides new tsc | Forced typecheck once after clean install |
| Native tsc OOM on CI runners | Only if observed: document checker/single-thread flag — do not pre-optimize |

## χ

- Confirm at implement whether a usable **TS 6.x bridge** exists for the escape hatch (else hatch N/A)
- Confirm Dependabot **#12** still targets ~7.0.2 and is open at implement start
- Dual-install needed only if a **tool** fails without JS Compiler API — unknown until after bump
- Error-bar for “non-viable single hop” chosen at implement and written in PR if hatch used
