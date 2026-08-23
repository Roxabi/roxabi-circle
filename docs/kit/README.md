---
title: "Chemin A kit documentation"
description: "Central index for normative standards, architecture, processes, playbooks, evidence, recipes and templates."
---

# Chemin A kit documentation

This is the central index for every Markdown document under `docs/kit`. Use it to locate the authoritative home for a rule and to distinguish binding policy from runbooks, evidence and illustrative material.

## Authority and navigation

| Home | Authority |
|---|---|
| [This index](./README.md) | Navigation only; it does not create policy |
| [`AGENTS.md`](../../AGENTS.md) | Auto-loaded constitution: mission, precedence, seven invariants and hard rules |
| [Architecture index](./architecture/index.md) | ADR authority model and complete list; each ADR frontmatter owns its status and normativity |
| [Standards](#normative-standards-and-contracts) | Normative when named as a source of truth by the constitution or an accepted ADR |
| [Processes and runbooks](#processes-operations-and-security) | Required operating procedure within their scope; they do not override constitution or ADRs |
| [Playbooks](#onboarding-and-playbooks) | Ordered onboarding guidance built on the contracts |
| [Evidence and decision logs](#evidence-status-and-decision-logs) | Records what was observed or parked; never promote themselves to policy |
| [Recipes and templates](#recipes-and-templates) | Opt-in implementation aids; non-normative unless a binding contract explicitly requires them |
| [Product reference](./reference-product-frame.md) | Explicitly non-normative, non-kit and not an implementation order |

## Normative standards and contracts

- [Stack A–L](./standards/stack.md) — runtime, frontend, auth, packages, quality and architecture choices.
- [Testing strategy](./testing.md) — local gate doctrine, risk tiers and CP inventory.
- [Product consumer contract](./product-consumer-contract.md) — zero-edit upstream, fetch-only remotes and product/kit ownership.
- [`@kit/ui` surface](./ui-kit.md) — owned UI package boundary and component contract.
- [Observability](./observability.md) — logging, redaction, traces and operational visibility.
- [Environment model](./environments.md) — local, staging and production isolation contract.
- [Kit schema sync](./kit-schema-sync.md) — product D1 composition rules aligned with ADR-0008.
- [Debt tracking](./debt-tracking.md) — suppression marker policy and its executable gate.
- [Dependabot security](./security-dependabot.md) — version-update and vulnerability-alert policy.

## Architecture and ADRs

- [Architecture and ADR index](./architecture/index.md) — authority model plus the complete ADR-0001 through ADR-0011 list.
- [Platform direction](./architecture/platform-direction.md) — detailed JTBD, dogfood modes, non-goals and evidence-gated priorities.
- [Platform proof](./architecture/platform-proof.md) — falsifiable evidence ledger for the multi-tenant capability-kernel claim.
- [ADR-0001 — package/app primary axis](./architecture/adr/0001-primary-axis-packages-compose-apps.md).
- [ADR-0002 — Better Auth + Bearer `sk_`](./architecture/adr/0002-session-hmac-interim-vs-better-auth.md).
- [ADR-0003 — multi-tenant RBAC and modules](./architecture/adr/0003-multi-tenant-rbac-modules.md).
- [ADR-0004 — Cloudflare Email transport](./architecture/adr/0004-email-transport-cf-default.md).
- [ADR-0005 — governed flows and durable runs](./architecture/adr/0005-flows-platform-agentic-workflows.md).
- [ADR-0006 — API-key prefix and checksum proposal](./architecture/adr/0006-api-key-format-prefix-checksum.md).
- [ADR-0007 — tasks and comments kernel](./architecture/adr/0007-tasks-comments-kernel.md).
- [ADR-0008 — kit schema identity](./architecture/adr/0008-kit-schema-identity-product-compose.md).
- [ADR-0009 — namespace polarity and inheritance](./architecture/adr/0009-kit-namespace-polarity-inheritance-marker.md).
- [ADR-0010 — list-page cursor envelope](./architecture/adr/0010-list-page-cursor-envelope.md).
- [ADR-0011 — scripts/config polarity](./architecture/adr/0011-tools-fold-scripts-config-polarity.md).

## Processes, operations and security

- [Development process and AI safety](./processes/dev-process.md) — change workflow, secrets, machine gates and human review.
- [Auth abuse response](./auth-abuse-response.md) — rate-limit and audit response procedure.
- [GitHub App `kit-ci` setup](./ci-app-setup.md) — operator setup for merge automation without a PAT.
- [Cloudflare deploy runbook](./deploy-cloudflare.md) — showcase deployment procedure.
- [Cloudflare Email runbook](./email-cf-runbook.md) — binding, allowlist and transport operations.
- [Staging examples](./staging-examples.md) — staging procedure for `example-api` and `example-web`.

## Onboarding and playbooks

- [Start a product](./playbooks/start-product.md) — create a zero-edit consumer of the kit.
- [Start project foundations](./playbooks/start-project.md) — establish the project baseline.
- [From inherited kit to first issue](./playbooks/fork-to-first-issue.md) — progress from inherited kit to a shipped product issue.

## Evidence, status and decision logs

- [Product consumer dogfood evidence](./product-consumer-dogfood-evidence.md) — observed zero-edit consumer proof.
- [Park decisions B8](./park-decisions-b8.md) — current pointer for deliberately deferred choices; not architecture authority.

## Recipes and templates

- [Changelog L1 recipe](./recipes/changelog-l1.md) — optional in-app release-note pattern.
- [Product release GIF template](./templates/release-gifs/README.md) — reusable capture and delivery template.

## Product reference

- [Reference product frame M0–M6](./reference-product-frame.md) — preserved illustrative frame, explicitly outside kit scope and implementation order.
