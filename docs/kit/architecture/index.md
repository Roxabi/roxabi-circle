---
title: "Architecture and ADR index"
description: "Authority rules and status index for Chemin A kit architecture decisions."
---

# Architecture and ADR index

This index identifies the architectural authority of every decision record. ADR frontmatter is the source of truth: only `status: accepted` with `normative: true` is binding; proposed or non-normative records remain design input.

## Authority model

| Family | Authority |
|---|---|
| [`AGENTS.md`](../../../AGENTS.md) | Auto-loaded constitution: mission, precedence, invariants and hard agent rules |
| Accepted normative ADR | Binding decision within its stated scope; later accepted ADRs may amend it explicitly |
| [`platform-direction.md`](./platform-direction.md) | Detailed direction under the constitution; not an implementation backlog |
| Proposed or non-normative ADR | Advisory only; it cannot override the constitution or an accepted normative ADR |
| [`platform-proof.md`](./platform-proof.md) | Falsifiable evidence ledger for platform claims, not a decision record |
| [`reference-product-frame.md`](../reference-product-frame.md) | Illustrative product frame; never kit architecture or implementation order |

## Decision records

Each ADR's YAML frontmatter is the sole home of its status, normativity and axial marker; this
index deliberately does not copy those mutable values.

| ADR | Decision |
|---|---|
| [ADR-0001](./adr/0001-primary-axis-packages-compose-apps.md) | Platform packages compose deployable apps |
| [ADR-0002](./adr/0002-session-hmac-interim-vs-better-auth.md) | Better Auth browser sessions + Bearer `sk_` dual path |
| [ADR-0003](./adr/0003-multi-tenant-rbac-modules.md) | Organization tenancy, platform RBAC and dual-level modules |
| [ADR-0004](./adr/0004-email-transport-cf-default.md) | Cloudflare Email transport by environment |
| [ADR-0005](./adr/0005-flows-platform-agentic-workflows.md) | Governed plans and durable runs |
| [ADR-0006](./adr/0006-api-key-format-prefix-checksum.md) | Vendor-prefixed API keys with offline checksum |
| [ADR-0007](./adr/0007-tasks-comments-kernel.md) | Tasks and comments as kit capabilities |
| [ADR-0008](./adr/0008-kit-schema-identity-product-compose.md) | Kit schema identity by module id + hash |
| [ADR-0009](./adr/0009-kit-namespace-polarity-inheritance-marker.md) | Kit/product namespace polarity and inheritance marker |
| [ADR-0010](./adr/0010-list-page-cursor-envelope.md) | Shared list-page cursor envelope |
| [ADR-0011](./adr/0011-tools-fold-scripts-config-polarity.md) | Fold tools into `scripts/kit` and `config/kit` |

## Reading an ADR

1. Read `status` and `normative` before relying on the decision.
2. Follow `related` references for scope and amendments; they do not raise authority by themselves.
3. Resolve conflicts through the precedence rule in [`AGENTS.md`](../../../AGENTS.md), with ADR-0001 as the axial package/app boundary.
4. Record a new ADR when a stack or cross-cutting architecture decision changes; do not turn working notes into implicit policy.
