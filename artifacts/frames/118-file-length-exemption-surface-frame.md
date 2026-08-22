---
title: "fix(quality): add a product-owned file-length exemption surface"
issue: 118
status: approved
tier: F-lite
date: 2026-08-22
---

## Problem

`tools/check_file_length.sh` caps TypeScript at 300 raw lines and currently reads only `tools/file_exemptions.txt`. That register is kit-owned: `tools/` is a zero-edit `protected_prefix`, and the gate still walks `apps/<product>-*`.

A product therefore has no contract-compliant place to declare a temporary local cap. LGU and EtherOs historically appended product paths into `tools/file_exemptions.txt`. That dual-edit weakens zero-edit and then blocks `boilerplate → mirror → product` cascades.

The gap was already named in `artifacts/reviews/architecture-adversarial-panel-2026-08-08.md`: a product-app exemption surface outside the zero-edit zone.

## Who

- **Primary:** product engineers (LGU, EtherOs, next compose) who must keep `quality-gates:check` green without patching kit files.
- **Secondary:** kit maintainers merging upstream into products — kit register must stay kit-only so cascades do not conflict on product god-file lines.

## Constraints

- `tools/file_exemptions.txt` stays the kit-shared register and stays zero-edit protected.
- Product surface is product-owned, likely `config/product/file_exemptions.txt` (same namespace as inheritance / zero-edit exceptions).
- Product may declare explicit caps only for `apps/<product>-*`. Paths under `packages/*`, `apps/example-*`, `apps/mcp-example/*`, `tools/*`, or any other kit zone must fail the gate.
- Caps stay explicit: exceeding the declared N fails. No cap-less bypass, no global wildcard.
- Missing product file is accepted (kit clone / product with no debt).
- `QG_FILE_MODE=staged` and `tree` share one policy.
- Product cannot override or neutralize a kit cap (duplicate path vs kit register fails).
- Do not disable the 300-line default. Do not make kit files consumer-configurable.

## Out of Scope

- Turning off the 300-line limit for product trees.
- Cap-less exemptions or `*` / glob wildcards.
- Letting a product edit `tools/file_exemptions.txt`, `tools/qg.conf`, or `QG_FILE_MAX`.
- Migrating LGU/EtherOs trees in this repo (document the cutover; products delete their kit-file lines after they pull this).
- Folder-size exemptions (`tools/folder_exemptions.txt`) — same class of problem, not this ticket.

## Premise Validity

**Success in 6 months:** product repos declare file-length debt only in a product-owned file; `tools/file_exemptions.txt` lists kit-shared paths only; an upstream merge no longer conflicts on product god-file exemption lines; a product path over its declared cap still fails `quality-gates:check`.

**Failure in 6 months:** a product still ships by patching `tools/file_exemptions.txt`; or a product exemption can list `packages/*` / `apps/example-*` / `tools/*` and pass; or a missing product file fails the kit clone; or a product line without an explicit cap silently bypasses 300.

**Simplest alternative:** docs-only — tell products not to touch `tools/file_exemptions.txt` and force every product file ≤300.
**Why not simplest:** LGU/EtherOs already carry legitimate tracked god-file debt. Without a surface they either violate zero-edit or fail the gate. The adversarial panel already rejected “gate against build” as the product outcome.

## Complexity

**Tier: F-lite** — one quality-gate domain, known files, no new architecture. Size labels do not exist on this repo; auto from scope.

Signals: `check_file_length.sh` + merge/validate + CP-style self-test + consumer-contract / `stack.yml` docs. Multi-file, single domain, no new package.
