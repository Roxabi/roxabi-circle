---
title: "Goal — Chemin A Cloudflare SaaS boilerplate (complete)"
status: ready-for-goal
priority: P0
date: 2026-07-12
repo: go-silex/silex-share
related_frame_product: artifacts/frames/001-share-platform-frame.md
related_spec_deferred: artifacts/specs/001-share-m0-m1-core-spec.md
arbitration: artifacts/reviews/2026-07-12-goal-arbitration-freeze.md
---

# Goal — Boilerplate Chemin A complet

## One-liner

> **Complete Chemin A boilerplate** = monorepo Bun/Turbo extractible où `example-api` + `example-web` + `mcp-example` démontrent Workers/Hono/D1/R2, dual auth (cookie + `sk_`), erreurs centralisées, Base UI + TanStack, FR/EN, Mailpit, FastMCP `ping`/`whoami`, CI verte, extract dry-run — **zéro** domaine silex-share — pour que le prochain SaaS CF (dont share) **consomme** le kit.

## Why now

- Audits + passation : industrialiser qualité + chemin **A** (CF) ≠ Next (B).
- Share ne doit **pas** dicter le kit (pollution domain).
- Process/qualité type Roxabi-boilerplate, runtime **Workers** (pas Nest/Next).

## Priority

| P0 | P1 |
|---|---|
| Kit + examples verts | `apps/share-*` from frame 001 (new SPEC after exit) |

**Do not** `/plan` or implement SPEC-001 share until this goal exits.

---

## Locked defaults (arbitration freeze)

Full tables: [`artifacts/reviews/2026-07-12-goal-arbitration-freeze.md`](../reviews/2026-07-12-goal-arbitration-freeze.md).

### Architecture (non-negotiable for scaffold)

| # | Decision |
|---|---|
| A1 | Scope packages **`@gosilex/*`** |
| A2 | **Bun** workspaces + **Turborepo** · Biome · Vitest · Lefthook · conventional commits |
| A3 | API = **Hono Worker only** · **1 Worker per app** · **no** TanStack Start as API |
| A4 | Web = **Vite SPA** (+ Workers static assets later) |
| A5 | Errors = `{ error: { code, message, details? }, requestId }` · generic codes in kit only |
| A6 | Layers in API apps: **routes → services → repos** |
| A7 | **Primary axis (axial):** packages = platform concerns compose apps; apps = deployables |
| A8 | Create package only when **example consumes it** (no empty theater) |
| A9 | **No `apps/share-*`** until goal exit |
| A10 | Demo domain only: D1 `demo_notes` + `api_keys` · R2 prefix **`demo/`** · never `share/` |
| A11 | Auth: B0–B2 API key + guards · **B3 Better Auth cookies + sk_** · both required for exit |
| A12 | MCP: **FastMCP** · stdio first · tools **`ping` + `whoami` only** |
| A13 | Email: **Mailpit** compose · React Email · B5 |
| A14 | i18n: FR default + EN · Paraglide preferred |
| A15 | UI: shadcn **Base UI** pin · CVA + lucide |
| A16 | Extract dry-run = banlist + quality bar without share apps |
| A17 | Billing / PostHog / flags / Datadog / Nest / Next / Clerk / shared team key = **OUT** |

### Axial (must write early in /goal)

| # | Decision |
|---|---|
| X1 | Primary axis = **platform packages** (`packages/*`) compose **deployables** (`apps/*`) |
| X2 | Product domain (share) only in `apps/share-*` later — never packages |
| X3 | Author **ADR axial** `docs/architecture/adr/` with `axial: true` during goal/frame kit |
| X4 | Three-strikes: same concern in ≥3 apps → promote package |

### Ops (parallel track)

| # | Decision |
|---|---|
| O1 | Branches: **staging** + **main** · features → staging · merge commit only |
| O2 | Merge: **gosilex-ci App** (no PAT) · label **`reviewed`** · fail-closed named checks (TruffleHog + later CI jobs) |
| O3 | Free plan: no branch protection — **process** no direct push |
| O4 | Workflow name for app quality: exact **`CI`** when added |
| O5 | Kit goal: **local + CI green** · CF staging deploy **optional** B6 · **no** `share.gosilex.com` in this goal |
| O6 | CF naming later: `{app}-{env}` · example buckets ≠ share buckets |
| O7 | Mail staging: prefer **log** transport · Mailpit local required for email demo |
| O8 | Obs: structured logs + requestId **P0** · Sentry/Better Stack **hooks B6** · not live SaaS required for exit |

