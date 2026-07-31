---
title: "CF Email prod + kit transport — technical analysis"
issue: 21
spark: 126
status: draft
date: 2026-07-30
adr: docs/architecture/adr/0004-email-transport-cf-default.md
---

# Analysis — Epic · Cloudflare Email Sending (prod) + kit transport

## Problem

- Worker path only `sendLog` — cannot deliver reset/invite mail in staging/prod.
- Type allows `resend` but no CF path; Chemin A should prefer CF bindings.
- B3 reset/invites blocked on real transport + token redaction.

## Outcome

- ADR-0004 accepted (docs).
- `@gosilex/email` grows **edge-safe `sendCf`** (binding).
- `example-api` env + wrangler `send_email` binding.
- Demo/reset/invite callers use transport switch; **tokens redacted** on log transport.
- Ops runbook: domain enable + SPF/DKIM/DMARC checklist.

## Shape

**Shape CF-first:** default prod `EMAIL_TRANSPORT=cf`; local `log`|`smtp`; Resend optional escape hatch.

## Risks

| Risk | Mitigation |
|---|---|
| Domain not onboarded | Doc blocked path; fail closed if cf without binding |
| Token leak in logs | Redaction unit tests |
| SMTP imported in Worker | Keep `/server` split |

## Depends

- B2 BA-only (session for reset)
- Pairs with B3 for productized forgot-password / invites
