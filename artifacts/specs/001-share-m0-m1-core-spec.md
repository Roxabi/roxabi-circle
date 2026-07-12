---
title: "SPEC-001 — Public artifact create/serve + slug lifecycle + private_key"
status: superseded
tier: F-lite
issue: null
frame: artifacts/frames/001-share-platform-frame.md
review: artifacts/reviews/2026-07-12-design-multiagent.md
date: 2026-07-12
superseded_by: "Priority flip 2026-07-12 — Chemin A boilerplate first (see AGENTS.md dual mission + upcoming /goal)"
---

# SPEC-001 — Public artifact create/serve + slug lifecycle + private_key

> **SUPERSEDED / DEFERRED.**  
> Priority is now **complete Chemin A boilerplate first**, then silex-share product features.  
> Do not `/plan` or implement this SPEC until the boilerplate goal is done.  
> Product frame `001` remains valid for a later share SPEC.

## Context

| Source | Role |
|---|---|
| **Frame** | [`001-share-platform-frame.md`](../frames/001-share-platform-frame.md) — product SSoT (approved 2026-07-11) |
| **AGENTS** | Stack, dual mission Chemin A, AI safety, Free GH merge |
| **Review** | [`2026-07-12-design-multiagent.md`](../reviews/2026-07-12-design-multiagent.md) — multi-agent design review |

**Promoted-from:** frame only (analyze skipped — F-lite).

**Dual mission (constraint, not parallel product):**

- Primary success = **share live** (this SPEC).
- Kit extractability = constraints on layout (product in app; generic helpers only in packages if needed).
- Do **not** implement full package map, UI, MCP, email, or observability platforms in this SPEC.

---

## Goal

An authenticated operator (bootstrap API key) can publish a **public** multi-file HTML site (or single file) to a **stable URL** `https://share.gosilex.com/{slug}` (or wrangler preview host), with **explicit collision handling**, **replace/delete**, and a first gated mode **`private_key`**.

---

## Users

| Persona | Need |
|---|---|
| **Publisher** (go-silex member / dogfood operator) | Publish folder or files with a key; get URL; replace/delete own artefacts |
| **Reader (public)** | Open URL, no auth |
| **Reader (private_key)** | Open URL only with correct secret |
| **Out of scope this SPEC** | Browser UI login, MCP agent, ACL by username list |

---

## Expected Behavior

1. Operator has a bootstrap `sk_…` (hashed in D1, not a shared team secret for prod forever).
2. `POST /api/artifacts` with multipart files + relative paths creates R2 objects under a product prefix and a D1 row; response includes `url` (and `key` once if `private_key`).
3. `GET /{slug}` serves index; assets resolve under the slug folder.
4. Second create same slug without replace → **409** with clear code/message (no silent overwrite).
5. `op=replace` updates content; `DELETE` removes meta + bytes.
6. `private_key` artefact without/with wrong `k` → **404** (no existence leak for key mode).
7. Oversize / too many files → **413** or **400** with stable code.
8. Errors return AGENTS envelope + `requestId` (no stack traces).

---

## Locked decisions (from multi-agent review)

| ID | Decision |
|---|---|
| **L1 Error envelope** | Public JSON: `{ "error": { "code": string, "message": string }, "requestId": string }` · optional `details` for 409 (`slug`, `created_at` — **not** owner github id to clients) |
| **L2 Bootstrap keys** | Hashed in D1 · flag `bootstrap=true` · allowed only when `ALLOW_BOOTSTRAP_MINT=true` or seeded offline · **must be revocable** · sunset acceptance: M3 OAuth mint revokes all bootstrap keys · never document as team shared key |
| **L3 Product vs kit** | Domain schema, slug rules, R2 product prefix, product error codes live in **app** (`apps/share-api` or single app root until monorepo split). Packages only generic primitives (AppError, requestId, env parse) if extracted |
| **L4 Artefact security (HTML)** | Session cookies (future M3) **must not** apply to artefact HTML responses. M0: no session cookies at all. Before M3: document cookie-less serve path / CSP sandbox plan (open ADR if same host). Minimum M0 headers on artefacts: `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer`, `X-Frame-Options: DENY` (or CSP frame-ancestors none) |
| **L5 private_key wire (M0)** | Create returns plaintext key **once**. Read via query `?k=` **allowed in M0** with `Referrer-Policy: no-referrer` on serve. **M4 Shlink:** longUrl **must not** include `k` (public shortlinks only, or short → slug + separate key entry). SPEC-001 does **not** ship Shlink |
| **L6 Ownership (bootstrap)** | Subject = key id / `bootstrap_subject` on create. Replace/delete = **owner subject only** (no cross-key wipe). No “admin” until M3/M6 |
| **L7 Slug** | Charset: `^[a-z0-9]([a-z0-9-]{0,62}[a-z0-9])?$` (1–64) · reject reserved: `api`, `health`, `.well-known`, empty, `.`, `..` |
| **L8 Paths** | Relative paths only · normalize · resolve under artefact root · reject `..` segments · zip-slip same rules if zip in scope |
| **L9 Atomicity M0** | Documented **best-effort**: write objects then D1 insert; on failure attempt cleanup. Full staging→flip can wait M1/M2 |
| **L10 Monorepo M0** | Prefer **one deployable Worker app** (+ optional `packages/core` only if shared). No empty example/mcp packages required for this SPEC |

