---
title: "Goal — Kit product-ready multi-tenant (BA-only, CF Email, A4, Phase B, consumer)"
status: ready-for-goal
priority: P0
date: 2026-07-30
repo: go-silex/silex-boilerplate
supersedes: artifacts/goals/001-chemin-a-boilerplate-goal.md
related_adrs:
  - docs/architecture/adr/0001-primary-axis-packages-compose-apps.md
  - docs/architecture/adr/0002-session-hmac-interim-vs-better-auth.md
  - docs/architecture/adr/0003-multi-tenant-rbac-modules.md
  - docs/architecture/adr/0004-email-transport-cf-default.md
related_prompt: artifacts/goals/002-goal-run-prompt.md
arbitration_supersede: artifacts/reviews/2026-07-12-goal-arbitration-freeze.md
code_review: artifacts/reviews/2026-07-30-goal-002-code-review-verdict.md
exit_evidence: artifacts/reviews/002-goal-exit-evidence.md
---

# Goal 002 — Kit product-ready multi-tenant

## One-liner

> When a GOSILEX engineer clones this kit or opens a product on `upstream`, they get **Better Auth-only sessions**, **org multi-tenant** (shells + invites + reset), **CF Email-ready** transactional mail, optional **Phase B grants**, and a **zero-edit consumer path** — without re-deriving AGENTS, dual-editing kit files, or shipping product métier in packages.

## JTBD

| Who | Job |
|---|---|
| Kit maintainer | Ship a dogfoodable multi-tenant SaaS spine on CF Workers |
| Product eng | Pull `upstream`, add `apps/<product>-*`, stay zero-edit green |
| Agent / AI | Single SSoT: BA-only, no HMAC dual-path lies |

## Why now

- Goal **001** kit scaffold largely **exited** (examples, dual-path land, Phase A, CI gates).
- **No product upstream** → breaking **HMAC cut** is correct.
- Docs wave 2026-07-30 (ADR-0002/0003/0004 + epic specs) already decided direction; this goal **binds** them with binary exit + wave graph after multi-role **Request changes**.

## Relationship to Goal 001

| | Goal 001 | Goal 002 |
|---|---|---|
| Focus | Extractible monorepo scaffold | Product-ready multi-tenant dogfood + consumer |
| Auth | HMAC interim + BA path | **BA-only** + `sk_` |
| Email | Mailpit local | **CF Email** prod default + Mailpit/log local |
| Tenancy | Not yet | Phase A shipped · A4 + Phase B in scope |
| Status | **superseded** as live kit goal (historical OK) | **ready-for-goal** |

---

## § Supersede (2026-07-30) — mandatory

| Prior SSoT | New truth | Authority |
|---|---|---|
| Freeze / goal 001 **A11** dual HMAC/BA dogfood | Session = **Better Auth only**; HMAC **retired** | ADR-0002 amend |
| Goal 001 exit “HMAC kit / BA contract” | Cookie BA \| Bearer **`sk_`** only | ADR-0002 |
| Freeze **A13/A15** / goal **A13** Mailpit-as-email story | Local Mailpit/log · **prod CF Email** | ADR-0004 |
| DR-B8-04 email deferred-closed | **Unparked** → GH #21 / Spark #126 | ADR-0004 |
| DR-B8-02 RBAC Phase B park + product RFC hard gate | **Unparked** → GH #22 / Spark #127 after B2+B3; product RFC **soft** (kit dogfood on `feedback` module is enough need signal) | ADR-0003 D4 |
| Goal 001 / AGENTS **A14** “Paraglide preferred” as live | Catalogs + `@gosilex/i18n` live; Paraglide **park** | DR-B8-01 (remains park) |
| B2 “BA default + HMAC Option A” | **HMAC cut** hard delete | Spec `14-epic-b2-hmac-cut-ba-only-*` |
| Linear epic order B1→B8 | Wave graph below | This goal |

**Do not** treat goal 001 checkboxes or freeze rows above as live DoD.

---

## Locked decisions (D1–D12)

| ID | Decision |
|---|---|
| D1 | Browser session = **Better Auth only** — cut HMAC now |
| D2 | Dual credential = **cookie session \| Bearer sk_** (sk_ never removed) |
| D3 | Email prod default = **CF Email Sending** binding; local `log`\|`smtp`; Resend escape hatch |
| D4 | `EMAIL_TRANSPORT=log` **fail-closed** outside `development`\|`test` |
| D5 | RBAC Phase B = **ship** (custom roles + grants); no empty `@gosilex/rbac` |
| D6 | Single runtime authz resolver after Phase B (code matrix = seed only) |
| D7 | Invites = **kit APIs only**; BA native org invite/accept paths stay **DENY** |
| D8 | Web = **Vite SPA** + API **Hono Worker**; TanStack Start **not** default |
| D9 | i18n = app catalogs + `@gosilex/i18n`; Paraglide monorepo **park** |
| D10 | Axial ADR-0001 + A8; zero product domain in packages/examples |
| D11 | Zero-edit product contract = law for dogfood |
| D12 | `validate:full` local primary gate |
| D13 | **Every epic lands via `/ship`** — no direct merge to base without PR + review + fix loop |

