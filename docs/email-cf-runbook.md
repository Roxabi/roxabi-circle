# Runbook — Cloudflare Email Sending (kit)

SSoT decision: [ADR-0004](./architecture/adr/0004-email-transport-cf-default.md).  
Implementation epic: GitHub **#21** / Spark #126.

Transactional only (reset, invites, demo). **Not** marketing bulk. **Not** inbound routing.

---

## Env matrix

| `ENVIRONMENT` | `EMAIL_TRANSPORT` | Binding | Notes |
|---|---|---|---|
| `development` / `test` | `log` (default if unset) | optional | Tokens **redacted** in log body |
| `staging` / `production` | **required** `cf` or `resend` | `EMAIL` when `cf` | `log` **fail-closed** |
| any | `smtp` | — | **Node only** (`@gosilex/email/server` → Mailpit) — never Worker |

### Worker string vars

| Var | Role |
|---|---|
| `EMAIL_TRANSPORT` | `log` \| `cf` \| `resend` |
| `EMAIL_FROM` | From address (onboarded domain for CF) |
| `EMAIL_FROM_NAME` | Optional display name |
| `RESEND_API_KEY` | Only if `resend` escape hatch |

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
   # CF dashboard / wrangler secrets for non-dev
   EMAIL_TRANSPORT=cf
   EMAIL_FROM=noreply@yourdomain.com
   ```
5. Smoke: `POST /api/demo/email` (session) or forgot-password with a real inbox you control.

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
| Tokens visible in logs | Use kit `sendLog` only (redacts); never custom `console.log` of URL |

---

## Local dogfood

| Path | How |
|---|---|
| **Worker log** | Default: inspect console JSON `transport:"log"` (redacted body) |
| **Mailpit** | Node scripts via `@gosilex/email/server` + compose SMTP — not the Worker bundle |
| **CF remote** | Optional `remote: true` on binding in local wrangler for proxied real sends (ops only) |

Reset E2E: `docs/testing.md` § password reset.  
Invite E2E: `docs/testing.md` § org invites.

---

## Call sites (kit)

| Flow | Code |
|---|---|
| Demo | `services/email.ts` → `resolveEmailPort` |
| Password reset | BA `sendResetPassword` in `lib/better-auth.ts` |
| Org invite | `services/invitations.ts` + route injects port |

Package: `@gosilex/email` — `createEmailPort`, `sendCf`, `redactEmailBody`.
