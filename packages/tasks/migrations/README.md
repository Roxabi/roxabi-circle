# Sketches — not the apply path

These SQL files are **historical sketches**. They are **not** exported from this package.

Applied D1 SSoT is `apps/example-api/migrations/*`. Products sync via
`scripts/kit/kit-schema-sync.sh` (catalog id + sha256). See ADR-0008 D3.

Do **not** `wrangler d1 migrations apply` this directory. Do **not** copy these
`NNNN_` filenames into a product app.
