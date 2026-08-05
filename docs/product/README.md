# Roxabi Circle — product

Gated Discord community (AI + OSS). Entry = GitHub OAuth + PR d’entrée (D11) + heuristic scorer (no LLM on code).

## Lineage (direct)

```text
Roxabi/roxabi-cf-template  (upstream, fetch-only)
        │  merge upstream/main
        ▼
Roxabi/roxabi-circle       (this product — origin)
```

Kit packages live under `packages/@kit/*` and `apps/example-*` (zero-edit). Product code = `apps/circle-api` + `docs/product/*`.

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
| `~/projects/circle-applications` | **Sibling** repo — D11 empty-apply PRs (not nested here) |

## MVP vs later

| Live now | Later |
|---|---|
| `/health`, `/interactions`, Gateway github-watch, appeal tickets | GitHub OAuth + collect + score → role |
| Scoring pure + tests | D1 applications / cooldowns |
| | Admin web / MCP ops (not scaffolded) |