---

## Process gate — `/ship` per epic (mandatory)

**Rule:** each epic (and each independently shippable slice that opens its own PR) **must** go through **`/ship`** before counting as done for Goal 002.

```text
/ship  ≡  commit → /pr → /code-review → [/fix ↺ /code-review]×≤K → label `reviewed` → /ci-watch → [/cleanup]
```

| Requirement | Detail |
|---|---|
| **Feature branch** | Never implement on `main` / `staging` |
| **One epic → ≥1 PR** | Prefer 1 PR per epic; large epics (B3, B6) may split **one PR per slice** — **each PR still `/ship`** |
| **No silent merge** | Forbidden: push main, squash without review, `LEFTHOOK=0` / `--no-verify` to skip gates, merge without `## Code Review` |
| **Review + fix** | `/code-review` findings → `/fix` until APPROVED or max iters (default K=2) then human decide |
| **Merge gate** | Label **`reviewed`** + CI green (merge-on-green / auto-merge when App set; else manual after green+reviewed) |
| **Base branch** | Prefer `--base staging` if `origin/staging` exists; else `main` (document in PR) |
| **Issue link** | PR closes / links the GH epic issue (`Closes #14`, etc.) |
| **Evidence** | Goal exit needs PR URL + merged (or green+reviewed path) per epic on critical path |

### Suggested ship order (critical path)

| Order | Epic | Command after implement green |
|---|---|---|
| 1 | B2 #14 | `/ship` (or `/ship --base staging`) |
| 2a | B-email #21 | `/ship` (// after B2) |
| 2b | B3 S1 shells | `/ship` |
| 3 | B3 S2 invites | `/ship` |
| 4 | B3 S3 reset | `/ship` |
| 5 | B1 #13 | `/ship` (docs; after B2 truth) |
| 6 | B5 #17 | `/ship` |
| 7 | B-rbac #22 | `/ship` (API first; UI optional second `/ship`) |
| * | B4 / B6 / B7 / B8 | each `/ship` when worked |

Companions may ship in parallel tracks **on separate branches/PRs**, still each via `/ship`.

### Anti-patterns (ship)

- Kitchen-sink PR covering B2+B3+email+rbac  
- Merging “docs only” epic without review because “it’s just markdown” — still `/ship` (lighter review OK, not skip)  
- Stacking 5 epics on one branch then one mega-`/ship`  
- Claiming epic done on local green without PR  

---

## Critical path vs companions

### Critical path (blocks goal exit)

```text
B2 HMAC cut (#14)
  ├─► B-email CF (#21) ── redaction + fail-closed + transport
  └─► B3 S1 shells (#15)
        ├─► B3 S2 invites (system roles + DENY BA native)
        └─► B3 S3 reset (uses EmailPort)
              │
B1 SSoT resync (#13)  ◄── after B2 narrative stable (not before cut)
              │
B5 consumer dogfood (#17)  ◄── kit mission outcome
              │
#22 RBAC Phase B (API + seed + IDOR + single resolver)
    UI admin matrix = optional for exit
```

### Companions (non-blocking for MT spine exit)

| Track | Epic | Notes |
|---|---|---|
| Ops | B4 #16 | Parallel early; bot merge **or** blocked evidence |
| Quality | B7 #19 | After shells smokeable; e2e not in pre-push |
| Patterns | B6 #18 | Split tickets; **at most API client** hard for consumers |
| Park rest | B8 #20 | Early docs: Paraglide / patchlog / Plausible only |

---

## Binary program exit (DoD global)

Goal **exits** when **all** are true. **Evidence SSoT:** [`artifacts/reviews/002-goal-exit-evidence.md`](../reviews/002-goal-exit-evidence.md) (not GH epic closedness alone).

Re-verified **2026-08-03** kit SHA `9414516` (partial — residual rows block `status: exited`):

