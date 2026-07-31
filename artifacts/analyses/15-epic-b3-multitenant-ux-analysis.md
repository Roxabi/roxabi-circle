---
title: "Epic B3 — Multi-tenant product UX (A4 shells + invites + reset pwd)"
issue: 15
spark: 116
status: draft
date: 2026-07-30
adr: docs/architecture/adr/0003-multi-tenant-rbac-modules.md
blocked-by: 14
blocks: 17
---

# Analysis #15 — Multi-tenant product UX (B3)

## Source

GitHub [#15](https://github.com/go-silex/silex-boilerplate/issues/15) · Spark **#116**  
Epic **B3** (sequential #3 · blocked by **B2** [#14](https://github.com/go-silex/silex-boilerplate/issues/14)).

> Phase A **backend** livrée (#11 / ADR-0003 A1–A3) but product UX incomplete: no dual shells `/admin`+`/app`, invites seed-only, forgot-password stub.

Children cited on the epic (Spark-side; create GH sub-issues if missing):

| Ref | Intent |
|---|---|
| Spark #86 / kit S3 | Auth forgot/reset password BA + Mailpit |
| Spark #87 / kit S2 | Auth org invites multi-tenant |
| A4 / kit S1 | Demo shells admin (BO) + app (client) |

Related: ADR-0003 **A4** deferred · D10 invites deferred · ADR-0002 BA session · `@gosilex/email` + Mailpit compose · epic B5 [#17] consumer-ready (blocked by B2+B3 mini).

## Problem

Backend tenancy is demo-able on the BA adapter (orgs, members, platform roles, dual-level modules, org-bound keys, IDOR matrix). The **SPA and lifecycle UX** still look like a single-tenant kit demo:

| Gap | Today (worktree) | Needed for B3 DoD |
|---|---|---|
| Shells | One `AppShell` under AuthGate; paths `/`, `/notes`, `/keys`, `/settings` | Distinct **`/admin`** (BO staff/super) vs **`/app`** (client-scoped) |
| Authorization UI | `KitRole` `admin\|user` via `roleForSubject` seed map (`demo-data.ts`) | `platform_role` + memberships + org context drive nav/gates |
| Gates | `AdminGate` / `isAdmin` = `me.role === 'admin'` | Platform gate (`super_admin`\|`staff`) vs org-role gate |
| Invites | BA `invitation` table exists; `invitationLimit: 0`; `BA_ORG_MUTATION_DENY` blocks invite/accept | Create/list/revoke/accept + role ceiling + email + IDOR tests |
| Memberships | Seed-only + kit `POST /api/orgs` owner | Invite path adds members without re-seed |
| Forgot/reset | `ForgotPasswordPage` **stub** (toast only); BA has no `sendResetPassword` | Non-stub BA reset + email observable (Mailpit / log port) |
| `/api/me` | `{ subject, authMethod, role: KitRole }` | Expose platform role, orgs/memberships for shell routing |
| Email edge | Worker uses `sendLog`; SMTP is Node-only (`packages/email/server`) | Edge-safe `EmailPort` for reset + invite mail |

Without B3, products fork BO vs client shells and re-invent invite/reset on top of ADR-0003.

## Outcome

On `example-web` + `example-api` with **`AUTH_SESSION_ADAPTER=better-auth`** (B2 dogfood default):

1. **Two personas navigate distinct surfaces** (staff/super → `/admin*`, client owner/member → `/app*`).
2. **Invite E2E local** documented (create → email/token → accept as matching user → membership).
3. **Reset password non-stub** (request → token email → set password → login).
4. **ADR-0003 D10** updated: invites no longer “seed-only / deferred only”; threat model closed in kit routes.

Axial: **no product domain strings** in `packages/*`. Shells, invite copy, module labels stay in `apps/example-*`. Promote pure helpers to `@gosilex/auth` only if a second call site appears (ADR-0001).

## Appetite

**One epic / ~1 kit cycle** if sliced; **not** one kitchen-sink PR.

| Slice | Appetite | Risk |
|---|---|---|
| S1 A4 shells + me enrichment | M | Routing/nav debt; wrong gate = UX leak (not data if API already fail-closed) |
| S2 Invites | L | Authz / IDOR / role ceiling — human review required |
| S3 Forgot/reset + email | M | Edge email transport; enumeration; token TTL |

Depends on **B2 [#14]** (BA default dogfood). Implementing shells against HMAC-default only proves nothing for multi-tenant.

## Baseline (code)

### Routes (example-web)

```text
/login
/forgot-password          → stub submit
AuthGate shell:
  /                       dashboard
  /notes /keys /settings
  /settings/integrations/feedback  AdminGate (KitRole admin)
  /design-system                   AdminGate (KitRole admin)
```

No `/admin/*`, no `/app/*`, no `/reset-password`, no `/invite/*` or accept flow.

### API (example-api)

| Surface | State |
|---|---|
| BA mount `/api/auth/*` | email/password; org plugin; **mutation deny** on create/invite/accept/… |
| Kit orgs | `GET/POST /api/orgs`, members list (manage_members), modules |
| Platform modules | super_admin patch available |
| `/api/me` | KitRole only — **not** platform_role / memberships |
| Seed | `TENANCY_PERSONAS` + `TENANCY_ORGS` (super, staff@acme/beta, solo, team owner/reader) |
| BA org plugin | `allowUserToCreateOrganization: false`, `invitationLimit: 0` |
| Email demo | `POST /api/demo/email` → `sendLog` |

### Identity UX debt

`AdminGate` and design-system gate still mean **HMAC demo admin**, not ADR-0003 `platform_role` / org `owner|admin`. Even after BA dogfood, a tenancy persona with only client membership will not get a coherent BO vs client product surface.

## Shapes

### Shape 1 — Three sequential slices (S1 shells → S2 invites → S3 reset) — **recommended**

Ship epic as **three demo-able increments**, each with its own PR + tests. Match Spark children (#86 reset, #87 invites) + A4 shells ticket.

```text
S1  me + platform/org gates + /admin + /app shells (notes/keys under /app; platform modules under /admin)
        ↓
S2  kit invite APIs + accept UX + email + IDOR matrix extension + lift D10
        ↓
S3  BA sendResetPassword + forgot/reset pages non-stub + rate limit + Mailpit/log dogfood
```

S2 and S3 are **weakly ordered** (both need EmailPort); if capacity allows, **S3 can parallel S2 after S1** once EmailPort lands in either slice. Prefer **S1 first** so invite UI has a home (`/app/orgs/:id/members` vs `/admin/...`).

**Trade-offs**

- Pro: reviewable security surfaces; aligns epic children; fails closed incrementally  
- Pro: shells alone already satisfy “2 personas navigate distinct surfaces”  
- Con: three merge cycles before full epic DoD  
- Con: temporary dual nav during S1 if old routes remain as redirects

**Rough scope:** L total (M+M+L)

### Shape 2 — Monolith PR (shells + invites + reset)

One epic branch implementing A4 + invite lifecycle + password reset.

**Trade-offs**

- Pro: one DoD checkbox moment; less redirect churn  
- Con: XL review; mixes UI routing with invite threat model and email transport  
- Con: blocks merge of shells behind invite security debates  
- Con: high risk of incomplete IDOR coverage under time pressure  

**Rough scope:** XL — **not recommended**

### Shape 3 — Backend invites/reset only; shells product-side

Close D10 + password email in `example-api` only; leave SPA as single shell until a product forks UI.

**Trade-offs**

- Pro: smaller FE  
- Con: **fails epic DoD** (“2 personas naviguent surfaces distinctes”)  
- Con: products re-fork shells (anti-mission kit)  
- Con: A4 remains forever deferred  

**Rejected** for this epic.

## Fit check

| Constraint | Shape 1 | Shape 2 | Shape 3 |
|---|---|---|---|
| ADR-0003 A4 | ✓ | ✓ | ✗ |
| ADR-0003 D10 threat model before public invites | ✓ (S2) | risk rushed | n/a API only |
| Axial (no product domain in packages) | ✓ | ✓ | ✓ |
| B2 BA default dependency | ✓ | ✓ | ✓ |
| Mailpit / email edge reality | ✓ S3 design | easy to paper over | partial |
| Epic DoD complete | ✓ | ✓ if finished | ✗ |
| Review / human auth gate | ✓ | weak | medium |

**Chosen:** Shape 1.

### Invite implementation sub-choice (S2)

| Option | Notes |
|---|---|
| **2a Kit routes on BA `invitation` table** | Recommended. Threat model in kit; reuses D1 schema; keep BA public mutation deny or open only accept with kit pre-checks |
| **2b Unblock BA `invite-member` / `accept-invitation`** | Faster but BA AC + hooks must encode role ceiling; easy to leak platform fields; harder to audit |
| **2c Fully custom invite table** | Rejected — duplicates BA invitation; ω2 debt |

**Recommend 2a:**  
`POST/GET/DELETE /api/orgs/:orgId/invitations` + `POST /api/invitations/:id/accept` (session), email via `sendInvitationEmail` equivalent, role allowlist `admin|member|reader` (invite `owner` forbidden; transfer ownership out of scope).

### Reset / Mailpit sub-choice (S3)

Workers **cannot** import `packages/email/server` SMTP. Kit already has `sendLog` edge path + Mailpit compose for Node.

| Option | Notes |
|---|---|
| **3a EmailPort** (`log` \| optional HTTP hook \| future Resend) | Recommended. BA `sendResetPassword` + invite mail call same port |
| **3b Force SMTP from Worker** | Non-portable / experimental TCP — reject for kit default |
| **3c Reset without email (return token in JSON)** | Dev-only leak risk — reject except test double |

**Local dogfood:**

1. Default: `EMAIL_TRANSPORT=log` → structured log with reset/invite URL (CI asserts capture).  
2. Optional: small compose **mail-bridge** HTTP→SMTP→Mailpit **or** Node script that drains a queue — document as preferred local UX when present.  
3. Tests never depend on live Mailpit UI; they inject EmailPort spy.

Epic wording “+ Mailpit” = **documented local path**, not CI hard dependency on Docker.

## Risks

1. **B2 not merged** — shells against HMAC still show KitRole admin; multi-tenant seed unused. Mitigate: gate S1 acceptance on BA adapter; feature-flag old KitRole UI.  
2. **Gate confusion** — staff without membership must not see client data in `/app`; super_admin BO list ≠ tenant write. Server remains SSoT; FE gates are UX only.  
3. **Invite IDOR / privilege escalation** — invite as `owner`, set `platform_role`, accept other user’s invite, reuse token. Closed threat model in spec; CP-IDOR extensions mandatory.  
4. **Email enumeration** — forget-password must return generic success (BA default). UI already shows generic sent state.  
5. **Token in logs** — log transport in shared staging must be disabled; staging uses catcher or Resend sandbox.  
6. **Route migration** — moving `/notes` → `/app/notes` breaks bookmarks/tests; use redirects in S1.  
7. **BA version drift** — pin invite/reset paths to installed BA 1.6.x endpoints (`/request-password-reset`, `/reset-password`, org invite fields).  
8. **Open BA mutation surface** — prefer kit routes (2a) so `BA_ORG_MUTATION_DENY` stays mostly intact.

## Unresolved (non-blocking for draft spec)

| Item | Default if unspecified at implement |
|---|---|
| Exact invite TTL | **7 days** |
| Max pending invites / org / day | **20** (rate limit) |
| Accept requires existing user vs signup-on-accept | **Existing session email must match**; signup-on-accept only if `ALLOW_PUBLIC_SIGNUP` + same email |
| Owner invite allowed? | **No** — owner only via create-org or explicit transfer (out of B3) |
| Staff invite into client org | Yes if staff has `manage_members` on that org (membership admin+) |
| Super_admin invite without membership | **No** unless route `allowSuperAdminWrite` + audit (default off) |
| Mail-bridge in compose | Optional P1; log path sufficient for green CI |
| Old KitRole `admin` for design-system | Map design-system to **super_admin \| staff** or keep as kit-internal “UI kit” under `/admin` |

## Recommendation

1. **Shape 1** — S1 shells → S2 kit invites → S3 BA reset (+ EmailPort shared).  
2. **Do not** monolith.  
3. **Close ADR-0003 D10** in the S2 PR (amend ADR note: invites via kit APIs + threat model).  
4. **Enrich `/api/me`** early in S1 (platformRole, orgs[{id,slug,role,kind}]).  
5. Create GH children if Spark #86/#87 are not mirrored: `S1 shells`, `S2 invites`, `S3 reset`.  
6. Proceed to **`artifacts/specs/15-epic-b3-multitenant-ux-spec.md`** (status: draft).

## Files likely impacted (implement, not this analysis)

| Area | Paths |
|---|---|
| Web routes | `apps/example-web/src/routeTree.tsx`, `routes/*`, `components/app-shell.tsx` |
| Web auth model | `apps/example-web/src/lib/auth.ts`, messages FR/EN |
| Me + orgs API | `apps/example-api/src/routes/me.ts`, `orgs.ts`, services |
| Invites | new service/repo on `baInvitation`; middleware capabilities |
| BA factory | `apps/example-api/src/lib/better-auth.ts` (`sendResetPassword`, invitationLimit if needed) |
| Email | `packages/email` EmailPort; example-api wire |
| Tests | example-api IDOR matrix; example-web route/gate tests; docs dogfood |
| ADR | `docs/architecture/adr/0003-*.md` D10 + A4 status |

## Out of epic (restate)

- RBAC **Phase B** custom roles / grant matrix UI  
- SSO / GitHub OAuth product depth  
- Better Auth as only shell for org create (kit `POST /api/orgs` stays)  
- Billing, PostHog, share-domain ACL  
- Promoting empty `@gosilex/rbac` package  
- HMAC multi-tenant demo (fail-closed remains)
