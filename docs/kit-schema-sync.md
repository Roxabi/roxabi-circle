# Kit schema sync (product D1)

**Normative:** [ADR-0008](./architecture/adr/0008-kit-schema-identity-product-compose.md).  
**Catalog (kit):** `config/kit-schema-modules.json`.  
**Manifest (product, allowed new file):** `apps/<product>-api/kit-schema-manifest.json`.

Identity = catalog **module `id` + sha256 of kit source bytes** — not the example-api `NNNN_` filename.

## Source bytes

Sync hashes and copies **`apps/example-api/migrations/*`** (applied SSoT).  
`packages/*/migrations/*` are sketches until a later ADR promotes them. Do not copy sketches into a product. `@kit/auth` does not export `./migrations/*`. Machine gate: `bun run wrangler-migrations:check` fails if any wrangler `migrations_dir` resolves under `packages/`.

## Happy path (greenfield)

1. Create `apps/<product>-api` that **imports `@kit/*`** — do not `cp -R apps/example-api`.
2. Sync kit modules:

```bash
bash scripts/kit-schema-sync.sh --app apps/<product>-api
# default --modules core  → example-api 0001–0008
```

3. Product domain SQL starts at **`1000_`**. Leave `0009`–`0999` for later kit appends (`NNNN_kit_*`).

Opt-in sets (only if the product **mounts** those routes):

```bash
bash scripts/kit-schema-sync.sh --app apps/<product>-api --modules rbac
bash scripts/kit-schema-sync.sh --app apps/<product>-api --modules all   # every catalogued module — not default
```

`--modules`: `core` (default) · `all` · named sets `rbac` · `audit` · `demo` · `flows` · `tasks`. Catalog is SSoT for ids and source files. Combinators = sync script.

## Existing clone (already copied example-api)

D1 journal = filename. Do **not** rename applied files. Do **not** rewrite `d1_migrations`.

1. Freeze domain history already at `0009`–`0020` (or whatever you applied).
2. Adopt kit files already present. `--adopt` is fail-closed: selected modules must match kit bytes (or already be recorded). It does **not** append missing modules.

```bash
bash scripts/kit-schema-sync.sh --app apps/<product>-api --adopt
# default --modules core — records 0001–0008 clones; unmatched selected ids exit 1
```

Later kit sets append **without** `--adopt`:

```bash
bash scripts/kit-schema-sync.sh --app apps/<product>-api --modules audit
```

3. Later kit modules **append** as local `NNNN_kit_*.sql` (e.g. `0021_kit_rate_limit_audit.sql`).
4. **New** product domain SQL at **`1000_`** — never in `0001`–`0999`.

## Last-resort `cp -R apps/example-api`

If you cloned the dogfood app: run `--adopt` **immediately**, then follow the existing-clone rules. This is not day-0.

## Fail-closed (script)

| Event | Sync |
|-------|------|
| Published module `id` bytes changed (catalog `kitSha256` ≠ live SQL, or recorded product sha ≠ kit) | **Fail** — kit must add a **new** id, never mutate the old one |
| `--adopt` selected module not present (sha/header miss) | **Fail** — lists unmatched ids; does not write a partial manifest |
| Target resolves to `apps/example-*` | **Fail** — example-api **is** the applied SSoT |
| Dest `NNNN_kit_<id>.sql` already exists | **Fail** |
| Kit band `0001`–`0999` exhausted | **Fail** |

Occupied local `NNNN` (including frozen clone domain files): skip that number and append the next free prefix **in 0001–0999**. Product `1000_` files do not occupy kit slots.

Product edits of `apps/example-api/migrations` are forbidden by **zero-edit**, not by this script.

Append-only: never rewrite an applied local file.

## Manifest

Product-owned. JSON keys (see [`templates/kit-schema-manifest.example.json`](./templates/kit-schema-manifest.example.json)): `version`, `app`, `modules.<id>.kitSha256`, `modules.<id>.productFile`. `kitSha256` is the hex sha256 of **kit source bytes** (not of the headed product copy). Do not dual-edit the catalog by hand in a product.

## Not this doc

- Code glue: import `createBetterAuth` from `@kit/auth/factory` (ADR-0008 **D6**). Do not copy `example-api/src/lib/better-auth.ts` as the factory.
- Do not port `demo` / `flows` / `tasks` SQL unless the product mounts those routes.