---

## Data Model & Consumers

### Core types (D1)

| Entity | Fields (conceptual) | Notes |
|---|---|---|
| **Artifact** | `slug` PK, `visibility` enum(`public`\|`private_key`), `owner_subject`, `index_path`, `created_at`, `updated_at` | M0 no private_acl |
| **ApiKey** | `id`, `key_hash`, `subject`, `bootstrap` bool, `created_at`, `revoked_at` | plaintext never stored |
| **ShareKey** (read) | `artifact_slug`, `key_hash`, `created_at`, `revoked_at` | for private_key mode |

### R2

```text
{product_prefix}/{slug}/…relative path…
```

Default product prefix: `share` (app constant, not kit default forever).

### Consumers

| Consumer | Fields | When |
|---|---|---|
| Create API | all | this SPEC |
| Serve GET | slug, visibility, index, R2 objects | this SPEC |
| private_key check | ShareKey hash | this SPEC |
| MCP / UI / Shlink | — | **future** |

*(Visual sidecars optional for F-lite; deferred to keep SPEC moving.)*

---

## Breadboard

### API affordances

| ID | Affordance | Handler | Data |
|---|---|---|---|
| **N1** | `POST /api/artifacts` | Auth Bearer → validate → store → D1 | Artifact, files, optional ShareKey |
| **N2** | `DELETE /api/artifacts/{slug}` | Auth + owner → R2 delete prefix + D1 | Artifact |
| **N3** | `GET /health` | liveness | — |
| **U1** | `GET /{slug}` | resolve index, visibility gate, stream R2 | Artifact, ShareKey |
| **U2** | `GET /{slug}/*` | path normalize, visibility, stream | same |
| **S1** | Auth middleware | Bearer `sk_…` → ApiKey | ApiKey |

### Create fields

| Field | Required | Notes |
|---|---|---|
| `slug` | yes | L7 |
| `visibility` | yes | `public` \| `private_key` |
| `op` | no | `replace` if exists |
| `index_path` | no | default `index.html` |
| `files` + paths **or** `zip` | one of | multipath preferred; zip optional stretch |

### Response create 200

```json
{
  "slug": "demo",
  "url": "https://share.gosilex.com/demo",
  "visibility": "public",
  "key": null,
  "warnings": [],
  "requestId": "…"
}
```

If `private_key`: `"key": "<plaintext once>"`.

### Error 409

```json
{
  "error": { "code": "SLUG_EXISTS", "message": "…" },
  "requestId": "…",
  "details": { "slug": "demo", "created_at": "…" }
}
```

No `owner` github id in client body (review S1 exposure).

---

## Slices (implementation order inside this SPEC)

| Slice | Demo | Includes |
|---|---|---|
| **S0a** | Health + AppError + requestId | Worker boot, middleware |
| **S0b** | Bootstrap key auth | seed/hash key, 401 without |
| **S0c** | Create public multipath + serve | N1 public + U1/U2 |
| **S0d** | 409 + replace + delete | lifecycle |
| **S0e** | Limits + path safety | L7/L8 + size/count |
| **S0f** | private_key | key once + ?k= + 404 |
| **S0g** *(stretch)* | Zip unpack | zip-slip tests; skip if time |

---

## Success Criteria

### Product

- [ ] With valid bootstrap Bearer key, `POST /api/artifacts` with ≥2 relative files (`index.html` + asset) and `visibility=public` returns **200** and a resolvable `url`
- [ ] `GET {url}` returns **200** HTML for index; asset URL returns **200** with expected content
- [ ] Without Authorization, create returns **401**
- [ ] Create same slug again without `op=replace` returns **409** with code `SLUG_EXISTS` (no silent overwrite)
- [ ] Create with `op=replace` as **same** owner updates content; subsequent GET shows new content
- [ ] Create with `op=replace` as **different** subject returns **403**
- [ ] `DELETE` as owner then `GET /{slug}` returns **404**
- [ ] `visibility=private_key`: create returns plaintext `key` once; GET without `k` → **404**; wrong `k` → **404**; correct `k` → **200**
- [ ] Exceeding max files or max file size returns client error with stable code (not 500)
- [ ] Path containing `..` in upload is rejected
- [ ] Error responses never include stack traces; always include `requestId`
- [ ] Artefact responses include at least nosniff + no-referrer headers (L4)

