# Roxabi Circle — product

Gated Discord community (AI + OSS). Entry = GitHub OAuth + heuristic scorer (no LLM on code).

## Bounce

```
silex-boilerplate → Roxabi/roxabi-cf-template (upstream) → this repo
```

See template: `docs/roxabi/bounce.md` (after merge from upstream).

## Read first

- [vision.md](./vision.md)
- [decisions.md](./decisions.md) (D1–D10)
- [architecture/scoring.md](./architecture/scoring.md)
- [AGENTS.md](./AGENTS.md)

## Layout (product)

| Path | Role |
|------|------|
| `apps/circle-api` | CF Worker product surface (scorer first; Discord/OAuth next) |
| `docs/product/*` | Product SSOT (this tree) |

Kit paths (`packages/*`, `apps/example-*`, root CI) are **zero-edit** vs `upstream` (= `roxabi-cf-template`).
