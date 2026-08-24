---
title: Extract honours product identity
type: feat
issue: 156
status: validated
---

## TL;DR

After #144, extract treats every tree as kit HEAD: a product app is “unexpected contamination”. Kit and examples stay immutable; a product already has an identity (ADR-0009 D5, same classifier as zero-edit). Extract must reuse that classifier so `apps/<product>-*` is allowed on a product tree and still forbidden on kit HEAD. Unclassified trees fail closed with the same actionable remedy — they do not silently become kit. No new exception register. Residency and compose proofs stay as they are.

## Data model

| Entity | Meaning |
|---|---|
| **Kit tree** | Classified **kit** by ADR-0009 D5 (kit-origin allowlist, no inheritance marker). Only kit example apps exist. |
| **Product tree** | Classified **product** by ADR-0009 D5 (inheritance marker with `upstreamCommit`, and origin not kit-allowlisted). Kit + examples inherited and immutable; product apps added beside them. |
| **Kit example app** | Dogfood only: `example-api`, `example-web`, `example-web-branded`, `mcp-example`. |
| **Product app** | Any other app under `apps/` — complement of the example set. Not a hardcoded product-name list (`share-*`, `lgu-*`, …). |
| **Extract identity** | The ADR-0009 D5 classifier — not a homegrown “marker file exists”. Unclassified → fail closed (actionable message), never silent kit. Env override (`EXTRACT_MODE` / equivalent) is harness-only: same sentinel discipline as `ZERO_EDIT_MODE`. Without sentinel, an override is forbidden on normal lefthook/CI. |
| **Exception register** | Does **not** exist for extract. Dual-edit of the gate is not the product path. |

No new persisted records. No D1 / API / UI types.

## Acceptance

1. A **product tree** that adds product apps (and does not edit kit or examples) passes extract without patching the gate and without a zero-edit exception.
2. A **kit tree** that contains an app outside the example set fails extract.
3. An explicit “treat this tree as kit” override (harness-only) on a product tree still fails on product apps (audit).
4. On a **kit tree**, an explicit permissive override does **not** let an app outside the example set pass — or is rejected unless a harness sentinel is present. Kit HEAD stays fail-closed; `EXTRACT_MODE=mono` is not a free allowlist bypass.
5. Product apps are recognised as “not kit examples”, never by enumerating product names.
6. Residency (no kit-generic tables re-declared under apps) and temp compose (packages stand alone) keep today’s behaviour — this ticket does not add, skip, or relocate them.
7. Extract remains a named step of the single kit bar (`validate:full`). No second bar.

## Out of scope

- Changing what residency or compose prove.
- A product-owned extract exception / skip register (the #118 analog).
- Retiring any product-repo exception entry (none on LGU principal today; inherit is product work).
- The file-length exemption sibling.
- Live inherit of a product repo, deploy wiring, or “don’t deploy examples” (already the consumer contract).
- Widening the banlist or the kit example set.

## Invariants

1. **Grants = sole max power** — unchanged.
2. **Kit + examples are immutable** from a product: extract going green must not require dual-editing them.
3. **One identity** — extract reuses the ADR-0009 D5 classifier; it does not invent a second signal and does not treat “marker file present” as sufficient.
4. **Kit HEAD stays fail-closed** — a stray product app on the kit is still a defect. A permissive extract override cannot green that tree on lefthook/CI.
5. **Product domain never under `packages/**`** — unchanged.
6. **No actor is privileged for being an agent** — unchanged.

## CONTEXT terms

`docs/kit/CONTEXT.md` does not exist. Terms live here:

- [Mental model](../../docs/kit/product-consumer-contract.md#mental-model) — kit vs product apps
- [Zones](../../docs/kit/product-consumer-contract.md#zones) — kit / examples immutable; `apps/<product>-*` product-owned
- [Exceptions](../../docs/kit/product-consumer-contract.md#exceptions-last-resort--justified--time-boxed--traceable) — last-resort dual-edit; not the path for this ticket
- [Inheritance marker](../../docs/kit/product-consumer-contract.md#product-file-configproductinheritancejson) · [ADR-0009](../../docs/kit/architecture/adr/0009-kit-namespace-polarity-inheritance-marker.md) — product identity
- [CP-EXTRACT](../../docs/kit/testing.md#critical-path-inventory-cp-) — extract bar (allowlist, residency, compose)
- [ADR-0001](../../docs/kit/architecture/adr/0001-primary-axis-packages-compose-apps.md) — packages compose apps

issue: #156
