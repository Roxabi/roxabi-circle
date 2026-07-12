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

## Dual mission (priority 2026-07-12)

| Priority | What |
|---|---|
| **P0 now** | **Chemin A boilerplate** — Full Cloudflare monorepo kit (examples verts, packages, CI) |
| **P1 later** | **silex-share product** — artefact host as first consumer app |

Goal brief : [`artifacts/goals/001-chemin-a-boilerplate-goal.md`](artifacts/goals/001-chemin-a-boilerplate-goal.md)  
Product frame (later) : [`artifacts/frames/001-share-platform-frame.md`](artifacts/frames/001-share-platform-frame.md)

Voir [`AGENTS.md`](AGENTS.md) pour stack, sécu IA, merge Free + App `gosilex-ci`.

## Status

- Product frame locked 2026-07-11 (deferred implement).  
- **Boilerplate-first** priority set 2026-07-12.  
- Scaffold kit : not started.

## Repo hygiene (S0)

| Artefact | Rôle |
|---|---|
| [`.github/PULL_REQUEST_TEMPLATE.md`](.github/PULL_REQUEST_TEMPLATE.md) | Checklist sécu + qualité sur chaque PR |
| [`.github/workflows/secret-scan.yml`](.github/workflows/secret-scan.yml) | TruffleHog sur push/PR (`main` / `staging`) |
| [`.github/workflows/merge-on-green.yml`](.github/workflows/merge-on-green.yml) | Merge si label **`reviewed`** + checks green (plan Free) |

**Org `go-silex` = Free private :** branch protection native **indisponible**. Équivalent = merge-on-green + **GitHub App `gosilex-ci`** (comme `roxabi-ci` — **pas de PAT**).

Setup App (one-shot) : [`docs/gosilex-ci-app-setup.md`](docs/gosilex-ci-app-setup.md)

```bash
gh variable set GOSILEX_CI_APP_ID --org go-silex --body '<APP_ID>' --visibility all
gh secret set GOSILEX_CI_APP_PRIVATE_KEY --org go-silex --visibility all < gosilex-ci.pem
```

Flux PR : feature → `staging` · label `reviewed` · Secret scan ✅ · merge via App.  
CI app complète : plus tard (setup CI/CD GOSILEX).
