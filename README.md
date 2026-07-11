# silex-share

Team artifact host for **go-silex** — publish HTML / images / PDF / multi-file sites / video to a stable URL.

| | |
|---|---|
| **GitHub** | [`go-silex/silex-share`](https://github.com/go-silex/silex-share) (private) |
| **URL** | `https://share.gosilex.com/{slug}` |
| **Shortlinks** | `https://s.gosilex.com/…` (Shlink, best-effort) |
| **Stack** | Chemin A : Bun+Turbo · Workers+Hono · D1+R2 · TanStack SPA · Better Auth · FastMCP — détail [`AGENTS.md`](AGENTS.md) |
| **Frame** | [`artifacts/frames/001-share-platform-frame.md`](artifacts/frames/001-share-platform-frame.md) |
| **Agent** | [`AGENTS.md`](AGENTS.md) |

## Dual mission

1. **Produit** — hébergement d’artefacts équipe (skill + MCP + UI).
2. **Boilerplate Chemin A** — starter Full Cloudflare extractible (qualité, couches, CI, i18n, errors, obs).

Voir [`AGENTS.md`](AGENTS.md) pour stack figée, cookies, erreurs, MCP, observability.

## Status

Frame decisions locked 2026-07-11. Implementation not started.

## Repo hygiene (S0)

| Artefact | Rôle |
|---|---|
| [`.github/PULL_REQUEST_TEMPLATE.md`](.github/PULL_REQUEST_TEMPLATE.md) | Checklist sécu + qualité sur chaque PR |
| [`.github/workflows/secret-scan.yml`](.github/workflows/secret-scan.yml) | TruffleHog sur push/PR (`main` / `staging`) |
| [`.github/workflows/merge-on-green.yml`](.github/workflows/merge-on-green.yml) | Merge si label **`reviewed`** + checks green (plan Free) |

**Org `go-silex` = Free private :** branch protection native **indisponible**. Équivalent = merge-on-green (pattern Roxabi/bouly-site).

Setup one-shot :

```bash
# PAT classic scopes: repo, workflow  (ne pas committer le token)
gh secret set PAT -R go-silex/silex-share
# ou org: gh secret set PAT --org go-silex --visibility private
```

Flux PR : feature → `staging` · label `reviewed` · Secret scan ✅ · auto-merge.  
CI app complète : plus tard (setup CI/CD GOSILEX).
