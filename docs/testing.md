# Testing strategy — Chemin A kit

SSoT for **how we test** this monorepo. Complements [`AGENTS.md`](../AGENTS.md) (stack, security) and axial [ADR-0001](architecture/adr/0001-primary-axis-packages-compose-apps.md) / dual-auth [ADR-0002](architecture/adr/0002-session-hmac-interim-vs-better-auth.md).

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
| **Lefthook pre-push** | **Primary quality gate** — `validate:full` | Accept wall-clock; fix here |
| **CI** (`validate-full` job) | **Secondary** — same `validate:full` if hooks skipped or local env lied | Should almost always be green if pre-push ran |
| **Secret scan** | Orthogonal security | Always |

### Commands

```bash
bunx lefthook install          # once per clone

bun run validate               # lint · typecheck · test · banlist · extract · zero-edit · env:check
bun run zero-edit              # product must not diverge kit paths without exception (kit = config only)
bun run env:check              # schema ↔ .dev.vars.example (DX only)
bun run i18n:check             # messages contract (also in turbo test)
bun run license:check          # dependency SPDX allowlist (UNKNOWN = warn)
bun run test:coverage          # floors + HTML under coverage/<pkg>/
bun run validate:full          # lint · typecheck · banlist · extract · zero-edit · env · test:coverage · license · build:kit · smoke:mcp (= pre-push; CI same)

# Before opening a PR (explicit habit even if hooks installed):
bun run validate:full
```

### Non-negotiable local discipline

| Rule | |
|---|---|
| Install hooks | `bunx lefthook install` after clone |
| **Forbidden** without written reason | `git push --no-verify`, `LEFTHOOK=0` |
| If pre-push is red | Fix locally; do **not** “let CI tell us” |
| Docs-only exception | Still run hooks unless emergency; extract/banlist are cheap insurance |

Rationale: on Free private, branch protection is weak; **local pre-push is the process substitute**. Making CI the only full suite trains bypass culture and burns minutes on avoidable red.

---

## Risk tiers (floors + expectations)

Floors are enforced by Vitest (`packages/config/vitest-coverage.mjs` + per-package `vitest.config.ts`). Runner: `scripts/test-coverage.sh`.

| Tier | Scope | Floor (stmts/lines, approx.) | Policy |
|---|---|---|---|
| **T0** | `@gosilex/auth`, `@gosilex/example-api` (guards, dual auth, paths), FE **auth client** contracts | **80%** api/auth · pin named web contract files | **Never lower without ADR** |
| **T1** | `core`, `storage`, `db`, `types`, `mcp` | **70–75%** | Raise when surface grows |
| **T2** | `@gosilex/ui`, `example-web` (page chrome) | **20% / 10%** global | Low % OK **iff** contract suites green; do not chase Button coverage |
| **T3** | `email` thin, mcp-example smoke | soft / special (e.g. funcs 0% mcp-example) | Document, don’t pretend product security |

**% is a ratchet, not the story.** The story is **critical paths** below.

---

## Ownership (axial — PRIMARY = packages)

| Layer | Owns tests for | Does **not** own |
|---|---|---|
| **`packages/*`** | Public API of the capability (crypto, AppError, `joinObjectKey`, UI primitive contracts, MCP allowlist) | Share product scenarios (artefact, slug 409, private_key product mode) |
| **`apps/example-*`** | Composition: Hono + D1/R2, dual auth wire, demo IDOR, CORS, cookies, design-system smoke | Re-implement package crypto N times |
| **`apps/share-*` (P1 later)** | Product risks (upload modes, zip-slip, org membership, serve) | Forks of `@gosilex/*` stacks |
| **`scripts/*` / `tools/*`** | Architecture gates: banlist, extract, zero-edit, env:check, license:check, coverage | Domain behaviour |

### Design-system e2e

