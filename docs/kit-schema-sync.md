# Kit schema sync (product D1)

**Normative:** [ADR-0008](./architecture/adr/0008-kit-schema-identity-product-compose.md).  
**Catalog (kit):** `config/kit-schema-modules.json`.  
**Manifest (product, allowed new file):** `apps/<product>-api/kit-schema-manifest.json`.

Identity = catalog **module `id` + sha256 of kit source bytes** — not the example-api `NNNN_` filename.

## Source bytes

Sync hashes and copies **`apps/example-api/migrations/*`** (applied SSoT).  
`packages/*/migrations/*` are sketches until a later ADR promotes them. Do not copy sketches into a product.

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
2. Adopt kit files already present (records manifest without recopying / without colliding numbers):

```bash
bash scripts/kit-schema-sync.sh --app apps/<product>-api --adopt
```

3. Later kit modules **append** as local `NNNN_kit_*.sql` (e.g. `0021_kit_rate_limit_audit.sql`).
4. **New** product domain SQL at **`1000_`** — never in `0001`–`0999`.

## Last-resort `cp -R apps/example-api`

If you cloned the dogfood app: run `--adopt` **immediately**, then follow the existing-clone rules. This is not day-0.

## Fail-closed

| Event | Sync |
|-------|------|
| Published module `id` bytes changed | **Fail** — kit must add a **new** id, not mutate the old one |
| Local `NNNN` already used | **Fail** — pick next free number (`NNNN_kit_*`) |
| Target is `apps/example-*` | No-op / refuse — example-api **is** the SSoT |
| Product edits `apps/example-api/migrations` | Forbidden (zero-edit) |

Append-only: never rewrite an applied local file.

## Manifest

Product-owned. Required facts: `id`, `sha256` (hex of kit source bytes), local filename. JSON keys = sync script (do not dual-edit the catalog by hand in a product).

## Not this doc

- Code glue (`createBetterAuth`, `first_login`, email-port) stays in `example-api` until ADR-0008 **D6** promote.
- Do not port `demo` / `flows` / `tasks` SQL unless the product mounts those routes.
