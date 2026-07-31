---
title: "Spec — Epic B3 Multi-tenant product UX (A4 shells + invites + reset)"
issue: 15
spark: 116
status: draft
tier: F-full
date: 2026-07-30
analysis: artifacts/analyses/15-epic-b3-multitenant-ux-analysis.md
adr: docs/architecture/adr/0003-multi-tenant-rbac-modules.md
blocked-by: 14
---

# Spec #15 — Multi-tenant product UX (B3)

## Context

- **Issue:** [#15](https://github.com/go-silex/silex-boilerplate/issues/15) (Spark #116)
- **Analysis:** [`15-epic-b3-multitenant-ux-analysis.md`](../analyses/15-epic-b3-multitenant-ux-analysis.md) — Shape 1 (3 slices)
- **ADR:** [0003](../../docs/architecture/adr/0003-multi-tenant-rbac-modules.md) — Phase **A4** + close **D10**
- **Depends:** B2 [#14] **HMAC cut / BA-only** (Goal 002); soft-dep **#21 CF Email** for real delivery
- **Blocks (soft):** B5 [#17] consumer-ready dogfood UX · #22 RBAC B UX

## Goal

Make the kit **product-shaped** for multi-tenant SaaS demos: dual shells (back-office vs client app), org invites with a closed threat model, and real forgot/reset password via Better Auth + edge-safe email — without product-domain strings in `packages/*`.

## Personas

| Persona | Seed (ADR-0003) | Primary surface | Must be able to |
|---|---|---|---|
| **Super admin** | `super@gosilex.local` · `platform_role=super_admin` | `/admin` | List platform modules; optional org catalogue read; no silent tenant write |
| **Staff** | `staff@gosilex.local` · staff + acme `admin` + beta `member` | `/admin` home; `/app` when acting in membership | BO nav of **their** orgs only; manage members/invites on acme; not solo org |
| **Solo client** | `solo@gosilex.local` · owner of org_solo | `/app` | Notes/keys/modules for solo; no `/admin` |
| **Team owner** | `team-owner@gosilex.local` | `/app` | Invite member/reader on org_team; manage modules if admin+ |
| **Team reader** | `team-reader@gosilex.local` | `/app` | Read-only; cannot invite or enable modules |
| **Anonymous** | — | `/login`, `/forgot-password`, `/reset-password` | Request reset; complete reset with token |

Passwords: seed `TENANCY_PASSWORD` / docs (never commit real secrets).

## Expected behavior

1. After BA login, `/api/me` returns **platformRole**, **orgs** (id, slug, name, kind, role), and legacy fields as needed for compat.
2. Router sends **platform actors** (`super_admin` \| `staff`) to `/admin` by default; pure clients to `/app`. Deep links respect gates (403/redirect UX).
3. **Client shell** (`/app/*`) is org-scoped: active org selector (path or header `X-Org-Id` parity with API); notes/keys/settings live under `/app`.
4. **BO shell** (`/admin/*`) lists platform modules (staff read / super patch), orgs the actor may access, links into `/app` with org context when membership exists.
5. **Invites:** org `owner|admin` creates invite (role ∈ allowlist); invitee with matching session email accepts; membership appears; revoke cancels pending.
6. **Forgot/reset:** user requests reset → generic success → email (or log capture) with single-use token → set password → login with new password.
7. Server remains **fail-closed** for IDOR; FE gates are convenience only.
8. Session stack is **BA-only** (no HMAC branch); dual credential remains cookie \| `sk_`.

## Routes (SPA)

### Public

| Path | Page | Notes |
|---|---|---|
| `/login` | existing | Link to forgot |
| `/forgot-password` | **wire non-stub** | POST request-password-reset |
| `/reset-password` | **new** | Query `token` (and optional callback); set new password |
| `/invite/accept` | **new** | Query `invitationId` (and/or token); requires session; email bind |

### Authenticated — client (`AuthGate` + org context)

| Path | Page | Min capability |
|---|---|---|
| `/app` | Client home / org picker | any membership |
| `/app/notes` | Notes (redirect from `/notes`) | membership |
| `/app/keys` | API keys org-bound | membership |
| `/app/settings` | Settings | membership |
| `/app/orgs/:orgId/members` | Members + invites UI | `manage_members` |
| `/app/orgs/:orgId/modules` | Org modules enable | `manage_modules` for write |

### Authenticated — back-office (`PlatformGate`)

| Path | Page | Min |
|---|---|---|
| `/admin` | BO dashboard | `staff` \| `super_admin` |
| `/admin/orgs` | Orgs actor can see (staff=memberships; super=all) | platform role |
| `/admin/modules` | Platform module catalogue | staff read; super patch |
| `/admin/design-system` | Move or keep under BO | platform role (kit demo) |

### Redirects (S1)

| From | To |
|---|---|
| `/` (auth) | `/admin` if platform role else `/app` |
| `/notes`, `/keys`, `/settings` | `/app/...` equivalents |
| `/design-system` | `/admin/design-system` |
| Client hitting `/admin/*` | `/app` + toast forbidden |
| Staff without org hitting tenant path without orgId | org picker |

## API contracts

### Enrich `GET /api/me`

```ts
{
  subject: string
  email?: string
  authMethod: 'session' | 'api_key'
  /** @deprecated kit demo KitRole — keep until HMAC demos removed */
  role?: 'admin' | 'user'
  platformRole: 'super_admin' | 'staff' | null
  orgs: Array<{
    id: string
    name: string
    slug: string
    kind: 'client' | 'internal'
    status: 'active' | 'suspended' | 'archived'
    role: 'owner' | 'admin' | 'member' | 'reader'
  }>
  requestId: string
}
```

Rules:

- Session preferred for full payload; API key may return single org binding only.
- `platformRole` from `user_platform_roles` only (never from body).
- Do not expose other users’ emails beyond what list-members already allows.

### Invites (kit routes — analysis option 2a)

All require **BA session** (not `sk_` for create/accept/revoke).

| Method | Path | Guard | Body / result |
|---|---|---|---|
| `POST` | `/api/orgs/:orgId/invitations` | `requireOrgContext` + `manage_members` | `{ email, role }` → `{ invitation: { id, email, role, status, expiresAt } }` |
| `GET` | `/api/orgs/:orgId/invitations` | same | `{ invitations: [...] }` pending (+ optional status filter) |
| `DELETE` | `/api/orgs/:orgId/invitations/:invitationId` | same | `{ ok: true }` cancel |
| `POST` | `/api/invitations/:invitationId/accept` | `requireAuth` session | `{}` → `{ org, membership }` |

**Role allowlist on create:** `admin` \| `member` \| `reader` only.  
**Ceiling:** inviter with `admin` cannot invite `admin` if policy is owner-only for admin invites — **normative:** inviter role must be **strictly higher** than invited role in `owner > admin > member > reader`, **except** `owner` may invite `admin|member|reader` and `admin` may invite `member|reader`.  
**Forbidden:** invite `owner`; any `platform_role` field; accept with mismatched email; accept expired/cancelled/used; accept into suspended org.

**Email bind:** `session.user.email` (normalized) **===** `invitation.email` (normalized). Else **403** `INVITE_EMAIL_MISMATCH`.

**TTL:** default **7d** (`expires_at`).  
**Single-use:** status → `accepted` (or delete row); second accept → **404/409**.  
**Rate limit:** e.g. 20 creates / org / hour + global IP limit on accept.  
**Cross-tenant:** wrong `orgId` on list/delete → **404** (IDOR style).  
**Super_admin:** no invite without membership unless future `allowSuperAdminWrite` (default **off**).

BA plugin: **`BA_ORG_MUTATION_DENY` remains for BA-native invite/create/accept** — kit owns **all** product invite APIs (no soft open of BA-native paths).

Optional: store invite in BA `invitation` table (already migrated). Status values align with BA (`pending`, `accepted`, `canceled` / kit `cancelled` — pick one and map).

### Password reset (BA)

Configure in `createBetterAuth`:

```ts
emailAndPassword: {
  enabled: true,
  sendResetPassword: async ({ user, url, token }) => {
    await emailPort.send({ to: user.email, subject, text/html including url })
  },
  // resetPasswordTokenExpiresIn: 3600 (default ~1h OK)
}
```

| Step | Client | Server |
|---|---|---|
| Request | `POST /api/auth/request-password-reset` `{ email, redirectTo?: web /reset-password }` | Always generic success if BA enabled; rate-limited |
| Reset | `POST /api/auth/reset-password` `{ newPassword, token }` | Single-use verification token; then login |
| UI | `/forgot-password`, `/reset-password?token=` | Non-stub |

Pin exact BA path names to installed version (1.6.x may use `forget-password` alias — **implement against runtime + docs**, rate-limit already covers `forget-password|reset-password` in `auth.ts`).

**Enumeration:** response body/UI identical whether email exists.  
**BA-only kit:** reset always via BA mount; no HMAC fallback path.

### EmailPort (shared S2/S3)

```ts
type EmailPort = {
  send(input: { to: string; subject: string; text: string; html?: string }): Promise<{ ok: boolean; transport: string }>
}
```

| Transport | When |
|---|---|
| `log` | default Worker local + tests (structured JSON) |
| `smtp` | Node scripts only (`packages/email/server`) — not Worker bundle |
| `http` (optional) | `EMAIL_HOOK_URL` → bridge → Mailpit |
| `resend` / CF Email | prod later (out of green CI) |

Templates: plain/React-email-style in `apps/example-api` or `packages/email/templates` with **kit copy only** (no share strings). FR default subject lines OK via i18n later; v1 English or FR fixed strings in example-api.

### Existing APIs reused

- `GET/POST /api/orgs`, members, modules (Phase A)  
- Org context middleware path > `X-Org-Id` > active org  
- Guards: `requirePlatformRole`, `requireOrgCapability('manage_members'|'manage_modules')`

## Data

No new core tenant spine. Reuse:

```text
BA:  user, session, account, verification
BA:  organization, member, invitation   -- invitation rows now written by kit invites
Kit: user_platform_roles
Kit: platform_modules, organization_modules
Kit: api_keys.organization_id
```

Invite row fields (existing migration 0006):

| Column | Use |
|---|---|
| id | public invitation id |
| organization_id | tenant |
| email | bind on accept |
| role | allowlisted role_key |
| status | pending \| accepted \| canceled |
| expires_at | TTL |
| inviter_id | audit |
| created_at | audit |

Reset tokens: BA `verification` table (`reset-password:${token}` pattern) — do not invent parallel token store.

## Threat model (invites) — closes ADR-0003 D10

| Threat | Control |
|---|---|
| Invite to `owner` / escalate | Role allowlist + ceiling vs inviter |
| Set `platform_role` via invite | Field rejected; not on invitation schema |
| Accept someone else’s invite | Email bind strict |
| Token replay | Single-use status |
| Expired invite | Check `expires_at` |
| Enumerate orgs via invite ids | Accept returns 404 for unknown/other-tenant ids where applicable; no org dump |
| Staff global invite | Membership + manage_members required |
| sk_ mint chain via invite | Session-only mutations |
| Rate abuse | Per-org + IP limits |
| Zip/open redirect on reset | `redirectTo` allowlist to same-origin web paths only |

## UX surfaces (summary)

```text
                    ┌──────────── public ────────────┐
                    │ login · forgot · reset · accept │
                    └───────────────┬────────────────┘
                                    │ session
              ┌─────────────────────┴─────────────────────┐
              │                                           │
     platformRole set?                              client only
              │                                           │
       ┌──────▼──────┐                             ┌──────▼──────┐
       │   /admin    │  optional deep-link         │    /app     │
       │ BO modules  │ ─────────────────────────►  │ org-scoped  │
       │ org list    │     with org membership     │ notes keys  │
       └─────────────┘                             │ invites UI  │
                                                   └─────────────┘
```

## Slices

| Slice | Demo-able increment | Depends | Maps to |
|---|---|---|---|
| **S1 — A4 shells** | `/api/me` enriched; `PlatformGate` / org gates; `/admin` + `/app`; redirects; 2 personas navigate | B2 BA default | ADR A4 |
| **S2 — Invites** | Kit invite CRUD + accept; email; members UI; IDOR suite; ADR D10 amend | S1 (UI home) | Spark #87 |
| **S3 — Reset password** | BA `sendResetPassword`; forgot/reset pages; rate limit; EmailPort dogfood + Mailpit doc | EmailPort (may land in S2) | Spark #86 |

**Order:** S1 → (S2 ∥ S3 after EmailPort). Prefer S2 before S3 if only one auth review slot (invite risk higher).

### S1 acceptance detail

- [ ] Staff login lands `/admin`; solo lands `/app`
- [ ] Solo cannot open `/admin` (redirect + message)
- [ ] Staff sees acme+beta in BO org list; not org_solo
- [ ] `/notes` redirects to `/app/notes` and still works with org context
- [ ] `AdminGate` KitRole path replaced or dual-mapped; design-system under BO
- [ ] No invite/reset required for S1 merge

### S2 acceptance detail

- [ ] Team owner invites `member@…` with role member → pending row + email/log
- [ ] Invitee accepts with matching email → member list shows them
- [ ] Mismatched email accept → 403
- [ ] Reader cannot create invite
- [ ] Invite owner role → 400 validation
- [ ] Cross-org delete invite → 404
- [ ] ADR-0003 D10 text updated (no longer seed-only only)
- [ ] Doc: local invite E2E steps (seed + Mailpit/log)

### S3 acceptance detail

- [ ] Forgot form calls BA; generic success always
- [ ] Token from EmailPort spy / log completes reset
- [ ] Old password fails; new password logs in
- [ ] Reuse token fails
- [ ] Rate limit on request path
- [ ] README/docs: Mailpit optional path + log path

## Success criteria (epic DoD)

- [ ] **2 personas** navigate **distinct** surfaces (`/admin` vs `/app`) without manual URL hacks beyond login
- [ ] **Invite E2E local documented** (scripts or `docs/` section)
- [ ] **Reset pwd non-stub** (UI + BA + EmailPort)
- [ ] **ADR-0003**: A4 done; D10 no longer “deferred only / seed-only product API”
- [ ] IDOR/authz tests for invite + shell-critical APIs green
- [ ] `bun run validate:full` green
- [ ] Zero product-domain strings in `packages/*` (banlist)
- [ ] No empty new package without two call sites

## Tests

| CP / suite | Coverage |
|---|---|
| CP-AUTH-SESSION | reset completes; session after reset |
| CP-IDOR | invite cross-org; accept wrong email; staff vs solo; members list |
| CP-UNAUTH | invite/accept/reset without session where required |
| CP-FE-CRED | credentials include on auth forms |
| Unit | role ceiling helper; email normalize; TTL expired |
| Integration | S2 matrix ≥ 8 cases; S3 ≥ 4 cases |
| Optional e2e | Playwright later (P1) — not blocking epic if integration solid |

Extend `docs/testing.md` CP-IDOR notes for invitations.

## Edge cases

| Case | Handling |
|---|---|
| User already member | invite create 409 or accept no-op idempotent — **prefer 409 on create** |
| Suspended org | no new invites; accept 403 `ORG_SUSPENDED` |
| Last owner | unchanged from Phase A (no demote via invite) |
| Public signup off | invitee must already exist (seed or prior user); accept fails with clear code if no account |
| Public signup on | optional create-on-accept **out of scope** unless cheap; document “create account first” |
| Active org cookie mismatch | path org wins; 403 on mismatch |
| BA session required | 401 on invite mutations without session; `sk_` denied for invite create/accept |
| EmailPort failure | log error; invite still pending? **prefer fail request** if email required for UX — or create pending + warn; **normative: create invite then send; if send fails, cancel invite + 503** to avoid orphan silent invites |

## Out of scope

- Phase **B** custom roles / per-module grant UI  
- SSO / SAML / GitHub OAuth org recheck  
- Transfer ownership wizard  
- Super_admin break-glass invite/write  
- Billing, share ACL, product modules beyond kit `feedback` demo  
- Resend/CF Email production polish (hook only)  
- TanStack Start / Next shells  
- Reintroducing HMAC session path (owned by B2 cut — out of B3)

## Implementation notes

| Location | Owns |
|---|---|
| `apps/example-web` | shells, gates, pages, i18n messages, redirects |
| `apps/example-api` | me enrichment, invite service/routes, BA sendResetPassword wire, EmailPort binding |
| `packages/email` | EmailPort type + log (+ optional http); **no** product copy required |
| `packages/auth` | optional pure role-ceiling helper if shared; else keep in example-api until 2nd app |
| ADR-0003 | amend D10 + mark A4 shipped when S1+S2 done |

### FE gate helpers (replace KitRole-centric `isAdmin`)

```ts
function hasPlatformRole(me, ...roles: Array<'super_admin'|'staff'>): boolean
function canManageMembers(me, orgId): boolean  // from orgs[].role
```

Server still enforces; FE only hides nav.

### Docs to touch (implement PRs)

- `README.md` or `docs/testing.md` — invite E2E + reset dogfood  
- ADR-0003 D10 / A4 rows  
- `.dev.vars.example` — `EMAIL_TRANSPORT`, optional `EMAIL_HOOK_URL`

## Ambiguity

None blocking draft. Implement-time pins:

1. Exact BA 1.6 request-password-reset path names in this lockfile.  
2. Invitation `status` spelling (`canceled` vs `cancelled`) — match BA schema default.  
3. Whether `/api/me` includes `email` (recommended yes for invite bind UX).

## Status

**draft** — ready for human skim + Spark child ticket sync; not approved for implement until B2 path is clear and epic owner confirms slice order (S2 before S3 vs parallel).