1. [x] `bun run validate:full` green on kit — **PASS** (exit ledger; Node ABI rebuild if needed)  
2. [x] **No public HMAC session path** — **PASS** (PR #23)  
3. [x] Local dogfood: **2 personas** `/admin` vs `/app`; **invite + reset** — **PASS (automated)** 2026-08-04: invitations 13 + password-reset 4 tests green; shells #24–#26 (manual SPA optional)  
4. [x] Tokens **never** clear-logged; `log` transport rejected outside dev/test — **PASS** (PR #27/#28)  
5. [ ] ≥1 product: `upstream` + zero-edit + banlist — **STALE / blocked** 2026-08-04: `silex-kit-dogfood` clone ACL fail; historical evidence only — **blocks goal exit**  
6. [x] Phase B + **CP-IDOR ≥8** — **PASS** (PR #30)  
7. [x] AGENTS + README BA-only + CF Email + Phase B — **PASS** (PR #29/#88)  
8. [x] Supersede + B8 park surface — **PASS** (`docs/park-decisions-b8.md` · spec #20 accepted 2026-08-04)  
9. [x] Critical-path `/ship` PRs — **PASS** (exit ledger)

**Not required for exit:** Playwright hard gate forever-green, CodeRabbit enable, CF domain onboarded on Gosilex account, all four B6 patterns, TanStack Start, Paraglide, share M0 métier, GitHub OAuth.

---

## Security pins (normative for critical path)

| Pin | Rule |
|---|---|
| S1 | BA-only + sk_; scrub dual adapter from live specs |
| S2 | Kit invites only; BA org invite/accept **DENY** |
| S3 | Invite ceiling: system rank + Phase B **capability dominance** (cannot grant what you lack) |
| S4 | `is_system` roles immutable; default-deny missing grants |
| S5 | `member.role` = known system key **or** org `organization_roles.key` |
| S6 | Accept: public signup **off** default; prefer `emailVerified` when signup on |
| S7 | Super_admin no write bypass on invite routes |
| S8 | Email log fail-closed outside dev/test; redaction tests |

---

## Epic map (Spark / GH)

| Wave | Spark | GH | Role | Land |
|---|---|---|---|---|
| Cut | #115 | [#14](https://github.com/go-silex/silex-boilerplate/issues/14) | B2 HMAC cut | **`/ship`** |
| Email | #126 | [#21](https://github.com/go-silex/silex-boilerplate/issues/21) | CF Email | **`/ship`** |
| UX | #116 | [#15](https://github.com/go-silex/silex-boilerplate/issues/15) | B3 A4+invites+reset | **`/ship` per slice** (S1/S2/S3) |
| SSoT | #114 | [#13](https://github.com/go-silex/silex-boilerplate/issues/13) | B1 after B2 | **`/ship`** |
| Consumer | #118 | [#17](https://github.com/go-silex/silex-boilerplate/issues/17) | B5 dogfood | **`/ship`** |
| RBAC | #127 | [#22](https://github.com/go-silex/silex-boilerplate/issues/22) | Phase B | **`/ship`** (API; UI optional 2nd) |
| Ops | #117 | [#16](https://github.com/go-silex/silex-boilerplate/issues/16) | Companion | **`/ship`** |
| Patterns | #119 | [#18](https://github.com/go-silex/silex-boilerplate/issues/18) | Companion (split) | **`/ship` per pattern PR** |
| Quality | #120 | [#19](https://github.com/go-silex/silex-boilerplate/issues/19) | Companion | **`/ship`** |
| Park | #121 | [#20](https://github.com/go-silex/silex-boilerplate/issues/20) | Paraglide/patchlog/Plausible only | **`/ship`** (docs PR OK) |

**Specs SSoT (use only hmac-cut for B2):**

- `artifacts/specs/14-epic-b2-hmac-cut-ba-only-spec.md`  
- `artifacts/specs/21-epic-cf-email-prod-spec.md`  
- `artifacts/specs/15-epic-b3-multitenant-ux-spec.md`  
- `artifacts/specs/13-epic-b1-ssot-verite-kit-spec.md` (BA-only DoD after amend)  
- `artifacts/specs/17-epic-b5-consumer-ready-spec.md`  
- `artifacts/specs/22-epic-rbac-phase-b-spec.md`  

Superseded: `14-epic-b2-auth-ba-default-*` — **do not implement**.

---

## Out of scope

- `apps/share-*` / share M0–M6 métier  
- GitHub OAuth + org recheck (separate epic if needed)  
- TanStack Start as default  
- Paraglide monorepo  
- Full CD / Free branch protection  
- Billing, PostHog, Datadog, Clerk, shared team API key  
- Empty `@gosilex/rbac` / `@gosilex/masterdata` / `@gosilex/email-cf`  
- Inbound Email Routing  

---

## Anti-goals

- Kitchen-sink single PR for whole chain  
- Documenting HMAC default “then cut later”  
- Dual authz (code map + DB grants) at runtime after Phase B  
- Opening BA-native invites “for convenience”  
- Dogfood docs-only as B5 exit  
- Treating B6×4 or B7 triple as critical-path AND  
- **Landing an epic without `/ship`** (no PR / no code-review / no fix phase)  

---

## Process

```text
per epic:
  /plan (or reuse approved spec) → implement on feat branch → validate:full
       → /ship   # PR + code-review + fix loop + reviewed + ci-watch
       → only then start next hard-dep epic
```

1. Goal 002 is the live SSoT (this file).  
2. **`/plan` Wave 1 = B2 only** (#14).  
3. After B2 implement green → **`/ship`** (mandatory).  
4. Then **`/plan` + implement + `/ship`** for #21 and B3 S1 (parallel tracks OK on **separate** branches).  
5. One concern per PR; claim done = green commands **+** shipped PR evidence.  
6. Auth/RBAC/email → tests + **agent code-review via `/ship`** + human review on sécu.  
7. Commit/push only on request (or as part of `/ship` commit step when user asked to ship).  

## Next command after accept

```text
/plan   — Wave: B2 HMAC cut (#14) only
# implement…
/ship   — land #14 (PR + review + fix + reviewed + CI)
# then:
/plan #21  → implement → /ship
/plan #15 S1 → implement → /ship
```

Or paste: `artifacts/goals/002-goal-run-prompt.md` into a fresh `/goal` session only if regenerating slices — **this file is the SSoT goal**.
