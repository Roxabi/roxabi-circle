# Start project foundations

Checklist for a new product on this kit: Auth, RBAC, master data, UI shell, tokens.

1. Read [`start-product.md`](./start-product.md) remotes + zero-edit. When `apps/<product>-api` exists, run `bash scripts/kit-schema-sync.sh --app apps/<product>-api` ([`docs/kit-schema-sync.md`](../kit-schema-sync.md)).
2. Decide auth surfaces (session cookie vs `sk_`) — kit ships Better Auth + dual credential.
3. Multi-tenant: org modules / roles as needed (ADR-0003).
4. UI: compose `@kit/ui` in `apps/<product>-web` — CSS token overrides allowed (zero-edit design overrides).
5. Env inventory for product apps (not kit `example-api` only).
6. DoD: kit `validate:full` + product-validate templates under `docs/templates/`.

Operator lineage (kit parent URL): outside this repo.
