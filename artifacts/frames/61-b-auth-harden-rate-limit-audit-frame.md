---
title: "B-auth-harden — Rate limit durable + audit BO"
issue: 61
status: approved
tier: F-lite
date: 2026-08-02
spark: 131
---

## Problem

Auth and admin user endpoints already call `assertRateLimit`, but the backend is an **in-memory sliding Map** (`apps/example-api/src/lib/rate-limit.ts`) — **single-isolate demo only**. On Cloudflare Workers multi-isolate, each isolate has its own Map: abuse traffic is not coordinated, and the 429 control is not a production guarantee.

There is **no audit trail** for sensitive BO/auth actions (user create, platform role change, membership add, first login, invite accept). Ops cannot answer “who did what, when?” without grepping unstructured logs, and there is no super_admin list of recent security-relevant events.

**Why now:** B-users (#58), Magic (#59), and B-account (#60) shipped the surfaces that must be rate-limited and audited. AGENTS.md still lists `@gosilex/rate-limit` / audit as P1 stubs; freeze A23 allowed omit until a second consumer — the kit **is** that consumer via example-api + admin paths.

**Observable impact:** Staging/prod multi-isolate can bypass intended login/invite/admin create limits; create-user / role / invite accept leave no durable append-only event for abuse response.

## Who

- **Primary:** Kit operators and platform **super_admin** responding to auth abuse and reviewing sensitive BO actions
- **Secondary:** Product engineers inheriting durable rate-limit + audit patterns; end users protected by effective rate limits (no new UX beyond 429 handling already present)

## Constraints

- **Choose one durable backend** (KV **or** D1) for rate limit counters — document the choice (short note / ADR-lite); keep `assertRateLimit` call-site shape stable where practical
- Surfaces to cover: sign-in, magic link request/verify, password reset, invite create/accept, admin create-user (and related sensitive paths already on the in-memory helper)
- **Audit:** append-only events for at least: `user.created`, `platform_role.set`, `membership.add`, `first_login`, `invite.accept` — **no** passwords, raw tokens, or other secret PII in payload
- **API read:** list recent audit events — **super_admin only**
- Config via env + tests; multi-isolate survival = design + test strategy (not a single-isolate Map)
- Depends shipped: B-users (#58), Magic (#59); complementary: B-account rate-limit paths
- `validate:full` green; short **runbook** for abuse response
- Kit extractibility: 0 product-domain strings; promote to `@gosilex/*` only if 2nd call site or ADR (package rule)
- Optional Email OTP BA plugin — **only if capacity** after rate limit + audit DoD

## Out of Scope

- Full SIEM / Datadog / Better Stack product wiring as the audit store
- Legal retention policies product-specific
- PostHog product analytics
- Shared team API keys
- Replacing Better Auth session model (ADR-0002 BA-only stays)

## Premise Validity

**Success in 6 months:** Auth and admin-sensitive endpoints are rate-limited with a backend that survives multi-isolate Workers; ≥5 critical event types are audited on the paths that fire them; super_admin can list recent events without secrets in payloads; a short abuse-response runbook exists. Products inherit the pattern instead of re-inventing Map-or-nothing.

**Failure in 6 months:** After this epic plus one follow-up cycle, production still relies on the in-memory Map for auth limits **or** still has zero queryable audit on create-user / role / invite / first_login — premise failed; reframe storage choice or abort.

**Simplest alternative:** Keep the Map, document “single isolate only,” and `console.log` sensitive actions.

**Why not simplest:** Multi-isolate Workers make Map-based limits a false control; console logs are not a super_admin-readable trail and fail the JTBD (durable limit + auditable actions).

## Complexity

**Tier: F-lite** — clear dual deliverable (durable rate limit + minimal audit) in the auth/admin domain; storage choice is a documented decision, not open architecture research; no multi-tenant redesign.

Signals:

- Issue body already lists JTBD, scope, DoD, out-of-scope, depends
- Existing `assertRateLimit` call sites + `AppError.rateLimited` are the extension points
- B-users / Magic / B-account surfaces closed and available
- User + `/dev` agreed F-lite (not F-full analyze track)
- Security-sensitive but bounded (no SIEM, no OTP unless capacity)
