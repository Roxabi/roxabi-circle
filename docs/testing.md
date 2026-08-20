# Testing strategy — Chemin A kit

SSoT for **how we test** this monorepo. Complements [`AGENTS.md`](../AGENTS.md) (stack, security) and axial [ADR-0001](architecture/adr/0001-primary-axis-packages-compose-apps.md) / dual-credential [ADR-0002](architecture/adr/0002-session-hmac-interim-vs-better-auth.md) (Better Auth session **\|** Bearer `sk_`; HMAC retired).

---

## Doctrine (one screen)

| Principle | Meaning |
|---|---|
| **Effective tests > vanity %** | Ask: *if this breaks in prod, which test fails?* |
| **Local is the real gate** | Full validate + coverage **before push**. CI is a **guardrail** (catch skip hooks / broken machine), not the place you discover red. |
| **Tiered floors, not one goal** | High floors on auth/API; low global floors on ui/web **only if** named contracts stay green. |
| **Ownership follows PRIMARY axis** | Package contracts in `packages/*`; composition in `apps/example-*`; product risks later in `apps/share-*` only. |
| **No checklist theater** | PR boxes map to **named suites / CP-IDs**, not “tests added”. |
| **Optional tooling has a phase** | Playwright / mutation: phased or explicitly out of merge — no limbo. |

**Anti-slogan:** “We deprioritized coverage for quality” must never mean “we lowered T0 floors” or “we deleted negative cases.”

---

## Ops model — local first, CI guardrail

CI minutes and red loops on GitHub are costly (Free private, agents, merge-on-green). **Policy:**

```text
Developer / agent workstation
  pre-commit  → Biome (staged)           # fast
  pre-push    → bun run validate:full    # full local SoT
         ↓
  push only when green locally
         ↓
GitHub CI     → same gates again         # guardrail only
         ↓
merge-on-green (label reviewed + checks)
```

| Layer | Role | Cost expectation |
|---|---|---|
| **Lefthook pre-push** | **Primary kit bar** — `validate:full` | Accept wall-clock; fix here |
| **CI** (check `ci`, runs `validate:full`) | **Secondary kit bar** — same `validate:full` if hooks skipped or local env lied | Should almost always be green if pre-push ran |
| **Product CI** (`product-validate`) | **Product bar** — typecheck/test/build for `apps/<product>-*` via **copied** templates ([`product-validate.example.sh`](./templates/product-validate.example.sh), [`product-ci.example.yml`](./templates/product-ci.example.yml)) | Product repos only; not kit CI |
| **Secret scan** | Orthogonal security | Always — **two passes, see below** |

**Secret scan: why it runs TruffleHog twice (do not collapse it back)**

`--only-verified` keeps the generic detectors quiet by reporting only what TruffleHog could
confirm against the issuing provider's API. A `sk_` key **this kit mints itself** has no such
provider, so it is always an *unverified* finding — and that flag discards it **silently**.

Measured on trufflehog 3.96.0 with a real-format fixture (`sk_` + 48 lowercase hex):

| Invocation | Result |
|---|---|
| `--only-verified` (generic pass) | `unverified_secrets: 0` → **exit 0, the key passes** |
| `--config=scripts/trufflehog-detectors.yaml`, no such flag | `unverified_secrets: 1` → exit 183 |
| same config over the whole repo | `unverified_secrets: 0` → no false positives |

So: generic detectors keep `--only-verified`; kit-issued secrets get a **separate** pass
without it. Adding the detector while keeping the flag yields a green scan and zero coverage —
the failure mode is invisible, which is why this is written down rather than left to the diff.
Do **not** merge the two invocations, and do **not** add `--only-verified` to the custom pass.

Scope: both passes are **diff-scoped** (PR base…head; locally, commits after the origin base),
so neither sees a secret that was force-pushed out of the window or predates the gates.
[`secret-scan-history.yml`](../.github/workflows/secret-scan-history.yml) covers full history on
a weekly schedule. Rationale + regex: [`scripts/trufflehog-detectors.yaml`](../scripts/trufflehog-detectors.yaml).

