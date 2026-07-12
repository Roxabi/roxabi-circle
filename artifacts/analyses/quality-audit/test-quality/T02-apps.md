# Test Quality — T2 apps

**Date:** 2026-07-12  
**Partition:** `apps/**/*.{test,spec}.{ts,tsx}` (+ co-located e2e / smoke scripts invoked by app `package.json` `test` / `test:e2e:*`)  
**Focus:** auth paths · IDOR · validation negatives · flaky patterns · e2e scripts quality  
**CP map:** `docs/testing.md` CP-\* (app-owned seams)  
**Out of scope:** package unit suites (→ T1); coverage floors inventory (→ T3); product `share-*` (absent)

## Summary

App tests are the **composition spine** for the kit: `apps/example-api/src/app.test.ts` is a real HTTP integration suite over `createApp()` + `createMemoryEnv()` and already proves the hardest demo contracts — dual auth (cookie + `sk_`), cookie flags, CORS non-reflect, fail-closed `SESSION_SECRET`, notes IDOR (A vs B → 404), unauth 401, R2 `demo/` prefix, and one login Zod negative. That is the right pyramid layer for ADR-0002 seam 2.

Gaps are concentrated in **negatives and matrix completeness**, not happy-path theater: protected routes beyond `POST /api/notes` lack explicit **CP-UNAUTH** cases; **create-note Zod** has zero failure tests; **logout / invalid session / Bearer-over-cookie precedence** are untested; FE **AuthGate / AdminGate / `lib/auth.ts`** sit at **0% coverage** despite T0 “FE auth client” language; design-system browser e2e is **sleep-driven, Chrome-path-hardcoded, not in CI**. mcp-example unit + `stdio-smoke.mjs` are lean and intentional. **No P0** (no false-green security theatre that would hide a known open route). Highest fix value: expand `app.test.ts` negative matrix + thin FE gate unit tests before more routes land.

## Findings

