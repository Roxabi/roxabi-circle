---
title: "Goal — Chemin A Cloudflare SaaS boilerplate (complete)"
status: draft
priority: P0
date: 2026-07-12
repo: go-silex/silex-share
related_frame_product: artifacts/frames/001-share-platform-frame.md
related_spec_deferred: artifacts/specs/001-share-m0-m1-core-spec.md
---

# Goal — Boilerplate Chemin A complet

## One-liner

Livrer un **monorepo starter Full Cloudflare** (Workers · D1 · R2 · React/TanStack · Better Auth · FastMCP · qualité CI) **extractible**, sans métier silex-share — ce repo sert de **berceau** ; share viendra en app P1.

## Why now

- Audits + passation : industrialiser la qualité et un chemin plateforme **A** distinct de Next (B).
- silex-share produit reste utile mais **ne doit pas** dicter le kit (risque pollution domain).
- Alignement Roxabi-boilerplate (process/qualité) avec runtime **Workers** (pas Nest/Next).

## Success (binary)

- [ ] `bun install && bun run lint && bun run typecheck && bun run test` verts à la racine
- [ ] Apps **`example-api`**, **`example-web`**, **`mcp-example`** démarrent en local (wrangler / vite)
- [ ] **Aucune** string métier share (`artifact`, `share/{slug}`, `private_key` product) hors docs produit / frame
- [ ] Packages génériques : au minimum `core`, `config`, `db`, `storage`, `auth`, `ui`, `i18n` (+ mcp, email selon plan goal)
- [ ] Auth demo : session cookies Better Auth **ou** API key hash demo documentée
- [ ] UI : shadcn **Base UI** + TanStack Query/Router/Form shell
- [ ] Erreurs : AppError + requestId API · ApiError FE
- [ ] i18n FR default + EN
- [ ] Email : React Email + **Mailpit** docker-compose local
- [ ] CI GH : secret-scan + lint/typecheck/test (quand pipeline goal le prévoit)
- [ ] Script/job **extract dry-run** : monorepo sans apps métier → still green
- [ ] README kit : Quick Start + carte packages + conventions
- [ ] Merge-on-green via **gosilex-ci** App (ops)

## Explicit non-goals (this goal)

- Features produit share (create/serve artefacts, Shlink, ACL, MCP share_*)
- Billing multi-tenant réel
- Branch protection native (Free) — process + merge-on-green only
- Chemin B Next kit

## Primary users

| Who | Outcome |
|---|---|
| Dev GOSILEX | clone/extract kit → new CF SaaS in hours, not days |
| Agents (Claude/Grok) | AGENTS.md = complete SSoT for scaffold |
| Future share team | consume kit packages instead of reinventing |

## Phasing hint (from AGENTS B0–B6)

```text
B0 monorepo spine → B1 example-api → B2 db/storage → B3 auth
  → B4 example-web → B5 mcp+email → B6 extract CI + obs hooks
```

## Risks

| Risk | Mitigation |
|---|---|
| Empty packages theater | Only create package when example_* uses it |
| Kit looks like share | Extract dry-run + banned product strings in packages |
| Overbuild vs Roxabi Nest | Stay Workers/Hono; steal process not Nest |
| Share urgency returns | Product frame parked; re-SPEC share after goal done |

## Entry for tools

```text
/goal   → use this file as goal brief
/dev    → after goal accepted: frame(kit) if needed → spec kit → plan → implement
```

## Exit

Goal done when success checkboxes pass and team can extract a template without share domain.  
**Then** reopen product: new SPEC from frame `001` for share M0+.
