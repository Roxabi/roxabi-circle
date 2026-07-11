# Frame — Silex Share platform

| Field | Value |
|---|---|
| **Status** | approved (decisions locked 2026-07-11) |
| **Product** | Team artifact host — HTML / images / PDF / multi-file sites / video |
| **Repo** | `go-silex/silex-share` (local: `~/projects/gosilex/silex-share/`) |
| **Public URL** | `https://share.gosilex.com/{slug}` |
| **Shortlinks** | `https://s.gosilex.com/{auto}` via Shlink (best-effort) |
| **Org GitHub** | [`go-silex`](https://github.com/go-silex) — **org members only** (not outside collaborators) |
| **CF account** | org Gosilex (`Tool@gosilex.com` / load-cf-env) |
| **Stack** | Full Cloudflare: Worker + R2 + D1 |

---

## Problem

Forge Roxabi = solo + full-site deploy. L’équipe Silex n’a pas de pipeline pour :

1. Publier un artefact unitaire (HTML, zip/folder multi-fichiers, image, PDF, vidéo)
2. L’exposer sur une URL stable `/{slug}`
3. Contrôler upload (équipe) et lecture (public / ACL / clé)
4. Le faire depuis un skill, un MCP, ou une UI

---

## Goals / non-goals

### Goals

- Upload réservé aux **membres org `go-silex`**
- Lecture : `public` \| `private_acl` \| `private_key`
- Slug free-form stable
- Collision slug = **erreur explicite** sauf `op=replace` ou `DELETE`
- TTL artefacts = **permanent** (revoke manuel)
- Shortlink Shlink en parallèle ; échec → warning, upload conservé
- Surfaces : **skill + MCP + UI**

### Non-goals (v1)

- CDN vidéo avancé / HLS / transcoding
- Billing multi-tenant clients
- Remplacer forge Roxabi
- OAuth interactif dans le flux MCP à chaque publish

---

## Decisions locked

### Naming

| Item | Value | Evidence |
|---|---|---|
| GitHub org | **`go-silex`** | `repos.json`, `gh api orgs/go-silex`, README hub |
| Repo | **`silex-share`** | libre (404 GH) ; aligné `silex-site`, `silex-torch` |
| Local dir | `~/projects/gosilex/silex-share/` | convention hub |
| Hostname | **`share.gosilex.com`** | NXDOMAIN 2026-07-11 — libre ; ≠ `s.gosilex.com` (Shlink) |
| Short domain | **`s.gosilex.com`** | Shlink existant (`vps-services/services/shlink`) |

### Auth

| Acteur | Mécanisme |
|---|---|
| UI team | GitHub OAuth → preuve **membership org `go-silex`** → session |
| MCP / skill | **API key** per-user (`sk_…`), mint **uniquement** après OAuth + membership |
| Revalidation | cron Worker ≤24h : left org → revoke keys |
| Outside collab | **non** — member org only |
| Lecture externe | `private_key` (`?k=`) par défaut ; magic link email = option ultérieure |
| Shared team key | **interdit** |

### Visibility (read)

| Mode | Qui lit |
|---|---|
| `public` | tout le monde |
| `private_acl` | users authentifiés (session GitHub) listés sur l’artefact |
| `private_key` | porteur de `?k=` (token haute entropie, hash en D1, révocable, plaintext shown once) |

Upload = toujours authentifié (session ou API key), jamais anonyme.

### Slug & lifecycle

| Op | Comportement |
|---|---|
| `POST` create | slug libre ; si existe → **409** `slug_exists` + message explicite |
| `op=replace` | overwrite atomique (owner/admin only) |
| `DELETE /{slug}` | hard delete R2 + D1 + best-effort unmap Shlink |
| TTL | permanent jusqu’à delete/revoke |

### Transport & storage

| Concept | Règle |
|---|---|
| Storage | **toujours un folder** R2 `share/{slug}/…` |
| Wire | multipart multi-files (paths relatifs) **ou** zip optionnel (unpack serveur) |
| Zip | transport only — jamais servi tel quel pour multi-file HTML |
| Atomicité | staging → validate → commit D1 (flip) → purge staging |
| Index | `index_path` (souvent `index.html`) |

### Limits

| Limit | Value |
|---|---|
| Max files / artefact | **200** |
| Max file (non-vidéo) | **15 MiB** |
| Max file (vidéo `video/*`) | **500 MiB** |
| Max total / artefact | **1536 MiB** (1.5 GiB) — borne ops/R2 |

Upload path :

- petits fichiers (≤ ~20 MiB) → POST Worker → R2
- gros / vidéo → **R2 presigned multipart** (client → R2 direct) ; Worker ne porte pas le body 500 Mo

### Shortlink (Shlink)

```
upload commit OK
  → parallel POST Shlink longUrl=https://share.gosilex.com/{slug}[?k=…]
  → short code = auto (pas de custom slug)
  → success: short_url in response
  → fail: short_url=null, warnings+=["shortlink_failed:…"] ; artefact live
```

---

## Architecture

```
Skill / MCP / UI
       │  Bearer API key  or  GitHub session
       ▼
┌─────────────────────────────┐
│  Worker  share.gosilex.com  │  auth · ACL · validate · commit
└──────────┬──────────────────┘
           │
      ┌────┴────┐
      ▼         ▼
     D1        R2
  meta/ACL/   share/{slug}/…
  keys/users
           │
           └── best-effort → Shlink API → s.gosilex.com/{auto}
```

| Composant | Rôle |
|---|---|
| Worker | routes serve + API upload/list/delete/keys |
| R2 | bytes (folder layout) |
| D1 | artifacts, acl_grants, share_keys, api_keys, uploaders |
| DNS CF | `share.gosilex.com` → Worker |
| Shlink | short URLs (VPS existant) |
| Secrets | CF secrets + Vaultwarden inventaire (Shlink key, GitHub OAuth app) |

---

## API (sketch)

### Create

```http
POST /api/artifacts
Authorization: Bearer sk_…
Content-Type: multipart/form-data

slug, visibility, op?=replace,
files[] + paths  |  zip,
readers[]? (private_acl),
shortlink?=true
```

**409** si slug existe et `op` absent :

```json
{
  "error": "slug_exists",
  "message": "Slug 'foo' already exists. Pass op=replace or DELETE first.",
  "slug": "foo",
  "owner": "github:123",
  "created_at": "…"
}
```

**200** :

```json
{
  "slug": "client-metalyde-arch",
  "url": "https://share.gosilex.com/client-metalyde-arch",
  "short_url": "https://s.gosilex.com/a1b2c",
  "visibility": "private_key",
  "key": "sk_share_…",
  "warnings": []
}
```

### Large upload (vidéo)

```
POST /api/artifacts/init   → upload plan + presigned parts
PUT  <presigned R2 URLs>
POST /api/artifacts/commit → flip live + shortlink best-effort
```

### Serve

```
GET /{slug}
GET /{slug}/…
  public        → R2
  private_key   → require valid ?k=
  private_acl   → require GitHub session ∈ grants
  unknown/bad k → 404 (no existence leak for key mode)
  acl no session→ login redirect
```

---

## Surfaces

| Surface | Auth | Rôle |
|---|---|---|
| **UI** | GitHub OAuth org member | mint keys, drag-drop upload, list, revoke key/delete |
| **MCP tools** | API key | `share_publish`, `share_list`, `share_delete`, `share_replace`, `share_revoke_key` |
| **Skill** | API key (env) | thin client MCP/HTTP — “publish this folder/file to share” |

---

## MCP = membres org only (garantie)

1. **Mint** : impossible sans OAuth GitHub + membership `go-silex`
2. **Use** : Bearer key hashée, liée à `github_user_id`
3. **Recheck** : cron révoque si plus membre
4. **Audit** : chaque publish logué (user, slug, op)
5. **Pas** de key partagée équipe

→ Le MCP n’interroge pas GitHub à chaque call ; la **provenance** de la key garantit l’org, la **revalidation** ferme le trou ex-membre.

---

## Slices (MVP)

| Slice | Scope |
|---|---|
| **M0** | Worker + R2 + D1 + API key hard-mint (bootstrap) + create public + serve `/{slug}` folder |
| **M1** | zip unpack + image/pdf + limits + 409/replace/delete + `private_key` |
| **M2** | R2 presigned + vidéo 500 MiB + commit flow |
| **M3** | GitHub OAuth UI + key mint + org recheck cron |
| **M4** | Shlink best-effort shortlink |
| **M5** | MCP tools + skill |
| **M6** | `private_acl` + readers |

---

## Open (non-bloquant spec)

- Nom exact OAuth GitHub App vs OAuth App (App préférable pour org install)
- CSP / sandbox HTML (script tiers)
- Soft-delete vs hard-delete R2
- Plausible analytics sur `share.gosilex.com` ?

---

## Refs

- Hub : `~/projects/gosilex/README.md` — org `go-silex`
- Shortlink : `vps-services/services/shlink` — `DEFAULT_DOMAIN=s.gosilex.com`
- Contraste solo : Roxabi `roxabi-forge` → `forge` CF Pages (compte Roxabi, pas Gosilex)
- DNS check `share.gosilex.com` : unresolved 2026-07-11