- **Kit composition proof** (`@gosilex/ui` + admin shell in `example-web`).
- **Not** product e2e. Do not grow it into artefact/upload flows.
- Command: `bun run test:e2e:design-system` (API + web up).

### When product lands

- Product tests live only under `apps/share-*`.
- Kit banlist + extract remain green; product debt must not lower kit T0 floors.
- Frame risks (zip-slip, `private_key` → 404) become **mandatory product tests** when code lands — not pre-baked as share fixtures inside packages.

---

## Auth test seams (ADR-0002)

Do not lock Better Auth internals forever. Lock **stable wire**:

| Seam | Where | Stable? |
|---|---|---|
| 1. Crypto / session / key hash | `packages/auth` unit | Adapt when Better Auth replaces HMAC **impl** |
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
| **CP-IDOR** | subject B cannot read/mutate A’s resource (notes today; **each new resource** must extend) | example-api |
| **CP-UNAUTH** | protected mutations without auth → 401 `UNAUTHORIZED` | example-api |
| **CP-ERR** | nested `{ error: { code, message }, requestId }`; no stack leak | `packages/core`, example-api |
| **CP-CORS** | evil Origin not reflected; no `*` + credentials | example-api |
| **CP-SECRET** | fail-closed `SESSION_SECRET` outside development\|test | example-api |
| **CP-R2** | keys under intended prefix; `joinObjectKey` rejects traversal | `packages/storage`, example-api |
| **CP-FE-CRED** | `apiFetch` always `credentials: 'include'`; maps UNAUTHORIZED | example-web |
| **CP-MCP** | tool allowlist; live stdio `tools/list` exact `ping`/`whoami` | `packages/mcp` unit + `bun run smoke:mcp` (in `validate:full` / CI) |
| **CP-BAN** | no product-share strings in packages / examples | `scripts/check-banned-strings.sh` |
| **CP-EXTRACT** | structural extractability: required tree, banlist, import graph, orphan packages, ADRs (does **not** re-run lint/typecheck/test after a simulated drop) | `scripts/extract-dry-run.sh` |
| **CP-ZERO-EDIT** | product consumers do not dual-edit kit paths; design overrides preferred; exceptions time-boxed + ticketed | `scripts/check-zero-edit-zones.sh` · `config/zero-edit-zones.json` · [`product-consumer-contract.md`](./product-consumer-contract.md) |
| **CP-ENV** | Worker string env keys documented in `.dev.vars.example` (SSoT Zod schema); no real secrets in examples | `bun run env:check` — **DX only**, not “prod secrets validated” |
| **CP-LICENSE** | third-party deps on allowlist; disallowed SPDX fails | `bun run license:check` — **compliance hygiene**, not malware audit |
| **CP-I18N** | FR/EN non-empty copy; key parity via TypeScript `Messages` | `messages.contract.test.ts` / `i18n:check` — **not** semantic/security review |
| **CP-UI-CONTRACT** | known Base UI traps (e.g. MenuGroupContext, closed dialog) | `packages/ui` (+ design-system smoke) |

### Env / i18n / license — non-claims

| Gate | Proves | Does **not** prove |
|---|---|---|
| `env:check` | Schema ↔ example file inventory | Runtime secret strength, CF dashboard secrets, deploy config |
| `i18n:check` / messages contract | Non-empty strings, no raw script tags in catalogs | Correct translation meaning, XSS if you render HTML unsafely |
| `license:check` | SPDX allowlist vs installed tree | Package safety, correct license metadata, supply-chain integrity |

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
| Stateless HMAC logout | ADR-0002 interim — cookie clear only; Better Auth M3 for server sessions |

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
        │  architecture scripts│  banlist · extract · env:check · license (full)
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
bun run --filter @gosilex/example-api test
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
| [ADR-0002](architecture/adr/0002-session-hmac-interim-vs-better-auth.md) | Session interim vs Better Auth |
| [Frame](../artifacts/frames/001-share-platform-frame.md) | Product rules (P1 tests later) |