| ID | Severity | File | Finding | Evidence |
|----|----------|------|---------|----------|
| TQ-T02-001 | **P1** | `apps/example-api/src/app.test.ts` · routes `me` / `notes` / `demo` | **CP-UNAUTH matrix incomplete: only `POST /api/notes` is asserted unauthenticated.** Five other protected handlers also call `requireAuth` but have **no** dedicated “without auth → 401 `UNAUTHORIZED`” case. A future handler that omits `requireAuth` (SEC-P05-002 fail-open pattern) would only be caught if that verb/path happened to be exercised. | Tested: `POST /api/notes` unauth (L37–54). **Missing:** `GET /api/me`, `POST /api/keys`, `GET /api/notes`, `GET /api/notes/:id`, `DELETE /api/notes/:id`, `POST /api/demo/email`. |
| TQ-T02-002 | **P1** | `apps/example-api/src/app.test.ts` · `routes/notes.ts` `createNoteSchema` | **Validation negatives almost absent at app layer.** Only login body negative (`email: 'not-an-email'` → 400 `VALIDATION_ERROR`). **Zero** tests for note create Zod: empty `title`, title >200, body >10k, missing body after auth, non-JSON / null body after auth. `fieldErrors` never asserted. Branch gaps match coverage: notes routes ~91% lines / validation branch open. | `createNoteSchema` min/max in `notes.ts` L10–14; sole validation it: `app.test.ts` L56–71. No `fieldErrors` expect anywhere under apps tests. |
| TQ-T02-003 | **P1** | `apps/example-web/src/lib/auth.ts` · `components/app-shell.tsx` AuthGate/AdminGate | **FE auth client contracts (seam 3 beyond `apiFetch`) untested.** `useMe`, `isUnauthorized`, `isAdmin`, `AuthGate` (401 → `/login`), `AdminGate` (non-admin → `/` + forbidden copy) have **0%** coverage. docs/testing.md pins T0 “FE auth client contracts” + **CP-FE-CRED**; only `api.test.ts` covers credentials + envelope map. SPA gates can regress without red pre-push. | `coverage-summary.json` example-web: `auth.ts` 0%, `app-shell.tsx` 0%, `login.tsx` 0%. Tests: `api.test.ts` only for credentials/`ApiError`. |
| TQ-T02-004 | **P1** | `apps/example-web/scripts/e2e-design-system.mjs` | **E2E script is sleep-based and environment-fragile (classic flake class).** Three fixed `waitForTimeout(500/300/200)` after navigation/clicks; `waitUntil: 'networkidle'` (hang-prone under concurrent local servers); hard default `CHROME_PATH=/usr/bin/google-chrome` (fails on Chromium-only / Nix / CI without that path); hardcoded demo email/password; requires **manual** API+web already up — no spawn/health wait. Not in `ci.yml` / `validate:full` (B6 intentional) but quality of the script itself is low for when it *is* run. | L17–20 launch; L44 `networkidle`; L62/68/84 sleeps; L52–55 credentials; package `test:e2e:design-system` not referenced by root CI. |
| TQ-T02-005 | **P2** | `apps/example-api/src/app.test.ts` · `routes/auth.ts` | **Auth path negatives incomplete vs dual-auth resolve order.** Covered: good password → cookie+HttpOnly+SameSite; wrong password 401; mint `sk_` + Bearer me; bad Bearer 401; Secure on staging. **Missing:** `POST /api/auth/logout` clears cookie / me fails after logout; **tampered or wrong-secret session cookie → 401**; **expired `exp` session → 401** (package may own crypto; app wire not composed); **Bearer present but invalid does not fall through to valid cookie** (code throws at L99 `services/auth.ts` — critical precedence, untested); mint without session; unknown email login. | Resolve order comment in security audit; `resolveAuth` L94–108; no logout it; no dual-header conflict it. |
| TQ-T02-006 | **P2** | `apps/example-api/src/app.test.ts` IDOR block | **CP-IDOR present for notes (good) but single-resource, incomplete mutation surface story.** A creates note; B list excludes id; B get 404; B delete 404; A still 200 — solid. No case that B **cannot create-as-A** (N/A — subject from auth only). No second resource type (keys are mint-only). Risk: next protected resource lands without IDOR copy (docs PR rule) — no test helper / shared pattern to make that cheap (login ceremony paste ×6 worsens this — SMELL-T01-002). | IDOR it L337–397; only notes. |
| TQ-T02-007 | **P2** | `apps/example-api` demo + email | **`POST /api/demo/email` has no integration test (auth or happy path).** Route ~55% lines; `services/email.ts` ~1.7% lines. Authz regression on demo route and transport fallback are invisible. Low product risk for kit demo but **coverage hole under T0 api floor** is papered by high coverage elsewhere. | coverage-summary: demo.ts 55.55%, email.ts 1.66%; no `demo/email` in app.test.ts. |
| TQ-T02-008 | **P2** | `apps/example-web/src/lib/api.test.ts` | **`apiFetch` mock suite is solid for CP-FE-CRED but stops short of auth-helper contracts.** Good: `credentials: 'include'`, nested UNAUTHORIZED → `ApiError`, non-JSON → `HTTP 502`. **Missing:** empty body ok path; invalid JSON on **ok** response; `details`/`fieldErrors` passthrough on ApiError; merge of custom headers vs default content-type; `VITE_API_URL` prefix. Acceptable thinness if FE gate tests exist (they do not — TQ-T02-003). | 4 its, ~69 LOC; no test for `auth.ts` `isUnauthorized` using same ApiError. |
| TQ-T02-009 | **P2** | `apps/example-web/src/routes/design-system.overlays.test.tsx` | **Overlay contract tests are package re-proof, not app route wiring; not security-relevant.** Mounts Dropdown/Dialog/Sheet/Tooltip **without** `DesignSystemPage`, AuthGate, or router. Valuable for Base UI traps but **does not** prove admin-gated route or e2e login cookie journey. Local `captureErrors` + text selectors — mild brittleness (SMELL-T01). Does not use fake timers — not flaky. | L59–122; page never imported from `design-system.tsx`. |
| TQ-T02-010 | **P2** | `apps/mcp-example/scripts/stdio-smoke.mjs` · `src/index.test.ts` | **stdio smoke is good allowlist proof; unit test is registration-only (by design).** Smoke: exact `ping`+`whoami`, ban `share_*`, call tools, 5s poll timeout, kills child — **wired into `package.json` `test`** (stronger than web e2e). Residual: poll/`setTimeout` can flake under extreme load; no assert on **whoami semantics** (key presence only — documented); no negative “missing API_KEY” case; transcript size on failure capped at 2k. Unit tests do not mock FastMCP private fields (correct) but **would stay green if tools/list diverged from REGISTERED list without smoke** — smoke is the live belt. | `package.json` `"test": "vitest run && bun run scripts/stdio-smoke.mjs"`; smoke L99–107 exact tools; index.test.ts L6–18. |
| TQ-T02-011 | **P3** | `apps/example-api/src/app.test.ts` L8–17 | **Side-effect scratch I/O (`writeScratch`) in health/error tests.** Hard-coded goal session path under `/tmp/grok-goal-…`; silent catch. Not flaky (assert still runs) but pollutes hosts and signals goal residue — distracts from contract assertions. | `SCRATCH` L8; used L30–34, L53. |
| TQ-T02-012 | **P3** | `apps/example-web/src/lib/i18n.test.ts` · `messages.contract.test.ts` | **i18n tests are thin smoke / catalog hygiene (appropriate for CP-I18N), not semantic.** Default FR + one string pair; contract loops non-empty / no TODO / no script-ish. Key parity belt. **Not** a finding of missing security — residual that copy quality is not reviewed by tests (docs already say so). | i18n 1 it; messages 2 its. |
| TQ-T02-013 | **P3** | `apps/example-api/src/seed/seed-db.test.ts` | **Seed suite healthy but no production-gate invariant.** Idempotent + reset covered with injected `now`. Missing: “seed must not run / must refuse when ENVIRONMENT=production” once SEC-P05-001 is fixed — test debt tracks product debt. | 2 its, memory env, good model size (~38 LOC). |
| TQ-T02-014 | **P3** | Vitest apps inventory | **No `*.spec.*` files; no `vi.useFakeTimers`; no real network in unit tests; no snapshots** — healthy anti-flake baseline for Vitest layer. E2e/smoke scripts are the only timing/network surfaces. | 7 test modules under apps; greps clean for fake timers / snapshots in `*.test.*`. |
| TQ-T02-015 | **P3** | `apps/example-web/scripts/e2e-design-system.mjs` L29–34 | **E2E failure filter relies on vendor Base UI / React error **message** regexes.** Same brittleness class as package UI contracts. Rename vendor text → false green (miss) or false red. Prefer stable error codes if available; keep regex secondary. | `assertClean` filter `/Base UI\|MenuGroupContext\|…/`. |

