# Frame produit de référence — illustratif, non-kit

> **Statut : non normatif pour le kit.** Cette frame conserve l'exemple M0–M6 historique.
> Elle ne fixe ni l'ordre d'implémentation du kit, ni le backlog d'un produit réel. Un produit
> propriétaire doit porter sa propre frame sous `docs/product/` dans son dépôt.

## Product (résumé frame) — non-kit · ¬implementation order

> **Fence :** frame **illustratif** d’un product type (ex. share). **Ne pas** implémenter dans `packages/*` ni brancher en patchant `example-*`. Mission kit + direction kernel + ADR axis **gagnent** en cas de conflit. Détail product → `docs/product/*` ou repo product.

| Domaine | Règle |
|---|---|
| Upload | Membres org (product SoT) |
| Lecture | `public` \| `private_acl` \| `private_key` |
| Auth UI | GitHub OAuth → membership → **session cookie** |
| Auth MCP/skill | API key `sk_…` mint **après** OAuth ; recheck cron ≤24h |
| Shared team key | **interdit** |
| Slug | free-form ; **409** sauf `op=replace` / `DELETE` |
| Storage | folder R2 product-defined |
| Wire | multipart **ou** zip unpack (zip jamais servi tel quel multi-HTML) |
| Gros upload | R2 presigned (vidéo ≤ 500 MiB — **pas** body Worker) |
| Shlink | best-effort |

### Slices MVP (product frame only)

| Slice | Scope |
|---|---|
| **M0** | Worker + R2 + D1 + API key bootstrap + create public + serve |
| **M1** | zip · limits · 409/replace/delete · `private_key` |
| **M2** | presign + vidéo + commit |
| **M3** | GitHub OAuth UI + cookies session + key mint + org recheck |
| **M4** | Shlink |
| **M5** | MCP + skill |
| **M6** | `private_acl` |

---
