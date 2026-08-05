---
title: 'ADR-0001 — Primary axis: platform packages compose deployable apps'
status: accepted
date: 2026-07-12
axial: true
---

# ADR-0001 — Primary axis: platform packages compose deployable apps (Chemin A kit)

## Context

Dual mission monorepo: Chemin A Cloudflare SaaS kit (P0) and future product apps (P1). Without a primary axis, implementers risk N×M drift (auth/errors/storage forked per app, or product domain leaking into packages).

## Axes

1. **Platform concern** — `packages/*` (`@kit/*`)
2. **Deployable** — `apps/*` (examples now; products later)
3. **Product domain** — only under `apps/<product>-*` (e.g. future `share-api`)
4. **Internal layers** (secondary) — routes → services → repos inside each API app

## Decision

**Primary axis = platform packages.** Deployable apps compose packages; they own domain logic and entrypoints only.

**Test:** Adding a second product creates `apps/<name>-*` and imports `@kit/*` — it does not copy AppError/auth/db/storage stacks, and does not add `packages/share-*`.

## Consequences

- New CF SaaS → new apps under `apps/`
- New cross-cutting capability → package when ≥2 call sites or ADR
- Extract dry-run: no product-share compounds under `packages/**` or `apps/example-*/**`
- Product schemas (e.g. artefacts) live in product apps, not `@kit/db`

## Anti-pattern signals

- Product markers under `packages/` (`share/{slug}`, `private_key` product mode, `share_publish`, Shlink)
- Local `class AppError` under `apps/` instead of `@kit/core`
- Same platform helper reimplemented in ≥3 apps (three-strikes → promote package)

## Expected debt

- Domain types not shared across products until a second product needs them
- Example apps must stay non-trivial enough to force real package APIs
- Layer discipline inside apps is process-enforced