### CP-\* checklist (apps slice)

| CP-ID | App ownership | Status in T2 tests | Notes |
|-------|---------------|--------------------|-------|
| **CP-AUTH-KEY** | example-api composition | **Partial** | Mint + Bearer me + bad key 401; no revoke/TTL (API absent); no mint unauth |
| **CP-AUTH-SESSION** | example-api | **Partial** | Login cookie flags + Secure staging; no logout, no bad/expired cookie wire test |
| **CP-AUTH-DUAL** | example-api | **Good** | Cookie path + sk_ path both hit `/api/me` |
| **CP-IDOR** | example-api | **Good (notes only)** | A/B list/get/delete; must extend per new resource |
| **CP-UNAUTH** | example-api | **Weak** | Single POST notes case |
| **CP-ERR** | example-api | **Good enough** | Nested error + no stack on unauth notes; requestId on health/errors |
| **CP-CORS** | example-api | **Good** | Evil origin not reflected; localhost allowed |
| **CP-SECRET** | example-api | **Good** | getSecret / useSecureCookie unit-style in same file |
| **CP-R2** | example-api | **Good** | `demo/` prefix; ban `share/` on attachment keys |
| **CP-FE-CRED** | example-web | **Partial** | apiFetch credentials + UNAUTHORIZED map; no gate/helpers |
| **CP-MCP** | mcp-example | **Good** | Unit allowlist + stdio exact tools + share_* ban |
| **CP-UI-CONTRACT** | example-web | **Partial** | Unit overlay smoke; e2e optional/local, flaky script |
| **CP-I18N** | example-web | **Good (hygiene)** | messages.contract + thin i18n default |

### Inventory (test modules + scripts)

```text
apps/example-api/src/app.test.ts                          ~398 LOC  # integration spine
apps/example-api/src/seed/seed-db.test.ts                 ~38 LOC
apps/example-web/src/lib/api.test.ts                      ~69 LOC   # CP-FE-CRED
apps/example-web/src/lib/i18n.test.ts                     ~11 LOC
apps/example-web/src/messages/messages.contract.test.ts   ~39 LOC
apps/example-web/src/routes/design-system.overlays.test.tsx ~124 LOC
apps/mcp-example/src/index.test.ts                        ~20 LOC

# not *.test.* but quality-relevant
apps/example-web/scripts/e2e-design-system.mjs            # optional e2e, not CI
apps/mcp-example/scripts/stdio-smoke.mjs                  # part of package `test`
```

### Non-findings (healthy)

