# Roxabi Circle — product

Gated Discord community (AI + OSS). Entry = GitHub OAuth + PR d’entrée (D11) + heuristic scorer (no LLM on code).

## Lineage (direct)

```text
go-silex/unkillable-kit    (upstream, fetch / merge only; push denied)
        │  merge upstream/main
        ▼
Roxabi/roxabi-circle       (this product — origin)
```

Kit packages live under `packages/@kit/*` and `apps/example-*` (zero-edit). Product code = `apps/circle-api` + `docs/product/*`.

Existing Product functions are adapted to the inherited complexity floor of 15.

Circle declares no separate Product push CI in `config/product/deploy-gate.json`. The inherited Kit CI and Secret scan remain required; `product-semctx.yml` is a PR-only check, not a deploy workflow. Kit CI typechecks the Circle API workspace and includes it in Root coverage through `config/product/coverage-order.txt`.

## Live

| | |
|---|---|
| Worker | https://circle.roxabi.dev |
| Discord | Circle by Roxabi_ · bot Lyra |
| Entry tickets | https://github.com/Roxabi/circle-applications |

## Read first

- [vision.md](./vision.md)
- [decisions.md](./decisions.md) (D1–D14)
- [architecture/scoring.md](./architecture/scoring.md)
- [AGENTS.md](./AGENTS.md)
- [runbooks/discord-setup.md](./runbooks/discord-setup.md)

## Layout (product)

| Path | Role |
|------|------|
| `apps/circle-api` | CF Worker: Discord interactions + Gateway + scoring lib |
| `docs/product/*` | Product SSOT |
| `docs/product/analyses/` | Learnings d’expériences (pas du code) |
| `~/projects/circle-applications` | **Sibling** repo — D11 empty-apply PRs (not nested here) |

## MVP vs later

| Live now | Later |
|---|---|
| `/health`, `/interactions`, Gateway github-watch / news-actu, appeal tickets | GitHub OAuth + collect + score → role |
| Scoring pure + tests | D1 applications / cooldowns |
| | Admin web / MCP ops (not scaffolded) |
