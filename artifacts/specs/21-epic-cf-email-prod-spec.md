---
title: "Spec — CF Email prod transport (kit)"
issue: 21
spark: 126
status: draft
tier: M
date: 2026-07-30
analysis: artifacts/analyses/21-epic-cf-email-prod-analysis.md
adr: docs/architecture/adr/0004-email-transport-cf-default.md
---

# Spec — Epic · Cloudflare Email Sending

## Goal

Make transactional email **real on Cloudflare Workers** for the kit: binding-based send, env transport switch, safe local fallback, ready for BA reset + org invites.

## Non-goals

| Out |
|---|
| Inbound Email Routing |
| Marketing / bulk |
| Full React Email design system |
| Forcing Resend as default |

## Expected behavior

1. `EMAIL_TRANSPORT=cf` + binding `EMAIL` → `env.EMAIL.send(...)` succeeds when domain onboarded.
2. `log` transport never prints raw reset/invite secrets (redact query tokens).
3. **`EMAIL_TRANSPORT=log` fail-closed** when `ENVIRONMENT` ∈ {`staging`,`production`} (boot or request error — not silent token dumps).
4. Examples/CI default to `log` (dev/test) or mock binding so `validate:full` stays green without domain.
5. `smtp` remains Node-only for Mailpit.
6. example-api demo mail route (or BA `sendResetPassword` hook) uses shared port.
7. Docs: enable domain, wrangler snippet, env table, deliverability checklist (domain onboard = **ops companion**, not kit merge gate).

## Env / wrangler

```toml
# wrangler.toml (sketch)
[[send_email]]
name = "EMAIL"
```

```bash
EMAIL_TRANSPORT=cf          # prod/staging when ready
EMAIL_FROM=noreply@domain
# local:
# EMAIL_TRANSPORT=log
```

## DoD

- [ ] ADR-0004 in tree
- [ ] `sendCf` (or equivalent) in `@gosilex/email` + tests (mock binding)
- [ ] example-api wires transport; fail closed missing binding when `cf`
- [ ] Redaction tests for log transport
- [ ] Fail-closed tests: `log` rejected outside development|test
- [ ] Runbook `docs/` (domain + DNS = ops)
- [ ] `validate:full` green

## Slices

| S | Content |
|---|---|
| S1 | Package transport `cf` + types + tests |
| S2 | example-api env + wrangler binding + service switch |
| S3 | Wire BA reset email sender (even if B3 UI later) |
| S4 | Ops runbook domain + DNS |