**Where local-first does not reach.** The scan is the one gate whose local and CI forms are not
the same command: locally `scripts/trufflehog-check.sh` invokes the binary directly, while CI goes
through the TruffleHog **action**, which prepends `--fail --no-update --github-actions` of its own.
An argument that is valid locally can therefore be rejected in CI — measured: adding `--fail` to
`extra_args` duplicates the injected one and TruffleHog exits **1** with
`error: flag 'fail' cannot be repeated`, before scanning anything. A green `validate:full`
cannot cover this, so changes to the scan workflows are verified by replaying the action's exact
argument vector against a fixture, not by the local gate.

Note the consequence for reading failures: on this job **exit 183 means findings**, exit 1 means
the scan did not run. A step that fails identically on every commit is not a strict gate, it is
noise that gets muted — which is the same fail-open ending by a different route.

**Kit bar vs product bar**

| Gate | Scope | Who runs it |
|---|---|---|
| `bun run validate` | lint · typecheck · test · banlist · **zod-major** · **ts-major** · extract · zero-edit · env:check on **kit** packages / examples | kit + product clones (kit zones) |
| `bun run validate:full` | kit bar + import-boundary · test:import-boundary · deny-upstream · **test:kit-schema-sync** · **debt:check** · **test:debt** · **test:ts-major** · agents-adr · coverage floors · license · quality-gates (file+folder) · build:kit · smoke:mcp | pre-push + kit CI — **does not** prove product apps are tested |
| product-validate / product-ci | product packages under `apps/<product>-*` | product repo only (copy templates; never dual-edit kit `ci.yml` / `test-coverage.sh`) |

False green: product with real apps and only kit `validate:full` green is **not** product-tested.
### Commands

```bash
bun install                    # prepare → lefthook install if hooksPath unset; postinstall may still force-install (see lefthook.yml)

bun run validate               # lint · typecheck · test · banlist · zod-major · ts-major · extract · zero-edit · env:check
bun run zero-edit              # product must not diverge kit paths without exception (kit = config only)
bun run env:check              # schema ↔ .dev.vars.example (DX only)
bun run i18n:check             # messages contract (also in turbo test)
bun run license:check          # dependency SPDX allowlist (UNKNOWN = warn)
bun run test:coverage          # floors + HTML under coverage/<pkg>/
bun run validate:full          # kit bar (= pre-push; kit CI same) — not product apps

# Before opening a PR on the kit (explicit habit even if hooks installed):
bun run validate:full

# Product bar (product repos only — after copying templates):
# bash scripts/product/validate.sh
# See docs/templates/product-validate.example.sh + product-ci.example.yml
```

### Non-negotiable local discipline