### Dual-mission / kit hygiene

- [ ] Product-specific table names / R2 prefix / error codes are **not** hardcoded as kit defaults in a shared package used by imaginary second apps (if monorepo: under app path)
- [ ] Bootstrap keys are marked bootstrap and documented for M3 revocation
- [ ] No secrets in repo; `.dev.vars.example` placeholders only

### Out of scope (explicit fail if shipped as “done” for this SPEC)

- [ ] ~~GitHub OAuth UI~~
- [ ] ~~MCP tools / skill~~
- [ ] ~~Shlink~~
- [ ] ~~Video 500 MiB presign~~
- [ ] ~~private_acl~~
- [ ] ~~Mailcatcher / email~~

---

## Edge cases

| Case | Handling |
|---|---|
| Empty file list | 400 `VALIDATION_ERROR` |
| Missing index_path target | 400 or 422 at create validate |
| Concurrent create same slug | one 200, one 409 (D1 unique) |
| Partial R2 write then D1 fail | best-effort cleanup; log requestId |
| Very large single non-video file | reject at limit (15 MiB frame) |
| Content-Type unknown | `application/octet-stream` or sniff carefully; HTML as text/html |
| DELETE non-existent | 404 |
| Serve directory without index | 404 |
| Bootstrap mint disabled in env | cannot create new bootstrap keys; seeded key still works if present |

---

## Limits (this SPEC)

| Limit | Value |
|---|---|
| Max files / artefact | **200** (frame) or lower interim **50** if dogfood — **document chosen value in plan** |
| Max file non-video | **15 MiB** |
| Max total | Interim **100 MiB** (frame 1.5 GiB deferred to M2) |
| Zip | Stretch only; if enabled: max compressed size + reject slip |

---

## Non-goals (this SPEC)

- M2–M6 product surfaces  
- Full Chemin A package factory  
- DNS/prod hard requirement (wrangler.dev acceptable for AC)  
- Branch protection (Free) / gosilex-ci smoke (ops parallel track)  

---

## Open items (≤5, non-blocking plan if defaults OK)

| # | Question | Default |
|---|---|---|
| χ1 | Multipath only vs zip in S0g? | Multipath required; zip stretch |
| χ2 | Interim max total 100 MiB vs 50? | **100 MiB** |
| χ3 | Single app root vs `apps/share-api` day 1? | **`apps/share-api`** if monorepo scaffold; else `src/` single package OK |
| χ4 | Bootstrap: CLI seed vs env `BOOTSTRAP_API_KEY` hash-on-boot? | **Env hash-on-boot** for dogfood + D1 row |
| χ5 | Host for AC: workers.dev vs share.gosilex.com? | **Either**; document URL in demo |

---

## Risks (accepted residual)

| Risk | Mitigation |
|---|---|
| Free plan direct push | Team process; App for bot path only |
| `?k=` in logs/history | no-referrer; no Shlink with k; educate; improve M4 |
| HTML XSS before M3 cookies | No session cookies in M0; L4 headers |
| Bootstrap key leak | Hashed storage; short dogfood; revoke at M3 |

---

## Demo script (acceptance narrative)

```text
1. Seed bootstrap key → POST public multi-file HTML → 200 + url
2. GET url → page + asset work
3. POST same slug → 409 SLUG_EXISTS
4. POST op=replace same key → 200; GET updated
5. POST private_key → key in body once
6. GET without k / bad k → 404; GET ?k=good → 200
7. DELETE → GET 404
8. POST without Authorization → 401
```

---

## Success Criteria (checklist for approval)

- [ ] Scope is M0 + M1-core only (reviewers agree out-of-scope list)
- [ ] L1–L10 locked decisions accepted or explicitly amended
- [ ] Every Success Criteria checkbox above is binary
- [ ] χ ≤ 5 with defaults
- [ ] Ready for `/plan` after approval

---

## Chain

| | |
|---|---|
| **Status** | `draft` — awaiting user **Approve** |
| **Next** | On approve → `status: approved` · commit · `/plan` for M0 implement |
| **Ops parallel** | `docs/gosilex-ci-app-setup.md` (does not block SPEC approve) |