### Product completeness (demo scripts)

| Demo | Required for kit exit |
|---|---|
| D0 lint/typecheck/test | yes |
| D1 GET /health + requestId | yes |
| D2 validation error envelope | yes |
| D3 session cookie **and** Bearer sk_ | yes **both** |
| D4 D1 round-trip | yes |
| D5 R2 put/get | yes |
| D6 example-web FR/EN + login + API | yes |
| D7 @gosilex/ui components used | yes |
| D8 Mailpit demo email | yes |
| D9 MCP ping/whoami | yes |
| D10 extract dry-run + banlist | yes |
| D11 security headers + no secrets in repo | yes |
| D12 merge-on-green App smoke | **ops companion** (track; prefer done but not infinite-block if App delayed) |

---

## Success — code kit EXIT (binary)

- [ ] `bun install && bun run lint && bun run typecheck && bun run test` → 0  
- [ ] `apps/example-api` · `example-web` · `mcp-example` workspaces  
- [ ] D1 demo migrate + CRUD/list with Zod  
- [ ] R2 put+get via `@gosilex/storage`  
- [ ] Better Auth cookie session + protected route with `credentials: 'include'`  
- [ ] Hashed API key demo + Bearer guard + 401 without  
- [ ] Error envelope + FE ApiError path  
- [ ] `@gosilex/ui` Base UI + TanStack Router/Query/Form on ≥1 form  
- [ ] i18n FR default + EN toggle  
- [ ] Mailpit compose + demo email  
- [ ] MCP `ping` + `whoami` only  
- [ ] Security headers on example-api  
- [ ] `.dev.vars.example` placeholders only  
- [ ] Lefthook + commitlint  
- [ ] CI workflow named **`CI`**: lint · typecheck · test  
- [ ] Secret-scan present  
- [ ] Extract dry-run + banlist on packages/examples (0 product share tokens)  
- [ ] README kit Quick Start (demos) + package map  
- [ ] Every package imported by ≥1 example  
- [ ] Axial ADR `axial: true` committed  
- [ ] **No** `apps/share-*` until exit  

### Ops companion (track; aim to complete)

- [ ] gosilex-ci App installed + org APP_ID / PRIVATE_KEY  
- [ ] Smoke: PR + TruffleHog + `reviewed` → bot merge  
- [ ] merge-on-green required checks include CI job names when CI exists  

---

## Explicit non-goals

- Share product features (frame M0–M6)  
- Billing multi-tenant · PostHog · Datadog · Clerk · Next spine · Nest  
- Shared team API key  
- Branch protection native (Free)  
- Live `share.gosilex.com` / Shlink  
- Empty package zoo · fumadocs full site · full Playwright matrix  

## Anti-goals (reject in review)

Share M0 first · Roxabi Nest parity · product strings in packages · god example-api implementing artefacts · TanStack Start as only backend · “complete” = every P2 package · agent commit without ask  

---

## Tree freeze (create only when consumed)

```text
packages/: config, core, types → db, storage → auth → ui, i18n → mcp, email
apps/: example-api → example-web → mcp-example
(no share-* until exit)
scripts/: extract-dry-run + banlist (B6)
.github/workflows: secret-scan, merge-on-green, CI (B1), extract-dry-run (B6)
```

## Phasing

```text
B0 spine → B1 example-api+CI → B2 db/storage → B3 auth
  → B4 example-web → B5 mcp+email → B6 extract+obs hooks+docs
── EXIT ──
P1 share SPEC from frame 001
```

## Entry

```text
/goal  → this file + arbitration freeze
Then: kit frame (optional) → kit SPEC → plan → implement B0…
```

## Exit

All **code kit** checkboxes green + team can extract without share domain.  
**Then** product: new SPEC from frame `001`.
