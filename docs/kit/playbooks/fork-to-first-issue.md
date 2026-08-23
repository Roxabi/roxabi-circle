# From inherited kit to first shipped issue

Short path after [`start-product.md`](./start-product.md). GitHub Fork remains **DENY**.

1. Product repo whose `origin` is the product (not a kit slug) + `upstream` fetch-only + `config/product/inheritance.json` already committed (operator kit parent URL).
2. Capture product intent (frame / brief) in **product** docs (`docs/product/*`).
3. Open tracker issue + GitHub issue.
4. Implement only under `apps/<product>-*` (+ product workflows if needed).
5. If `apps/<product>-api` exists, run `bash scripts/kit/kit-schema-sync.sh --app apps/<product>-api` (manifest is product-owned; kit `validate:full` does **not** check it). Then `bun run validate:full` green · product-validate if apps exist.
6. PR → product `staging` → promote to product `main`. The kit parent has no `staging`.

Kit shared fixes: land on a **kit clone**, then products `fetch`/`merge upstream`.

Details: [`docs/kit/product-consumer-contract.md`](../product-consumer-contract.md).
