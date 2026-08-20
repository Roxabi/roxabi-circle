# Runbook — Cloudflare Email Sending (kit)

SSoT decision: [ADR-0004](./architecture/adr/0004-email-transport-cf-default.md).  
Implementation epic: GitHub **#21**.

Transactional only (reset, invites, demo). **Not** marketing bulk. **Not** inbound routing.

---

## Env matrix

| `ENVIRONMENT` | `EMAIL_TRANSPORT` | Binding | Notes |
|---|---|---|---|
| `development` / `test` | `log` (default if unset) | optional | Tokens **redacted** in log body |
| `staging` | **required** `cf` or `resend` | `EMAIL` when `cf` | Real send for client/QA dogfood · **allowlist + From @example.com** |
| `production` | **required** `cf` or `resend` | `EMAIL` when `cf` | `log` **fail-closed** · allowlist optional |
| any | `smtp` | — | **Node only** (`@kit/email/server` → Mailpit) — never Worker |

### Worker string vars

| Var | Role |
|---|---|
| `EMAIL_TRANSPORT` | `log` \| `cf` \| `resend` |
| `EMAIL_FROM` | From address — **staging: `@example.com` only** (default) · prod: onboarded domain |
| `EMAIL_FROM_NAME` | Optional display name |
| `EMAIL_ALLOW_DOMAINS` | Comma-separated **recipient** domains (exact). **Required on staging** with `cf`\|`resend` |
| `EMAIL_FROM_DOMAIN` | Pin for From domain (staging default `example.com` if unset) |
| `RESEND_API_KEY` | Only if `resend` escape hatch |

### Staging policy (no silent client spray)

Staging is meant for **configured client + Kit test inboxes**, not arbitrary DB emails.

```bash
ENVIRONMENT=staging
EMAIL_TRANSPORT=cf
EMAIL_FROM=noreply@example.com
EMAIL_FROM_NAME=Kit Staging
# Only these recipient domains receive mail (exact match after @)
EMAIL_ALLOW_DOMAINS=example.com,client-acme.test,partner.io
# optional override (default example.com):
# EMAIL_FROM_DOMAIN=example.com
```

| Rule | Behavior |
|---|---|
| Missing `EMAIL_ALLOW_DOMAINS` on staging + `cf`\|`resend` | **Fail closed** at port create |
| `EMAIL_FROM` not `@example.com` (or `EMAIL_FROM_DOMAIN`) | **Fail closed** at port create |
| `to` domain ∉ allowlist | **Fail closed** at send (`EMAIL_RECIPIENT_DOMAIN_NOT_ALLOWED`) — no CF call |
| Subject | Forced prefix **`[TEST STAGING]`** (idempotent if already present) |
| Subdomains | **Not** auto-included (`mail.example.com` ≠ `example.com`) — list them explicitly |

**Ops:** add each client test domain to `EMAIL_ALLOW_DOMAINS` when onboarding that client on staging. Team QA uses `@example.com`.

### Wrangler binding

```toml
[[send_email]]
name = "EMAIL"
```

See `apps/example-api/wrangler.toml`.

Local `.dev.vars` (from `.dev.vars.example`):

```bash
EMAIL_TRANSPORT=log
# EMAIL_FROM=noreply@your-domain.com
```

---

## Ops: enable domain (not a kit merge gate)

1. Account with Email Sending access.
2. Onboard domain:
   ```bash
   npx wrangler email sending enable yourdomain.com
   # or Dashboard → Email Service → Sending
   ```
3. Complete DNS as Cloudflare instructs (SPF / DKIM / DMARC).
4. Deploy Worker with binding + secrets:
   ```bash
   # production
   EMAIL_TRANSPORT=cf
   EMAIL_FROM=noreply@yourdomain.com

   # staging (Kit)
   EMAIL_TRANSPORT=cf
   EMAIL_FROM=noreply@example.com
   EMAIL_ALLOW_DOMAINS=example.com,client-domain.test
   ```
5. Smoke: `POST /api/demo/email` (session) or forgot-password with a **whitelisted** inbox you control.

### Deliverability checklist

- [ ] From domain matches onboarded domain
- [ ] SPF includes Cloudflare Email Sending (per CF docs)
- [ ] DKIM records published
- [ ] DMARC policy staged (`p=none` first, then quarantine/reject)
- [ ] Test with **real** addresses you control (fake addresses hurt reputation)
- [ ] Transactional content only; include both `text` and `html`

### Common failures

| Symptom | Likely cause |
|---|---|
| `EMAIL_TRANSPORT=cf requires EMAIL send_email binding` | Missing `[[send_email]]` or wrong env |
| `E_SENDER_NOT_VERIFIED` / domain errors | Domain not onboarded |
| `log is forbidden when ENVIRONMENT is staging\|production` | Left `EMAIL_TRANSPORT=log` in prod |
| `EMAIL_ALLOW_DOMAINS is required when ENVIRONMENT=staging` | Real send on staging without recipient allowlist |
| `EMAIL_FROM must be @example.com` | Staging From on non-Kit domain |
| `EMAIL_RECIPIENT_DOMAIN_NOT_ALLOWED` | `to` not in allowlist (expected if DB has non-client domains) |
| Tokens visible in logs | Use `createLogEmailPort` / `createEmailPort` only (redacts body); never custom `console.log` of URL |

---

## Local dogfood

| Path | How |
|---|---|
| **Worker log** | Default: inspect console JSON `transport:"log"` (redacted body) |
| **Mailpit** | Node scripts via `@kit/email/server` + compose SMTP — not the Worker bundle |
| **CF remote** | Optional `remote: true` on binding in local wrangler for proxied real sends (ops only) |

Reset E2E: `docs/testing.md` § password reset.  
Invite E2E: `docs/testing.md` § org invites.

---

## Call sites (kit)

| Flow | Code |
|---|---|
| Demo | `services/email.ts` → `resolveEmailPort` |
| Password reset | BA `sendResetPassword` via `@kit/auth/factory` (`sendResetPasswordMail`) |
| Org invite | `services/invitations.ts` + route injects port |

Package: `@kit/email` — Workers path: `createEmailPort` + `build*EmailText` + `redactEmailBody`.
Node scripts may use `@kit/email/server` (`sendSmtp` / `sendLog`); not the Worker default.