| Area | Assessment |
|------|------------|
| Integration over pure mocks (API) | **Real** `createApp().request` + SQLite D1 + memory R2 — not mock theatre |
| IDOR existence leak | Cross-user get/delete → **404 NOT_FOUND**, asserted |
| Dual auth happy path | Session + api_key `authMethod` asserted |
| Cookie security attributes | HttpOnly, SameSite=Lax, Secure outside dev/test |
| Stack leakage | `JSON.stringify(body)` not matching `/stack/i` on unauth error |
| Vitest isolation | Fresh `createMemoryEnv()` per test; no shared mutable DB across its |
| mcp banlist belt | Unit falsification + smoke exact list |
| Flaky timers in unit tests | **None** (`vi.useFakeTimers` unused) |
| Snapshot abuse | **None** |
| Product share fixtures in kit tests | R2 keys assert **not** `share/` |

## Metrics

| Metric | Value |
|--------|------:|
| Test modules `apps/**/*.{test,spec}.{ts,tsx}` | **7** |
| Spec files (`*.spec.*`) | **0** |
| Approx. test LOC (apps) | **~700** |
| Dominant file | `example-api/src/app.test.ts` ~398 LOC / **12** `it` |
| example-api coverage (snapshot) | lines **~85%** (floor 80%) |
| example-web coverage (snapshot) | lines **~11%** (floor 10% — intentional T2 tier) |
| FE auth modules at 0% | `auth.ts`, `app-shell`, login/notes/keys/settings/dashboard |
| CP-UNAUTH routes covered / protected | **1 / 6** |
| Note validation negative tests | **0** |
| IDOR multi-user tests | **1** (notes A vs B) |
| E2E `waitForTimeout` count | **3** |
| App e2e in CI | **0** |
| mcp smoke in `test` script | **yes** |
| `vi.useFakeTimers` / snapshots | **0 / 0** |
| Issues total | **15** |
| P0 | **0** |
| P1 | **4** |
| P2 | **6** |
| P3 | **5** |

## Recommendations

1. **Expand CP-UNAUTH matrix (P1, small effort):** table-driven `for (const { method, path } of PROTECTED)` expect 401 + `UNAUTHORIZED` + `requestId`. Include `POST /api/demo/email` and `POST /api/keys`.
2. **Add note Zod negatives (P1):** empty title, oversize title, oversize body; assert status 400, `VALIDATION_ERROR`, and optionally `details.fieldErrors.title`.
3. **FE auth unit tests (P1):** pure tests for `isUnauthorized` / `isAdmin`; RTL + QueryClient mock for `AuthGate` (error → navigates login) and `AdminGate` (role user → forbidden). Prefer this over growing e2e for seam 3.
4. **Auth wire negatives (P2):** logout clears cookie; garbled session cookie 401; Bearer invalid + valid cookie still 401 (no fall-through); document if package owns exp tests.
5. **Harden e2e script (P1 quality / P2 process):** replace `waitForTimeout` with Playwright locators + `expect(locator).toBeVisible()`; use `channel: 'chromium'` or env-required `CHROME_PATH` with clear error; optional health poll on `BASE`/`API` before login; keep out of PR CI until stable (B6) but make local runs deterministic.
6. **Extract `loginAsDemo(app, env, 'A'|'B')` helper** to make IDOR + unauth matrix cheap (also SMELL-T01-002) before more resources.
7. **When email phase lands:** one happy-path demo email with SMTP disabled/log mode + one unauth 401 (TQ-T02-007).
8. **Do not** chase example-web global % via design-system page mount; add only contracts that map to AuthGate / api client / AdminGate risk (docs/testing.md T2 policy).

## Residual risks / not covered

- **CSRF/Origin on mutations:** no app test (feature absent — documented backlog in `docs/testing.md`); when middleware lands, add mutation+evil Origin cases.
- **Rate limit / lockout:** N/A until package exists.
- **Demo seed gated off outside dev/test:** no invariant test until implementation (SEC-P05-001).
- **Playwright cookie journey in CI:** explicitly Phase B6; current e2e is local-only — gap is process, not a silent merge fail.
- **RBAC server enforcement:** SPA `isAdmin` is cosmetic API-side; AdminGate tests prove UI only.
- **Product frame risks** (zip-slip, `private_key` → 404, org membership): deferred to `apps/share-*`.
- **Package crypto unit depth** (bad HMAC, exp edge cases): T1 / `packages/auth` — app composition should still add **one** expired/tampered cookie case for seam 2.
- **This audit is static** — suites were not re-executed in this pass; coverage % from checked-in `coverage-summary.json` snapshots.
)
