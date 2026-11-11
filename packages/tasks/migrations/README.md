# Not the apply path

This directory has **no SQL**. It is **not** exported from this package.

SQL identity is catalog **module `id` + `kitSha256`**
(`config/kit/kit-schema-modules.json`). Products sync via
`scripts/kit/kit-schema-sync.sh`.

`apps/example-api/migrations/*` is the **dogfood wrangler journal**.
Do **not** `wrangler d1 migrations apply` this directory.