| Rule | |
|---|---|
| Install hooks | `bun install` — prepare installs only if `core.hooksPath` unset; **postinstall** still runs `lefthook install -f` non-CI (residual — [lefthook#1475](https://github.com/evilmartians/lefthook/issues/1475); documented in `lefthook.yml`) |
| **Forbidden** without written reason | `git push --no-verify`, `LEFTHOOK=0` |
| If pre-push is red | Fix locally; do **not** “let CI tell us” |
| Docs-only exception | Still run hooks unless emergency; extract/banlist are cheap insurance |

Rationale: on Free private, branch protection is weak; **local pre-push is the process substitute**. Making CI the only full suite trains bypass culture and burns minutes on avoidable red.

### `better-sqlite3` ABI (local red herring)

Memory D1 tests load native `better-sqlite3`. After a **Node major upgrade**, suites may fail with `NODE_MODULE_VERSION` mismatch (e.g. module built for 127, runtime wants 137). That is **not** a product regression until rebuild is tried:

```bash
npm rebuild better-sqlite3
bun run validate:full
```

Goal 002 exit evidence (2026-08-03) recorded this once — see [`artifacts/reviews/002-goal-exit-evidence.md`](../artifacts/reviews/002-goal-exit-evidence.md).

---

## Risk tiers (floors + expectations)

Floors are enforced by Vitest (`packages/config/vitest-coverage.mjs` + per-package `vitest.config.ts`). Runner: `scripts/test-coverage.sh`.

| Tier | Scope | Floor (stmts/lines, approx.) | Policy |
|---|---|---|---|
| **T0** | `@kit/auth`, `@kit/example-api` (guards, dual auth, paths), FE **auth client** contracts | **auth 80%** · **example-api** machine floors **78/80/65/75** (stmts/lines/branches/funcs) · pin named web contract files | **Auth: never lower without ADR.** example-api: Vitest 4 v8 remapping exception (#21) — see inventory before/after; do not lower further without ADR |
| **T1** | `core`, `storage`, `db`, `types`, `@kit/api-client`, `mcp` | **core ~68/69/66** (stmts/lines/branches) · others **70–75%** typical | Raise when surface grows; core floors recalibrated under Vitest 4 remapping (#21) |
| **T2** | `@kit/ui`, `example-web` (page chrome) | **ui ~17/17/16/23** · **web 10/10/20/12** | Low % OK **iff** contract suites green; do not chase Button coverage; Vitest 4 remapping (#21) |
| **T3** | `email` thin, mcp-example smoke | soft / special (e.g. funcs 0% mcp-example) | Document, don’t pretend product security |

**Vitest 4 remapping (#21):** Same sources/tests produce lower stmt/branch % under Vitest 4.1.x v8 than 3.2.x. Floors were recalibrated just under measured values with before/after evidence in [`artifacts/notes/21-vitest-vite-inventory.md`](../artifacts/notes/21-vitest-vite-inventory.md). **% is a ratchet, not the story.** The story is **critical paths** below.

---

## Ownership (axial — PRIMARY = packages)

| Layer | Owns tests for | Does **not** own |
|---|---|---|
| **`packages/*`** | Public API of the capability (crypto, AppError, `joinObjectKey`, UI primitive contracts, MCP allowlist) | Share product scenarios (artefact, slug 409, private_key product mode) |
| **`apps/example-*`** | Composition: Hono + D1/R2, dual auth wire, demo IDOR, CORS, cookies, design-system smoke | Re-implement package crypto N times |
| **`apps/share-*` (P1 later)** | Product risks (upload modes, zip-slip, org membership, serve) | Forks of `@kit/*` stacks |
| **`scripts/*` / `tools/*`** | Architecture gates: banlist, extract, zero-edit, env:check, license:check, coverage | Domain behaviour |

### Design-system e2e (local only)

- **Kit composition proof** (`@kit/ui` + admin shell in `example-web`).
- **Not** product e2e. Do not grow it into artefact/upload flows.
- **Local (API + web already up):** `bun run test:e2e:design-system` — fast when stack is warm.
- **Local one-shot (cold start):** `bun run test:e2e:ci` (`scripts/e2e-ci.sh` — migrate, seed, start API+web, Chromium smoke, teardown).
- **Not** in GitHub Actions CI, `validate:full`, or Lefthook pre-push — Free minutes + flake risk; local-first gate stays machine-cheap.
- **CP-E2E** — proves: BA cookie login path + design-system overlays open without Base UI contract console errors. **Does not prove:** dual-auth, IDOR, org RBAC, product flows, a11y matrix.

### When product lands

- Product tests live only under `apps/share-*`.
- Kit banlist + extract remain green; product debt must not lower kit T0 floors.
- Frame risks (zip-slip, `private_key` → 404) become **mandatory product tests** when code lands — not pre-baked as share fixtures inside packages.

---

## Auth test seams (ADR-0002)

Do not lock Better Auth internals forever. Lock **stable wire**:

| Seam | Where | Stable? |
|---|---|---|
| 1. Crypto / session / key hash | `packages/auth` unit | **Stable contract** — BA session + `sk_` hash; do not lock BA internals forever |
| 2. Dual path HTTP (cookie + `sk_`) + cookie flags + IDOR | `apps/example-api` integration | **Stable** |
| 3. FE wire: `credentials: 'include'`, envelope map, 401 | `apps/example-web` `lib/api*` (+ auth helpers) | **Stable** |

UI chrome (layout, design-system catalog) is not seam 3.

---

## Critical path inventory (CP-*)

Machine-enforced today via full `validate` + `test:coverage` + package tests. Prefer tests whose names/files map to these IDs. When adding `test:critical`, filter this set.

| ID | Behaviour | Primary home |
|---|---|---|
| **CP-AUTH-KEY** | mint / hash / verify `sk_`; reject bad key | `packages/auth`, example-api |
| **CP-AUTH-SESSION** | sign/verify session; cookie HttpOnly · Secure (prod) · SameSite; requireAuth | `packages/auth`, example-api |
| **CP-AUTH-DUAL** | cookie **or** Bearer reaches `/api/me` / protected routes | example-api |
| **CP-IDOR** | subject B cannot read/mutate A’s resource (notes + **org invitations** cross-tenant cancel; **each new resource** must extend) | example-api (`invitations.test.ts`, notes IDOR) |
| **CP-UNAUTH** | protected mutations without auth → 401 `UNAUTHORIZED` | example-api |
| **CP-ERR** | nested `{ error: { code, message }, requestId }`; no stack leak | `packages/core`, example-api |
| **CP-CORS** | evil Origin not reflected; no `*` + credentials | example-api |
| **CP-SECRET** | fail-closed `SESSION_SECRET` outside development\|test | example-api |
| **CP-R2** | keys under intended prefix; `joinObjectKey` rejects traversal | `packages/storage`, example-api |
| **CP-FE-CRED** | `apiFetch` always `credentials: 'include'`; maps UNAUTHORIZED | example-web |
| **CP-MCP-REG** | live registered names / `tools/list` equals app catalogue.names; planted extra tool fails assert | `packages/mcp` catalogue unit + `bun run smoke:mcp` |
| **CP-MCP-SMOKE** | stdio JSON-RPC list + ping + whoami; whoami body matches `whoamiResultSchema`; no `sk_` in result | `bun run smoke:mcp` (in `validate:full` / CI) |
| **CP-MCP-SCHEMA** | public Zod outs + public tool error codes on kit wrap paths | `packages/mcp` unit (`catalogue.test.ts`, handlers) |
| **CP-MCP-BUDGET** | oversized input rejected before handler body (execute not called) | `packages/mcp` unit budget cases |
| **CP-MCP** (legacy row) | same family as above — prefer CP-MCP-* | kept for old links |
| **CP-BAN** | no product-share strings in packages / examples | `scripts/check-banned-strings.sh` |
| **CP-EXTRACT** | structural extractability: required tree, banlist, import graph, orphan packages, ADRs (does **not** re-run lint/typecheck/test after a simulated drop) | `scripts/extract-dry-run.sh` |
| **CP-ZERO-EDIT** | product consumers do not dual-edit kit paths; design overrides preferred; exceptions time-boxed + ticketed | `scripts/check-zero-edit-zones.sh` · `config/zero-edit-zones.json` · [`product-consumer-contract.md`](./product-consumer-contract.md) |
| **CP-DENY** | multi-hop deny-upstream: kit origin no-op; product blocks remote name `upstream`, kit URL substring, and product/env-extended chassis substrings; weaken name-guard fails harness | `bun run test:deny-upstream` · `scripts/test-deny-upstream.sh` · `scripts/deny-upstream-push.sh` (in `validate:full`) |
| **CP-KIT-SCHEMA** | kit D1 modules identified by catalog id + sha256; product appends `NNNN_kit_<id>.sql` and never reuses an applied `NNNN`; adopt matches raw clones; mutated published id fails | `bun run test:kit-schema-sync` · `scripts/kit-schema-sync.sh` · [ADR-0008](./architecture/adr/0008-kit-schema-identity-product-compose.md) (in `validate:full`) |
| **CP-KIT-AUTH** | products import `createBetterAuth` from `@kit/auth/factory` (signup default off, secure cookies, magic/reset EmailPort, secret denylist); env helpers fail-closed including `CORS_ORIGINS` outside dev | `packages/auth` unit (`better-auth-env`, `auth-email`, `first-session-hook`, factory options) · example-api magic-link / audit / CORS dogfood |
| **CP-IMPORT** | static R1–R4 import edges (packages↛apps, example-web↛example-api src / `cloudflare:workers`) after exemptions; self-test plants edges in temp tree | `bun run import-boundary` · `scripts/check-import-boundaries.ts` · `bun run test:import-boundary` (in `validate:full`) |
| **CP-DEBT** | suppressions in `apps|packages` carry `DEBT:<slug>`; untagged + expiry (default **warn**, non-blocking); self-test plants untagged/tagged **and** expiry (stale / pin / warn) cases | `bun run debt:check` · `scripts/check-debt.ts` · `bun run test:debt` · [`debt-tracking.md`](./debt-tracking.md) (in `validate:full`) |
| **CP-TS-MAJOR** | root `typescript` pin exclusive `^7`; leftover workspace pins (if any) must match; lock has positive `typescript@7.` and no non-allowlisted `@5`/`@6`; self-test plants inherit / dual-range / residual / missing-7 / stray-5 cases | `bun run ts-major` · `scripts/check-typescript-major.sh` · `bun run test:ts-major` (in `validate:full`) |
| **CP-ENV** | **Kit only:** `apps/example-api` Worker string keys documented in `apps/example-api/.dev.vars.example` (SSoT Zod schema) + root Vite placeholders; no real secrets in examples. **Does not** cover product apps’ env inventories | `bun run env:check` — **DX only**, example-api scoped; not “prod secrets validated”, not product-wide |
| **CP-LICENSE** | third-party deps on allowlist; disallowed SPDX fails | `bun run license:check` — **compliance hygiene**, not malware audit |
| **CP-I18N** | FR/EN non-empty copy; key parity via TypeScript `Messages` | `messages.contract.test.ts` / `i18n:check` — **not** semantic/security review |
| **CP-UI-CONTRACT** | known Base UI traps (e.g. MenuGroupContext, closed dialog) | `packages/ui` (+ design-system smoke) |
| **CP-E2E** | BA cookie login + design-system overlays (Chromium); no Base UI contract console errors | **Local only:** `test:e2e:design-system` / `test:e2e:ci` — **not** dual-auth / IDOR / RBAC; not a CI gate |

### MCP contract probes — non-claims

| CP | Proves | Does **not** prove |
|---|---|---|
| **CP-MCP-REG** | tools/list (or captured runtime registered names) equals catalogue.names; planted extra name fails assert/smoke | tool business correctness; product apps’ registration discipline fleet-wide |
| **CP-MCP-SMOKE** | stdio JSON-RPC list + ping + whoami path works; whoami body matches whoamiResultSchema; no sk_ in results | auth IDOR / org RBAC; cookie session; product tools |
| **CP-MCP-SCHEMA** | public Zod outs + public error codes stable on kit paths | full FE session; API as sole schema owner for all `/api/me` fields |
| **CP-MCP-BUDGET** | oversized input rejected before handler body; execute not called | full DoS resistance under attack; network-layer limits |

**Honesty:** never claim “verified” for presence-only key checks; whoami `verified: true` only after `/api/me` subject parse OK.

### Env / i18n / license / import-boundary — non-claims

| Gate | Proves | Does **not** prove |
|---|---|---|
| `env:check` | **`apps/example-api`** schema ↔ `apps/example-api/.dev.vars.example` (+ root `VITE_*` placeholders) | Product app env schemas; runtime secret strength; CF dashboard secrets; deploy config; “all monorepo envs are complete” |
| `i18n:check` / messages contract | Non-empty strings, no raw script tags in catalogs | Correct translation meaning, XSS if you render HTML unsafely |
| `license:check` | SPDX allowlist vs installed tree | Package safety, correct license metadata, supply-chain integrity |
| `import-boundary` / **CP-IMPORT** | String-literal `from` / `export … from` / side-effect `import` / `require` / `import()` edges that resolve under forbidden zones (R1–R4) after reason-required exemptions; clean tree exit 0; synthetic plant exit ≠ 0 | Runtime/DI purity; non-literal dynamic imports; full tsconfig alias graph; product-owned layer graphs; R5 routes↛repos; that excluding `*.test.ts` still polices test-only edges; `package.json` deps without a source import |
| `debt:check` / **CP-DEBT** | Line comments `biome-ignore` / `@ts-expect-error` / `@ts-ignore` under `apps|packages` tagged with `DEBT:<slug>`; untagged + stale-without-pin reported (warn default → exit 0; fail via env); self-test covers untagged matrix **and** expiry (stale fail/warn, pin exempt) | That warn mode “manages” debt; line-level blame age; open GitHub issue existence for `#N` pins; `biome.json` overrides; suppressions in `scripts/`/`tools/`; full factory debt registry |

Worker env SSoT: `apps/example-api/src/env.schema.ts`. Bindings `DB` / `BUCKET` stay out of `.dev.vars`.

### Gaps known (honest backlog — force tests when code lands)

| Gap | Status |
|---|---|
| Origin/CSRF middleware on mutations | **Shipped** — `originGuard` + tests (cookie mutations require trusted Origin) |
| Seed/demo users disabled outside dev/test | **Shipped** — `ensureDemoUsers` env-gated; production login does not auto-seed |
| Rate-limit 429 wire + Bearer-vs-cookie exclusivity | Covered by tests after 2026-07 review fix pass; still demo in-memory only |
| Server RBAC (`role` is demo/SPA-facing today) | Do not treat SPA `isAdmin` as security; server checks when admin APIs exist |
| Zip-slip / `private_key` → 404 | **Product** when `share-*` exists |
| Playwright cookie journey in CI | Phase B6 — Chromium smoke; until then local e2e scripts |
| Mutation testing on `packages/auth` | Optional **nightly / manual**, not PR gate until cheap |
| BA session logout / revoke wire | Covered by BA handler + cookie clear; prefer server-side session revoke tests when extending admin APIs |

### Org invites local E2E (B3 S2)

Automated suite: `apps/example-api/src/invitations.test.ts` (≥ 8 cases: create, accept, email bind, ceiling, IDOR, sk_, 409, super deny, BA DENY).

Manual dogfood (after `bun run db:seed` + API + web):

1. Login `team-owner@kit.local` / `demo-password-change-me` → `/app`.
2. Select org **Team Client** → **Members** → invite `solo@kit.local` as `member`.
3. Inspect Worker log line `transport: "log"` for accept URL (`/invite/accept?invitationId=…`).
4. Logout → login `solo@kit.local` → open accept URL → join → membership on `/api/me` orgs.
5. Confirm `team-reader@` cannot open invite create (403).

Email is **log transport** only on Workers (Mailpit/SMTP is Node `@kit/email/server` — optional later).

### Password reset local E2E (B3 S3)

Automated suite: `apps/example-api/src/password-reset.test.ts` (request known/unknown, reset + single-use, rate limit).

BA 1.6 paths: `POST /api/auth/request-password-reset` · `POST /api/auth/reset-password`.

Manual dogfood:

1. Open `/forgot-password` → submit `demo@kit.local` (or seed persona).
2. Worker log: `transport: "log"` subject “Reset your password” with BA URL containing token.
3. Prefer SPA: open `/reset-password?token=<token>` (or follow BA callback with `redirectTo=http://localhost:5173/reset-password`).
4. Set new password (≥ 8 chars) → redirect login → sign in with **new** password; old fails.
5. Reuse token → error.

Mailpit: optional via Node `@kit/email/server` only — **not** the Worker path. Prod CF Email is epic **#21**.

---

## What a good test looks like

1. **Names the bug** — failure mode in the title (`… without auth returns UNAUTHORIZED`).
2. **Asserts the public contract** — status, `error.code`, cookie flags, a11y/DOM, not private helpers.
3. **Includes the negative path** for T0 (reject, 401, IDOR, bad sig).
4. **Stable** — no real network flake, no order-dependent FS.
5. **Fast enough** for pre-push — integration via `createApp` + memory env OK; full browser only for few paths.
6. **Owned by the right layer** — package unit vs app composition (see ownership).

### Refuse / rewrite

- Happy-path only on a new protected resource.
- “Button renders” as substitute for auth.
- Deleting negative cases to green a floor.
- Product scenarios inside `packages/*`.
- AI spam: `expect(true)` / status 200 without contract.

### God-file hygiene

Prefer splitting large HTTP suites by concern while still hitting `createApp`:

```text
auth.contract.test.ts · notes.idor.test.ts · cors.test.ts · …
```

Avoid pure “mock every repo” theatre unless a bug proves the need.

---

## Pyramid (kit)

```text
        ┌──────────────────────┐
        │  e2e few (browser)   │  design-system smoke; later login/me
        ├──────────────────────┤
        │  app integration     │  example-api HTTP — dual auth, IDOR, CORS
        ├──────────────────────┤
        │  package units       │  auth, core, storage, types, mcp, ui contracts
        ├──────────────────────┤
        │  architecture scripts│  banlist · extract · zero-edit · import-boundary · env:check · license (full)
        └──────────────────────┘
```

---

## Coverage tooling (reference)

| Artefact | Role |
|---|---|
| `packages/config/vitest-coverage.mjs` | shared v8 include/exclude + thresholds |
| `scripts/test-coverage.sh` | monorepo runner |
| `scripts/print-coverage-summary.mjs` | table after run |
| `coverage/<pkg>/index.html` | HTML report (gitignored) |
| `turbo.jsonc` → `test:coverage` | task (cache false) |

**Interpretation:** low `example-web` / `ui` global % is **expected** while T0 and CP-\* hold. Raise ui/web % only by **adding contract/page tests that map to risk**, not by rendering every shadcn export.

---

## PR expectations

Use [`.github/PULL_REQUEST_TEMPLATE.md`](../.github/PULL_REQUEST_TEMPLATE.md).

| Touched area | Expected |
|---|---|
| Auth / keys / cookies | Update seam tests; human review |
| New protected resource | **CP-IDOR** + **CP-UNAUTH** cases for that resource |
| `packages/*` public API | Package unit + example still composes it |
| UI primitives trap | Contract test in `packages/ui` (or justify) |
| FE api client | **CP-FE-CRED** stays green |
| Product domain | Must not land in packages (banlist) |

**Test plan section** should list commands actually run, e.g.:

```bash
bun run validate:full
# and/or focused:
bun run --filter @kit/example-api test
```

---

## Phased tooling

| Phase | Add | Gate? |
|---|---|---|
| **Now** | This doc · local `validate:full` · existing Vitest + floors · banlist · extract | Yes — local + CI guardrail |
| **B6 / kit polish** | Playwright Chromium: login → session; me/notes smoke; keep design-system smoke | Prefer local first; CI job only when stable (watch merge-on-green “all checks” semantics) |
| **Later** | `test:critical` filter alias for CP-\* | Convenience, not replacement for full pre-push |
| **Later** | Mutation on `packages/auth` | Nightly/manual signal only until &lt;5 min and low noise |

---

## Anti-patterns (ban)

| Anti-pattern | Why |
|---|---|
| Push red, “CI will catch it” | Violates local-first; burns Free minutes |
| `LEFTHOOK=0` / `--no-verify` as habit | Removes the real gate |
| Lower T0 floors “because coverage is radar” | Erodes security bar |
| Treat 10% web floor as “UI security covered” | Theater |
| Apply “don’t test UI” to `apiFetch` / gates / 401 | Account/session regressions free |
| Share product fixtures in package tests | Axial drift |
| Optional e2e forever without decision | False confidence |
| Checklist ✅ without CP / test names | Social theater |

---

## Quick links

| Doc | Role |
|---|---|
| [AGENTS.md](../AGENTS.md) | Stack, dual-mission, security for AI |
| [README.md](../README.md) | Dev quickstart, credentials, coverage table |
| [ADR-0001](architecture/adr/0001-primary-axis-packages-compose-apps.md) | Primary axis packages → apps |
| [ADR-0002](architecture/adr/0002-session-hmac-interim-vs-better-auth.md) | BA-only session + Bearer `sk_` dual-path (HMAC retired) |
